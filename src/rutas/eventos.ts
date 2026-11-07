// =============================================================================
// src/rutas/eventos.ts — La agenda: eventos e invitaciones a estudiar
// =============================================================================
//
// | Método | Ruta                               | Qué hace                                      | Respuestas            |
// |--------|------------------------------------|-----------------------------------------------|-----------------------|
// | GET    | /api/eventos                       | Mis eventos + las juntadas a las que voy      | 200                   |
// | POST   | /api/eventos                       | Crea un evento (e invita amigos si es estudio)| 201 / 400             |
// | PATCH  | /api/eventos/:id                   | Edita un evento MÍO (toda la serie)           | 200 / 400 / 404       |
// | DELETE | /api/eventos/:id                   | Borra un evento MÍO (todas sus fechas)        | 204 / 404             |
// | POST   | /api/eventos/:id/excepciones       | Borra UNA fecha de un evento que se repite    | 200 / 400 / 404       |
// | POST   | /api/invitaciones/:id/respuesta    | Acepto o rechazo una invitación a estudiar    | 200 / 400 / 404       |
//
// UN EVENTO QUE SE REPITE SE GUARDA UNA SOLA VEZ, con su regla (frecuencia, días,
// hasta cuándo). Las fechas concretas las calcula la app. Los DÍAS de la semana y
// las fechas BORRADAS son filas de sus propias tablas (`EventoDia` y
// `EventoExcepcion`): la app igual los manda y los recibe como listas.
//
// SOLO EL DUEÑO EDITA: si el evento no es del usuario, se responde 404 ("no
// existe un evento TUYO con ese id"): así tampoco se revela que existe.

import { Router } from "express";

import { eventoParaApi, idsDeAmigos, INCLUIR_EVENTO, nombreCompleto, notificar } from "../consultas";
import { prisma } from "../prisma";
import { requiereSesion, usuarioDe } from "../seguridad";
import { esClaveFecha, esHora, leerId, responderError, textoObligatorio } from "../utiles";

export const rutasEventos = Router();
rutasEventos.use(["/eventos", "/invitaciones"], requiereSesion);

const TIPOS = ["clase", "parcial", "entrega", "estudio"];
const FRECUENCIAS = ["nunca", "diaria", "semanal", "quincenal", "mensual"];

const aMinutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Valida el cuerpo de un evento y lo devuelve listo para Prisma, o devuelve el
 * texto del error. Lo usan crear y editar. `dias` vuelve aparte, como lista de
 * números: cada uno se guarda como una fila de `EventoDia`.
 */
async function leerEvento(cuerpo: any) {
  const titulo = textoObligatorio(cuerpo?.titulo, 80);
  if (!titulo) return "Poné un título (hasta 80 letras).";
  if (!TIPOS.includes(cuerpo.tipo)) return "El tipo es clase, parcial, entrega o estudio.";
  if (!esClaveFecha(cuerpo.fecha)) return "La fecha va como AAAA-MM-DD y tiene que existir.";
  if (!esHora(cuerpo.desde) || !esHora(cuerpo.hasta)) return "Las horas van como HH:MM.";
  if (aMinutos(cuerpo.hasta) <= aMinutos(cuerpo.desde)) {
    return "La hora de fin tiene que ser posterior a la de inicio.";
  }
  // Una juntada de estudio NO lleva materia (el título dice de qué es): se ignora.
  const materiaId = cuerpo.tipo === "estudio" || !cuerpo.materiaId ? null : String(cuerpo.materiaId);
  if (materiaId) {
    const materia = await prisma.materia.findUnique({ where: { id: materiaId } });
    if (!materia) return "No existe esa materia.";
  }
  // Una clase SIEMPRE se repite cada semana (la regla del cuatrimestre).
  const frecuencia = cuerpo.tipo === "clase" ? "semanal" : cuerpo.frecuencia ?? "nunca";
  if (!FRECUENCIAS.includes(frecuencia)) return "La frecuencia no es válida.";
  const dias: unknown[] = Array.isArray(cuerpo.dias) ? cuerpo.dias : [];
  if (!dias.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) {
    return "Los días van de 0 (domingo) a 6 (sábado).";
  }
  if (cuerpo.tipo === "clase" && dias.length === 0) return "Elegí al menos un día de cursada.";
  if (cuerpo.repetirHasta !== undefined && cuerpo.repetirHasta !== null) {
    if (!esClaveFecha(cuerpo.repetirHasta) || cuerpo.repetirHasta < cuerpo.fecha) {
      return "«Repetir hasta» tiene que ser una fecha posterior a la primera.";
    }
  }
  return {
    titulo,
    tipo: cuerpo.tipo as string,
    materiaId,
    fecha: cuerpo.fecha as string,
    desde: cuerpo.desde as string,
    hasta: cuerpo.hasta as string,
    lugar: typeof cuerpo.lugar === "string" ? cuerpo.lugar.trim().slice(0, 80) : "",
    notas: typeof cuerpo.notas === "string" && cuerpo.notas.trim() ? cuerpo.notas.trim().slice(0, 500) : null,
    frecuencia,
    repetirHasta: frecuencia !== "nunca" && cuerpo.repetirHasta ? String(cuerpo.repetirHasta) : null,
    // Los días solo importan si se repite. `new Set` saca los repetidos ([1, 1] → [1]):
    // la clave de `EventoDia` es (evento, día) y no admite dos veces el mismo.
    dias: frecuencia !== "nunca" ? [...new Set(dias as number[])] : [],
  };
}

