// =============================================================================
// src/consultas.ts — Consultas que usan varias rutas, y la "forma" de lo que se devuelve
// =============================================================================
//
// QUÉ HAY ACÁ:
//   1. Consultas compartidas: las materias de un usuario (con su estado calculado),
//      quiénes son sus amigos, qué relación hay entre dos usuarios.
//   2. `notificar`: crea una notificación para alguien.
//   3. Las funciones "...ParaApi": convierten una fila de la base en el JSON que
//      espera la app. Es el CONTRATO entre las dos partes [PRÁCTICA 03]: la app
//      usa ids de texto ("12"), listas de verdad y nunca recibe campos internos
//      (como el hash de la contraseña).
//
// LA BASE ESTÁ NORMALIZADA, LA API NO CAMBIÓ:
//   Lo que en la base quedó repartido en varias tablas (los días de un evento, la
//   carrera de un usuario...) se vuelve a juntar acá con `include` (Prisma trae la
//   fila y sus relacionadas en un solo pedido). Así la app recibe el mismo JSON de
//   siempre y no hubo que tocarla.

import type {
  Apunte,
  Carrera,
  Notificacion,
  Prisma,
  Recurso,
  Solicitud,
  Usuario,
} from "@prisma/client";

import { esPdf } from "./archivos";
import { prisma } from "./prisma";
import { cursadaAprobada, recorrerHistorial, resolverMateria, type EstadoMateria } from "./reglas";
import { fechaParaApi } from "./utiles";

export type Relacion = "amigos" | "enviada" | "recibida" | "ninguna";

/** "Mariana Sosa". */
export const nombreCompleto = (u: Pick<Usuario, "nombre" | "apellido">) =>
  `${u.nombre} ${u.apellido}`;

/** Una foto guardada ("3f9a.jpg") → la ruta que la sirve ("/uploads/3f9a.jpg"). */
export const rutaDeArchivo = (archivo: string | null | undefined) =>
  archivo ? `/uploads/${archivo}` : undefined;

// -----------------------------------------------------------------------------
// Usuarios
// -----------------------------------------------------------------------------

/** Lo que se pide junto con un usuario para devolverlo: su carrera (de ahí sale la facultad). */
export const CON_CARRERA = { carrera: true } as const;

/** El usuario como lo ve la app: SIN el hash ni la sal de la contraseña. */
export function usuarioParaApi(u: Usuario & { carrera: Carrera }) {
  return {
    id: String(u.id),
    nombre: u.nombre,
    apellido: u.apellido,
    email: u.email,
    dni: u.dni ?? undefined,
    // En la base es "2001-03-15"; la app la muestra y la edita como "15/03/2001".
    fechaNacimiento: u.fechaNacimiento ? fechaParaApi(u.fechaNacimiento) : undefined,
    // La facultad no se guarda en el usuario: es la de su carrera.
    facultad: u.carrera.facultadId,
    carrera: u.carreraId,
    cuatrimestre: u.cuatrimestre,
    foto: rutaDeArchivo(u.foto),
    privacidad: { apuntes: u.verApuntes, notas: u.verNotas },
  };
}

// -----------------------------------------------------------------------------
// Materias
// -----------------------------------------------------------------------------

/**
 * La dificultad que se muestra de una materia: el PROMEDIO de las estrellas de las
 * reseñas de los estudiantes (`suma` de estrellas entre `cantidad` de reseñas).
 * Mientras nadie reseñó, se muestra la estimación inicial del plan (`inicial`) y
 * `resenias` vale 0.
 *
 * Se calcula en CADA lectura (es un dato DERIVADO: guardarlo sería repetir lo que ya
 * dicen las reseñas). Por eso, cada vez que alguien entra a la materia, ve la
 * dificultad con las reseñas que hay en ese momento.
 */
function dificultadDe(inicial: number, suma: number, cantidad: number) {
  if (cantidad === 0) return { dificultad: inicial, resenias: 0 };
  return { dificultad: Math.round((suma / cantidad) * 100) / 100, resenias: cantidad };
}

/**
 * Un recurso oficial como lo ve la app. En la base no hay columna "categoría"
 * (todos los recursos son oficiales): la app la sigue recibiendo para saber en qué
 * solapa mostrarlo.
 */
const recursoParaApi = (r: Recurso) => ({
  id: String(r.id),
  materiaId: r.materiaId,
  nombre: r.nombre,
  formato: r.formato,
  peso: r.peso,
  categoria: "oficiales" as const,
});

/**
 * Las materias de un usuario como las usa la app: el plan de SU carrera, sus
 * recursos, sus correlativas, la dificultad con las reseñas de hoy, y el ESTADO
 * calculado con las correlativas, si arrancó la cursada y su historial
 * (`resolverMateria`).
 */
