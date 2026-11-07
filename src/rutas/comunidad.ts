// =============================================================================
// src/rutas/comunidad.ts — Compañeros, perfiles, amistades, links y novedades
// =============================================================================
//
// | Método | Ruta                              | Qué hace                                       | Respuestas      |
// |--------|-----------------------------------|------------------------------------------------|-----------------|
// | GET    | /api/estudiantes                  | Los demás estudiantes y mi relación con cada uno| 200            |
// | GET    | /api/estudiantes/:id              | Perfil: notas y apuntes SEGÚN SU PRIVACIDAD    | 200 / 404       |
// | POST   | /api/amistades/:id                | Le mando una solicitud (o acepto la suya)      | 200 / 400 / 404 |
// | DELETE | /api/amistades/:id                | Retiro la solicitud que le mandé               | 204 / 404       |
// | POST   | /api/amistades/:id/respuesta      | Acepto o rechazo la solicitud que me mandó     | 200 / 400 / 404 |
// | GET    | /api/links                        | Los links oficiales de las materias            | 200             |
// | GET    | /api/novedades                    | Los avisos institucionales                     | 200             |
//
// LA PRIVACIDAD SE APLICA ACÁ, EN EL SERVIDOR:
//   Si un estudiante comparte sus notas "solo con amigos" y quien pregunta no es
//   su amigo, el servidor NO manda esas notas (manda la lista vacía y
//   `visible: false`). No alcanzaría con que la app las escondiera: los datos
//   ya habrían viajado al teléfono.

import { Router } from "express";

import {
  apunteParaApi,
  estadosDe,
  idsDeAmigos,
  materiasDe,
  nombreCompleto,
  notificar,
  puedeVer,
  relacionEntre,
  rutaDeArchivo,
} from "../consultas";
import { prisma } from "../prisma";
import { requiereSesion, usuarioDe } from "../seguridad";
import { leerId, responderError } from "../utiles";

export const rutasComunidad = Router();
rutasComunidad.use(["/estudiantes", "/amistades", "/links", "/novedades"], requiereSesion);

/** Un estudiante como lo ve `yo`: qué cursa, cuántos amigos tiene y qué somos. */
async function estudianteParaApi(yo: number, otroId: number) {
  const otro = await prisma.usuario.findUniqueOrThrow({ where: { id: otroId } });
  const [estados, amigos, relacion] = await Promise.all([
    estadosDe(otroId),
    idsDeAmigos(otroId),
    relacionEntre(yo, otroId),
  ]);
  return {
    id: String(otro.id),
    nombre: nombreCompleto(otro),
    foto: rutaDeArchivo(otro.foto),
    cuatrimestre: otro.cuatrimestre,
    // Las materias que está cursando AHORA (de ahí salen las "en común").
    materias: Object.keys(estados).filter((materiaId) => estados[materiaId] === "cursando"),
    amigos: amigos.length,
    relacion,
    privacidad: { apuntes: otro.verApuntes, notas: otro.verNotas },
  };
}

// GET /api/estudiantes
rutasComunidad.get("/estudiantes", async (_req, res) => {
  const yo = usuarioDe(res);
  try {
    const otros = await prisma.usuario.findMany({ where: { id: { not: yo } }, orderBy: { nombre: "asc" } });
    res.json(await Promise.all(otros.map((otro) => estudianteParaApi(yo, otro.id))));
  } catch {
    responderError(res, 500, "No se pudo leer la lista de compañeros.");
  }
});

// GET /api/estudiantes/:id
rutasComunidad.get("/estudiantes/:id", async (req, res) => {
  const yo = usuarioDe(res);
  const id = leerId(req.params.id);
  if (!id || id === yo) return responderError(res, 400, "El id no es válido.");
  try {
    const existe = await prisma.usuario.findUnique({ where: { id } });
    if (!existe) return responderError(res, 404, "No existe ese estudiante.");
    const base = await estudianteParaApi(yo, id);

    const verNotas = puedeVer(existe.verNotas, base.relacion);
    const verApuntes = puedeVer(existe.verApuntes, base.relacion);

    // Las notas: SOLO si se pueden ver se calculan y se mandan.
    const aprobadas = verNotas
      ? (await materiasDe(id))
          .filter((m) => m.estado === "aprobada" && m.notaFinal !== undefined)
          .map((m) => ({ materiaId: m.id, nota: m.notaFinal as number }))
      : [];
    const promedio =
      aprobadas.length > 0 ? aprobadas.reduce((suma, a) => suma + a.nota, 0) / aprobadas.length : null;

    // Los apuntes: la CANTIDAD siempre (para el candado), la lista solo si se puede.
    const apuntes = await prisma.apunte.findMany({
      where: { usuarioId: id },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
    });

    res.json({
      ...base,
      notas: { visible: verNotas, promedio, aprobadas },
      apuntes: {
        visible: verApuntes,
        cantidad: apuntes.length,
        lista: verApuntes ? apuntes.map(apunteParaApi) : [],
      },
    });
  } catch {
    responderError(res, 500, "No se pudo leer el perfil.");
  }
});