/** Los días como filas para Prisma: [1, 3] → crear `{ dia: 1 }` y `{ dia: 3 }`. */
const filasDeDias = (dias: number[]) => ({ create: dias.map((dia) => ({ dia })) });

/**
 * Invita a los amigos de `invitadosIds` a la juntada `eventoId` (solo a los que
 * son amigos y todavía no estaban invitados) y les manda la notificación.
 */
async function invitar(eventoId: number, organizadorId: number, invitadosIds: number[]) {
  const amigos = await idsDeAmigos(organizadorId);
  const organizador = await prisma.usuario.findUniqueOrThrow({ where: { id: organizadorId } });
  const evento = await prisma.evento.findUniqueOrThrow({ where: { id: eventoId } });
  const materia = evento.materiaId
    ? await prisma.materia.findUnique({ where: { id: evento.materiaId } })
    : null;
  const fecha = evento.fecha.split("-").reverse().join("/"); // "2026-10-28" → "28/10/2026"

  for (const invitadoId of invitadosIds) {
    if (!amigos.includes(invitadoId)) continue; // solo se invita a amigos
    const yaEsta = await prisma.invitacion.findUnique({
      where: { eventoId_invitadoId: { eventoId, invitadoId } },
    });
    if (yaEsta) continue;
    const invitacion = await prisma.invitacion.create({ data: { eventoId, invitadoId } });
    await notificar(invitadoId, {
      tipo: "estudio",
      titulo: `${nombreCompleto(organizador)} te invitó a estudiar`,
      detalle: `${materia?.nombre ?? evento.titulo} · ${fecha} · ${evento.desde} a ${evento.hasta}${evento.lugar ? ` · ${evento.lugar}` : ""}`,
      estudianteId: organizadorId,
      materiaId: evento.materiaId ?? undefined,
      invitacionId: invitacion.id, // el aviso deja responder ESTA invitación
    });
  }
}

/**
 * Saca invitaciones de un evento. Sus avisos todavía sin responder se borran solos:
 * apuntan a la invitación con una clave foránea `ON DELETE CASCADE`.
 */
async function desinvitar(eventoId: number, invitadosIds: number[]) {
  await prisma.invitacion.deleteMany({ where: { eventoId, invitadoId: { in: invitadosIds } } });
}

/** Los ids de amigos a invitar que mandó la app ("12" → 12), sin los inválidos. */
const leerInvitados = (valor: unknown): number[] =>
  (Array.isArray(valor) ? valor : []).map(leerId).filter((id): id is number => id !== null);

// GET /api/eventos
rutasEventos.get("/eventos", async (_req, res) => {
  const usuarioId = usuarioDe(res);
  try {
    const eventos = await prisma.evento.findMany({
      where: {
        OR: [
          { usuarioId }, // los míos
          { invitaciones: { some: { invitadoId: usuarioId, respuesta: "aceptada" } } }, // a los que voy
        ],
      },
      include: INCLUIR_EVENTO,
      orderBy: { fecha: "asc" },
    });
    res.json(eventos.map((e) => eventoParaApi(e, usuarioId)));
  } catch {
    responderError(res, 500, "No se pudo leer tu agenda.");
  }
});

// POST /api/eventos
rutasEventos.post("/eventos", async (req, res) => {
  const usuarioId = usuarioDe(res);
  try {
    const datos = await leerEvento(req.body);
    // Si `leerEvento` devolvió un texto, es el error.
    if (typeof datos === "string") return responderError(res, 400, datos);
    const { dias, ...campos } = datos;
    // El evento y sus días, juntos: Prisma crea las filas de `EventoDia` en el mismo pedido.
    const creado = await prisma.evento.create({ data: { ...campos, usuarioId, dias: filasDeDias(dias) } });
    if (datos.tipo === "estudio") await invitar(creado.id, usuarioId, leerInvitados(req.body.invitadosIds));
    const completo = await prisma.evento.findUniqueOrThrow({ where: { id: creado.id }, include: INCLUIR_EVENTO });
    res.status(201).json(eventoParaApi(completo, usuarioId));
  } catch {
    responderError(res, 500, "No se pudo crear el evento.");
  }
});