export async function materiasDe(usuarioId: number) {
  const { carreraId } = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { carreraId: true },
  });

  // Las lecturas se piden juntas: `Promise.all` espera a que terminen todas.
  const [plan, cursadas, historial, reseniasTotales, misResenias] = await Promise.all([
    prisma.materia.findMany({
      where: { carreraId },
      // Junto con cada materia, sus recursos y sus correlativas (otras tablas).
      include: {
        recursos: { orderBy: { id: "asc" } },
        correlativas: { orderBy: { requiereId: "asc" } },
      },
      orderBy: [{ cuatrimestre: "asc" }, { id: "asc" }],
    }),
    // Las cursadas que ARRANCÓ (si no hay fila, no la arrancó).
    prisma.cursada.findMany({ where: { usuarioId } }),
    // En el orden en que se cargó: el recorrido depende del orden.
    prisma.instancia.findMany({ where: { usuarioId }, orderBy: { id: "asc" } }),
    // Por materia: cuántas reseñas hay y cuántas estrellas suman (de TODOS).
    prisma.resenia.groupBy({
      by: ["materiaId"],
      _sum: { estrellas: true },
      _count: { _all: true },
    }),
    prisma.resenia.findMany({ where: { usuarioId } }),
  ]);

  // PASADA 1: el recorrido de cada materia con SU historial. Alcanza para saber si
  // la cursada está aprobada, que es lo que piden las correlativas de las demás.
  const arranco = (materiaId: string) => cursadas.some((c) => c.materiaId === materiaId);
  const historialDe = (materiaId: string) => historial.filter((i) => i.materiaId === materiaId);
  const cursadaAprobadaDe = (materiaId: string) =>
    arranco(materiaId) && cursadaAprobada(recorrerHistorial(historialDe(materiaId)).estado);

  // PASADA 2: el estado final de cada una.
  return plan.map((materia) => {
    const cumplidas = materia.correlativas.every((c) => cursadaAprobadaDe(c.requiereId));
    const resultado = resolverMateria(arranco(materia.id), cumplidas, historialDe(materia.id));

    const total = reseniasTotales.find((r) => r.materiaId === materia.id);
    const { dificultad, resenias } = dificultadDe(
      materia.dificultadInicial,
      total?._sum.estrellas ?? 0,
      total?._count._all ?? 0
    );

    return {
      id: materia.id,
      nombre: materia.nombre,
      cuatrimestre: materia.cuatrimestre,
      creditos: materia.creditos,
      profesor: materia.profesor,
      dificultad,
      resenias,
      miResenia: misResenias.find((r) => r.materiaId === materia.id)?.estrellas,
      // Qué materias hay que tener con la cursada aprobada, y si ya se cumple cada una.
      correlativas: materia.correlativas.map((c) => ({
        id: c.requiereId,
        nombre: plan.find((m) => m.id === c.requiereId)?.nombre ?? c.requiereId,
        cumplida: cursadaAprobadaDe(c.requiereId),
      })),
      recursos: materia.recursos.map(recursoParaApi),
      estado: resultado.estado,
      notaFinal: resultado.notaFinal,
      finCursada: resultado.finCursada,
      intento: resultado.intento,
      historial: resultado.pasos.map((paso) => ({
        intento: paso.intento,
        efecto: paso.efecto,
        instancia: {
          id: String(paso.instancia.id),
          materiaId: paso.instancia.materiaId,
          tipo: paso.instancia.tipo,
          nota: paso.instancia.nota,
          fecha: paso.instancia.fecha,
          // `|| undefined`: si es `false`, el campo no viaja (igual que en la app).
          cierraCursada: paso.instancia.cierraCursada || undefined,
          recursa: paso.instancia.recursa || undefined,
        },
      })),
    };
  });
}

/** Solo el estado de cada materia de un usuario: `{ "MAT-201": "cursando", ... }`. */
export async function estadosDe(usuarioId: number): Promise<Record<string, EstadoMateria>> {
  const materias = await materiasDe(usuarioId);
  return Object.fromEntries(materias.map((m) => [m.id, m.estado]));
}

// -----------------------------------------------------------------------------
// Amistad
// -----------------------------------------------------------------------------

/** Los ids de los amigos de un usuario (solicitudes aceptadas, en cualquier sentido). */
export async function idsDeAmigos(usuarioId: number): Promise<number[]> {
  const aceptadas = await prisma.solicitud.findMany({
    where: { estado: "aceptada", OR: [{ deId: usuarioId }, { paraId: usuarioId }] },
  });
  // De cada amistad, el OTRO.
  return aceptadas.map((s) => (s.deId === usuarioId ? s.paraId : s.deId));
}

/** Qué relación tiene `yo` con `otro`. */
export async function relacionEntre(yo: number, otro: number): Promise<Relacion> {
  const solicitud = await prisma.solicitud.findFirst({
    where: {
      OR: [
        { deId: yo, paraId: otro },
        { deId: otro, paraId: yo },
      ],
    },
  });
  if (!solicitud) return "ninguna";
  if (solicitud.estado === "aceptada") return "amigos";
  return solicitud.deId === yo ? "enviada" : "recibida";
}

/** ¿Se puede ver algo que el dueño comparte con `visibilidad`? */
export const puedeVer = (visibilidad: string, relacion: Relacion) =>
  visibilidad === "todos" || relacion === "amigos";