// POST /api/amistades/:id
// Le mando una solicitud. Si ÉL ya me había mandado una, esto la acepta.
rutasComunidad.post("/amistades/:id", async (req, res) => {
  const yo = usuarioDe(res);
  const otro = leerId(req.params.id);
  if (!otro || otro === yo) return responderError(res, 400, "El id no es válido.");
  try {
    const destinatario = await prisma.usuario.findUnique({ where: { id: otro } });
    if (!destinatario) return responderError(res, 404, "No existe ese estudiante.");
    const relacion = await relacionEntre(yo, otro);

    if (relacion === "recibida") {
      await aceptarSolicitud(otro, yo); // me la había mandado: quedamos amigos
    } else if (relacion === "ninguna") {
      const solicitud = await prisma.solicitud.create({ data: { deId: yo, paraId: otro } });
      const emisor = await prisma.usuario.findUniqueOrThrow({ where: { id: yo } });
      await notificar(otro, {
        tipo: "amistad",
        titulo: `${nombreCompleto(emisor)} te mandó una solicitud de amistad`,
        detalle: "Tocá para ver su perfil",
        estudianteId: yo,
        solicitudId: solicitud.id, // el aviso deja responder ESTA solicitud
      });
    }
    // "amigos" o "enviada": no hay nada que hacer.
    res.json({ relacion: await relacionEntre(yo, otro) });
  } catch {
    responderError(res, 500, "No se pudo mandar la solicitud.");
  }
});

// DELETE /api/amistades/:id
// Retiro una solicitud que mandé y todavía no fue respondida.
rutasComunidad.delete("/amistades/:id", async (req, res) => {
  const yo = usuarioDe(res);
  const otro = leerId(req.params.id);
  if (!otro) return responderError(res, 400, "El id no es válido.");
  try {
    const borradas = await prisma.solicitud.deleteMany({
      where: { deId: yo, paraId: otro, estado: "pendiente" },
    });
    if (borradas.count === 0) return responderError(res, 404, "No le mandaste una solicitud pendiente.");
    // Su aviso pendiente ya no tiene sentido: se borró solo, porque apunta a la
    // solicitud con una clave foránea `ON DELETE CASCADE`.
    res.status(204).end();
  } catch {
    responderError(res, 500, "No se pudo retirar la solicitud.");
  }
});

/** Acepta la solicitud que `deId` le mandó a `paraId` y le avisa a quien la mandó. */
async function aceptarSolicitud(deId: number, paraId: number) {
  const solicitud = await prisma.solicitud.update({
    where: { deId_paraId: { deId, paraId } },
    data: { estado: "aceptada" },
  });
  // Mi aviso deja de estar pendiente (se suelta de la solicitud) y guarda la respuesta.
  await prisma.notificacion.updateMany({
    where: { usuarioId: paraId, solicitudId: solicitud.id },
    data: { solicitudId: null, respuesta: "aceptada", leida: true },
  });
  const quienAcepta = await prisma.usuario.findUniqueOrThrow({ where: { id: paraId } });
  await notificar(deId, {
    tipo: "amistad",
    titulo: `Ahora sos amigo de ${nombreCompleto(quienAcepta)}`,
    detalle: "Aceptó tu solicitud de amistad",
    estudianteId: paraId,
  });
}

// POST /api/amistades/:id/respuesta
// Body: { acepta: true | false } sobre la solicitud que ME mandó el estudiante :id.
rutasComunidad.post("/amistades/:id/respuesta", async (req, res) => {
  const yo = usuarioDe(res);
  const otro = leerId(req.params.id);
  if (!otro) return responderError(res, 400, "El id no es válido.");
  if (typeof req.body?.acepta !== "boolean") return responderError(res, 400, "Falta «acepta» (true o false).");
  try {
    const solicitud = await prisma.solicitud.findFirst({
      where: { deId: otro, paraId: yo, estado: "pendiente" },
    });
    if (!solicitud) return responderError(res, 404, "No tenés una solicitud pendiente de ese estudiante.");

    if (req.body.acepta) {
      await aceptarSolicitud(otro, yo);
    } else {
      // Rechazar = borrar la solicitud (podrá volver a mandarla más adelante). PRIMERO
      // se suelta mi aviso (así queda, con la respuesta): si siguiera apuntando a la
      // solicitud, el borrado en cascada se lo llevaría.
      await prisma.$transaction([
        prisma.notificacion.updateMany({
          where: { usuarioId: yo, solicitudId: solicitud.id },
          data: { solicitudId: null, respuesta: "rechazada", leida: true },
        }),
        prisma.solicitud.delete({ where: { id: solicitud.id } }),
      ]);
    }
    res.json({ relacion: await relacionEntre(yo, otro) });
  } catch {
    responderError(res, 500, "No se pudo responder la solicitud.");
  }
});

// GET /api/links
rutasComunidad.get("/links", async (_req, res) => {
  try {
    const links = await prisma.linkOficial.findMany({ orderBy: { id: "asc" } });
    res.json(links.map((link) => ({ ...link, id: String(link.id) })));
  } catch {
    responderError(res, 500, "No se pudieron leer los links.");
  }
});

// GET /api/novedades
rutasComunidad.get("/novedades", async (_req, res) => {
  try {
    const novedades = await prisma.novedad.findMany({ orderBy: { id: "asc" } });
    res.json(novedades.map((novedad) => ({ ...novedad, id: String(novedad.id) })));
  } catch {
    responderError(res, 500, "No se pudieron leer las novedades.");
  }
});