// PATCH /api/eventos/:id
// Cambia el evento entero (todas sus fechas). Las fechas borradas sueltas se conservan.
rutasEventos.patch("/eventos/:id", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const id = leerId(req.params.id);
  if (!id) return responderError(res, 400, "El id no es válido.");
  try {
    const evento = await prisma.evento.findFirst({ where: { id, usuarioId } });
    if (!evento) return responderError(res, 404, "No existe un evento tuyo con ese id.");
    const datos = await leerEvento(req.body);
    if (typeof datos === "string") return responderError(res, 400, datos);

    const { dias, ...campos } = datos;
    // Los días se reemplazan: se borran los que tenía (`deleteMany: {}` = todos los
    // de ESTE evento) y se crean los nuevos.
    await prisma.evento.update({
      where: { id },
      data: { ...campos, dias: { deleteMany: {}, ...filasDeDias(dias) } },
    });
    // Los invitados: a los nuevos se los invita y a los que se sacaron, se los saca.
    const quiere = datos.tipo === "estudio" ? leerInvitados(req.body.invitadosIds) : [];
    const actuales = (await prisma.invitacion.findMany({ where: { eventoId: id } })).map((i) => i.invitadoId);
    await desinvitar(id, actuales.filter((invitado) => !quiere.includes(invitado)));
    await invitar(id, usuarioId, quiere);

    const completo = await prisma.evento.findUniqueOrThrow({ where: { id }, include: INCLUIR_EVENTO });
    res.json(eventoParaApi(completo, usuarioId));
  } catch {
    responderError(res, 500, "No se pudo editar el evento.");
  }
});

// DELETE /api/eventos/:id
rutasEventos.delete("/eventos/:id", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const id = leerId(req.params.id);
  if (!id) return responderError(res, 400, "El id no es válido.");
  try {
    const evento = await prisma.evento.findFirst({ where: { id, usuarioId } });
    if (!evento) return responderError(res, 404, "No existe un evento tuyo con ese id.");
    // Con el evento se van, en cascada, sus días, sus fechas borradas, sus
    // invitaciones y los avisos de esas invitaciones que nadie respondió.
    await prisma.evento.delete({ where: { id } });
    res.status(204).end();
  } catch {
    responderError(res, 500, "No se pudo eliminar el evento.");
  }
});

// POST /api/eventos/:id/excepciones
// Body: { fecha: "AAAA-MM-DD" } → esa fecha deja de aparecer ("Eliminar solo este día").
rutasEventos.post("/eventos/:id/excepciones", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const id = leerId(req.params.id);
  if (!id) return responderError(res, 400, "El id no es válido.");
  const fecha = req.body?.fecha;
  if (!esClaveFecha(fecha)) return responderError(res, 400, "La fecha va como AAAA-MM-DD.");
  try {
    const evento = await prisma.evento.findFirst({ where: { id, usuarioId } });
    if (!evento) return responderError(res, 404, "No existe un evento tuyo con ese id.");
    // Una fila nueva en `EventoExcepcion`. `upsert` con `update: {}`: si esa fecha ya
    // estaba borrada, no hace nada (la clave (evento, fecha) no se puede repetir).
    await prisma.eventoExcepcion.upsert({
      where: { eventoId_fecha: { eventoId: id, fecha } },
      update: {},
      create: { eventoId: id, fecha },
    });
    const actualizado = await prisma.evento.findUniqueOrThrow({ where: { id }, include: INCLUIR_EVENTO });
    res.json(eventoParaApi(actualizado, usuarioId));
  } catch {
    responderError(res, 500, "No se pudo borrar esa fecha.");
  }
});

// POST /api/invitaciones/:id/respuesta
// Body: { acepta: true | false }. Al aceptar, la juntada aparece en mi agenda.
rutasEventos.post("/invitaciones/:id/respuesta", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const id = leerId(req.params.id);
  if (!id) return responderError(res, 400, "El id no es válido.");
  if (typeof req.body?.acepta !== "boolean") return responderError(res, 400, "Falta «acepta» (true o false).");
  const acepta: boolean = req.body.acepta;
  try {
    const invitacion = await prisma.invitacion.findFirst({
      where: { id, invitadoId: usuarioId },
      include: { evento: true, invitado: true },
    });
    if (!invitacion) return responderError(res, 404, "No existe una invitación tuya con ese id.");

    const respuesta = acepta ? "aceptada" : "rechazada";
    await prisma.invitacion.update({ where: { id }, data: { respuesta } });
    // Mi aviso deja de estar pendiente (se suelta de la invitación) y guarda cómo respondí.
    await prisma.notificacion.updateMany({
      where: { usuarioId, invitacionId: id },
      data: { invitacionId: null, respuesta, leida: true },
    });
    // Y al organizador le llega la respuesta.
    await notificar(invitacion.evento.usuarioId, {
      tipo: "estudio",
      titulo: `${nombreCompleto(invitacion.invitado)} ${acepta ? "aceptó" : "rechazó"} tu invitación`,
      detalle: invitacion.evento.titulo,
      estudianteId: usuarioId,
      materiaId: invitacion.evento.materiaId ?? undefined,
    });
    res.json({ id: String(id), respuesta });
  } catch {
    responderError(res, 500, "No se pudo responder la invitación.");
  }
});