// -----------------------------------------------------------------------------
// Notificaciones
// -----------------------------------------------------------------------------

type DatosNotificacion = {
  tipo: "apunte" | "amistad" | "estudio" | "calendario";
  titulo: string;
  detalle: string;
  estudianteId?: number;
  materiaId?: string;
  /** La solicitud de amistad que este aviso deja responder. */
  solicitudId?: number;
  /** La invitación a estudiar que este aviso deja responder. */
  invitacionId?: number;
};

/** Le crea una notificación a `usuarioId` (le va a aparecer en la campana). */
export async function notificar(usuarioId: number, datos: DatosNotificacion) {
  await prisma.notificacion.create({ data: { usuarioId, ...datos } });
}

/**
 * El aviso como lo ve la app. Lo que espera respuesta viaja como `pendiente`:
 *   - una solicitud de amistad → `{ clase: "solicitud", id: <quien la mandó> }` (la
 *     app responde con `/api/amistades/<ese id>/respuesta`);
 *   - una invitación → `{ clase: "invitacion", id: <la invitación> }`.
 * Por eso, para las de amistad, se pide el aviso con su solicitud (`include`).
 */
export function notificacionParaApi(n: Notificacion & { solicitud: Solicitud | null }) {
  const pendiente = n.solicitud
    ? { clase: "solicitud" as const, id: String(n.solicitud.deId) }
    : n.invitacionId
      ? { clase: "invitacion" as const, id: String(n.invitacionId) }
      : undefined;
  return {
    id: String(n.id),
    tipo: n.tipo,
    tipoEvento: n.tipoEvento ?? undefined,
    titulo: n.titulo,
    detalle: n.detalle,
    creadaEn: n.creadaEn.toISOString(),
    leida: n.leida,
    estudianteId: n.estudianteId ? String(n.estudianteId) : undefined,
    materiaId: n.materiaId ?? undefined,
    pendiente,
    respuesta: n.respuesta ?? undefined,
  };
}

// -----------------------------------------------------------------------------
// Apuntes y eventos
// -----------------------------------------------------------------------------

/**
 * El apunte como lo ve la app. El archivo va como ruta: la app le agrega la URL del
 * servidor. Si se trae con su autor (`include: { autor: true }`), va también su nombre.
 */
export function apunteParaApi(a: Apunte & { autor?: Pick<Usuario, "nombre" | "apellido"> }) {
  return {
    id: String(a.id),
    autorId: String(a.usuarioId),
    autorNombre: a.autor ? nombreCompleto(a.autor) : undefined,
    materiaId: a.materiaId,
    titulo: a.titulo,
    descripcion: a.descripcion ?? undefined,
    fecha: a.fecha,
    uri: rutaDeArchivo(a.archivo),
    // "pdf" o "imagen": la app decide cómo previsualizarlo.
    formato: a.archivo ? (esPdf(a.archivo) ? "pdf" : "imagen") : undefined,
  };
}

/**
 * Lo que se pide junto con cada evento: su organizador, sus días, sus fechas
 * borradas y sus invitaciones (con el invitado). Lo usan todas las rutas de eventos.
 */
export const INCLUIR_EVENTO = {
  organizador: true,
  dias: { orderBy: { dia: "asc" } },
  excepciones: { orderBy: { fecha: "asc" } },
  invitaciones: { include: { invitado: true } },
} satisfies Prisma.EventoInclude;

/** Un evento con todo lo de `INCLUIR_EVENTO` (Prisma arma el tipo solo). */
type EventoCompleto = Prisma.EventoGetPayload<{ include: typeof INCLUIR_EVENTO }>;

/**
 * El evento como lo ve `usuarioId`. Si es suyo, con los invitados y sus
 * respuestas; si lo organiza otro (una invitación aceptada), con el organizador.
 * Los días y las fechas borradas, que en la base son filas, viajan como listas.
 */
export function eventoParaApi(e: EventoCompleto, usuarioId: number) {
  const esMio = e.usuarioId === usuarioId;
  const miInvitacion = e.invitaciones.find((inv) => inv.invitadoId === usuarioId);
  return {
    id: String(e.id),
    titulo: e.titulo,
    tipo: e.tipo,
    materiaId: e.materiaId ?? undefined,
    fecha: e.fecha,
    desde: e.desde,
    hasta: e.hasta,
    lugar: e.lugar,
    notas: e.notas ?? undefined,
    frecuencia: e.frecuencia,
    dias: e.dias.length > 0 ? e.dias.map((d) => d.dia) : undefined,
    repetirHasta: e.repetirHasta ?? undefined,
    excepciones: e.excepciones.map((x) => x.fecha),
    invitados:
      esMio && e.tipo === "estudio"
        ? e.invitaciones.map((inv) => ({
            id: String(inv.invitadoId),
            nombre: nombreCompleto(inv.invitado),
            respuesta: inv.respuesta,
          }))
        : undefined,
    organizador:
      !esMio && miInvitacion
        ? {
            id: String(e.usuarioId),
            nombre: nombreCompleto(e.organizador),
            invitacionId: String(miInvitacion.id),
          }
        : undefined,
  };
}
