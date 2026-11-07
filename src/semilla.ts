// =============================================================================
// src/semilla.ts — Los datos de ejemplo con los que arranca la base
// =============================================================================
//
// QUÉ CARGA (solo si la base está vacía, ver `initDb.ts`):
//   - El CATÁLOGO: la facultad y la carrera que ofrece la app (UCA · Ingeniería
//     Informática). Sus `id` son las mismas claves que manda el registro de la app.
//   - El PLAN de estudios de esa carrera: 10 materias, sus CORRELATIVIDADES, sus
//     recursos oficiales y sus links oficiales.
//   - Las NOVEDADES institucionales.
//   - 5 USUARIOS de prueba (todos con la contraseña `urway2026`):
//       franco.diaz@uca.edu.ar   → el de la demo (con historial, eventos y avisos).
//                                  Tiene materias DISPONIBLES para arrancar (Física I,
//                                  Estructuras de Datos y, con el 2º lote, Arquitectura).
//       mariana.sosa@uca.edu.ar  → amiga de Franco
//       elena.ruiz@uca.edu.ar    → sin relación con Franco (perfil público)
//       david.lopez@uca.edu.ar   → Franco le mandó una solicitud (perfil privado)
//       tomas.vega@uca.edu.ar    → le mandó una solicitud a Franco
//     Con dos cuentas se puede probar lo multiusuario: por ejemplo, entrar como
//     Franco, subir un apunte, y entrar como Mariana para ver la notificación.
//   - Reseñas de dificultad, apuntes (con un PDF de ejemplo cada uno) y avisos.
//
// ES EL PRIMER LOTE: el segundo (más materias, 10 estudiantes más, sus apuntes,
// eventos y avisos) está en `semillaAmpliada.ts` y usa las funciones que este
// archivo exporta (`aprobada`, `crearUsuarioDePrueba`, `pdfDeEjemplo`...).
//
// LAS FECHAS:
//   El historial usa fechas fijas (2024 a 2026). Los eventos se calculan a partir del
//   día en que se crea la base (las clases, todo el cuatrimestre en curso).

import type { Prisma, PrismaClient } from "@prisma/client";

import { guardarArchivo } from "./archivos";
import { hashearContrasenia } from "./seguridad";
import { claveHoy } from "./utiles";

export const CONTRASENIA_DE_PRUEBA = "urway2026";

// -----------------------------------------------------------------------------
// El plan de estudios
// -----------------------------------------------------------------------------

/** Las facultades que ofrece la app (la clave del registro es el `id`). */
export const FACULTADES = [{ id: "uca", nombre: "UCA" }];

/** Las carreras de cada facultad. */
export const CARRERAS = [{ id: "informatica", nombre: "Ingeniería Informática", facultadId: "uca" }];

/** La carrera a la que pertenece el plan de estudios de abajo. */
export const CARRERA_DEL_PLAN = "informatica";

// `dificultadInicial` es la estimación (0 a 5) que se muestra hasta que alguien reseña.
const MATERIAS = [
  { id: "MAT-101", nombre: "Cálculo Elemental", cuatrimestre: 1, creditos: 8, profesor: "Dra. Emmy Noether", dificultadInicial: 3.5 },
  { id: "INF-101", nombre: "Informática General", cuatrimestre: 1, creditos: 6, profesor: "Ing. Grace Hopper", dificultadInicial: 2.5 },
  { id: "INF-102", nombre: "Introducción a la Programación", cuatrimestre: 1, creditos: 8, profesor: "Ing. Ada Lovelace", dificultadInicial: 3 },
  { id: "MAT-201", nombre: "Álgebra y Geometría", cuatrimestre: 2, creditos: 8, profesor: "Dra. Emmy Noether", dificultadInicial: 4.5 },
  { id: "CS-302", nombre: "Programación Web", cuatrimestre: 2, creditos: 8, profesor: "Dr. Alan Turing", dificultadInicial: 4 },
  { id: "FIS-204", nombre: "Física I", cuatrimestre: 2, creditos: 8, profesor: "Dr. Richard Feynman", dificultadInicial: 4.5 },
  { id: "MAT-301", nombre: "Análisis Matemático", cuatrimestre: 3, creditos: 8, profesor: "Dr. Carl Gauss", dificultadInicial: 4.5 },
  { id: "INF-301", nombre: "Estructuras de Datos", cuatrimestre: 3, creditos: 8, profesor: "Dr. Edsger Dijkstra", dificultadInicial: 4 },
  { id: "INF-302", nombre: "Bases de Datos", cuatrimestre: 4, creditos: 6, profesor: "Dr. Edgar Codd", dificultadInicial: 3.5 },
  { id: "FIS-304", nombre: "Física II", cuatrimestre: 4, creditos: 8, profesor: "Dra. Marie Curie", dificultadInicial: 4.5 },
];

/**
 * Las CORRELATIVIDADES: para cursar `materiaId` hay que tener APROBADA LA CURSADA
 * de `requiereId` (basta con estar "pendiente de final": no hace falta el final).
 * Las materias que no aparecen acá (las del 1º cuatrimestre) no piden nada.
 *
 *   MAT-101 ─▶ MAT-201 ─▶ MAT-301 ─┐
 *      └─────▶ FIS-204 ────────────┴▶ FIS-304
 *   INF-102 ─▶ CS-302
 *      └─────▶ INF-301 ─▶ INF-302
 */
export const CORRELATIVAS = [
  { materiaId: "MAT-201", requiereId: "MAT-101" },
  { materiaId: "FIS-204", requiereId: "MAT-101" },
  { materiaId: "CS-302", requiereId: "INF-102" },
  { materiaId: "INF-301", requiereId: "INF-102" },
  { materiaId: "MAT-301", requiereId: "MAT-201" },
  { materiaId: "INF-302", requiereId: "INF-301" },
  { materiaId: "FIS-304", requiereId: "FIS-204" },
  { materiaId: "FIS-304", requiereId: "MAT-301" },
];

// Los recursos OFICIALES (lo de la comunidad son los apuntes que suben los
// estudiantes). El id lo pone la base (1, 2, 3...).
const RECURSOS = [
  { materiaId: "MAT-101", nombre: "Programa de la Materia", formato: "PDF", peso: "980 KB" },
  { materiaId: "INF-102", nombre: "Programa de la Materia", formato: "PDF", peso: "1.0 MB" },
  { materiaId: "INF-102", nombre: "Guía de ejercicios", formato: "PDF", peso: "2.1 MB" },
  { materiaId: "MAT-201", nombre: "Programa de la Materia", formato: "PDF", peso: "1.1 MB" },
  { materiaId: "CS-302", nombre: "Programa de la Materia", formato: "PDF", peso: "1.2 MB" },
  { materiaId: "CS-302", nombre: "Guía de Trabajos Prácticos", formato: "DOCX", peso: "540 KB" },
];

const LINKS = [
  { materiaId: "CS-302", tipo: "discord", titulo: "Discord de la cátedra", detalle: "Consultas y avisos del equipo docente", url: "https://discord.gg/urway-cs302" },
  { materiaId: "CS-302", tipo: "campus", titulo: "Aula virtual", detalle: "Guías de TP, entregas y notas", url: "https://campus.uca.edu.ar/course/cs302" },
  { materiaId: "MAT-201", tipo: "campus", titulo: "Aula virtual", detalle: "Guías de ejercicios y parciales anteriores", url: "https://campus.uca.edu.ar/course/mat201" },
  { materiaId: "MAT-201", tipo: "whatsapp", titulo: "Canal de avisos", detalle: "Canal oficial de la cátedra, solo docentes publican", url: "https://whatsapp.com/channel/urway-mat201" },
  { materiaId: "FIS-204", tipo: "campus", titulo: "Aula virtual", detalle: "Guías de problemas y laboratorios", url: "https://campus.uca.edu.ar/course/fis204" },
];

const NOVEDADES = [
  { titulo: "Inscripción a finales abierta", detalle: "El período de inscripción para el turno de diciembre ya está activo.", icono: "megafono" },
  { titulo: "Feriado nacional el viernes", detalle: "La universidad permanecerá cerrada el próximo viernes.", icono: "calendario" },
];

// -----------------------------------------------------------------------------
// Los usuarios de prueba y su historial
// -----------------------------------------------------------------------------

/** Algo rendido: `[materia, tipo, nota, fecha, "cierra" | "recursa"?]`. */
export type Rendido = [materiaId: string, tipo: string, nota: number, fecha: string, extra?: "cierra" | "recursa"];

/** Las fechas de los cuatrimestres ya cursados: cuándo se cerró la cursada y cuándo fue el final. */
const PERIODOS = {
  "2024-1": { cierre: "2024-06-14", final: "2024-07-17" },
  "2024-2": { cierre: "2024-11-15", final: "2024-12-11" },
  "2025-1": { cierre: "2025-06-13", final: "2025-07-16" },
  "2025-2": { cierre: "2025-11-14", final: "2025-12-10" },
  "2026-1": { cierre: "2026-06-12", final: "2026-07-15" },
};
/** "2026-1" = el 1º cuatrimestre de 2026. `keyof typeof` = una de las claves de arriba. */
export type Periodo = keyof typeof PERIODOS;

// Para no repetir: "aprobó la materia con N en tal cuatrimestre" = un parcial que
// cierra la cursada + el final con N.
export const aprobada = (materiaId: string, nota: number, periodo: Periodo): Rendido[] => [
  [materiaId, "parcial", Math.max(nota - 1, 4), PERIODOS[periodo].cierre, "cierra"],
  [materiaId, "final", nota, PERIODOS[periodo].final],
];

/**
 * Un usuario de prueba. `cursando`: las materias que cursa AHORA (las de este
 * cuatrimestre). Las que tienen historial cuentan como arrancadas sin que haga falta
 * listarlas. Las demás quedan "disponibles" (si tiene las correlativas) o "bloqueadas".
 */
export type UsuarioDePrueba = {
  clave: string;
  nombre: string;
  apellido: string;
  email: string;
  dni?: string;
  cuatrimestre: number;
  verApuntes: string;
  verNotas: string;
  cursando: string[];
  historial: Rendido[];
};

const USUARIOS: UsuarioDePrueba[] = [
  {
    clave: "franco",
    nombre: "Franco",
    apellido: "Díaz",
    email: "franco.diaz@uca.edu.ar",
    dni: "40111222",
    cuatrimestre: 2,
    verApuntes: "todos",
    verNotas: "amigos",
    // Aprobó la cursada de MAT-101 e INF-102 → tiene DISPONIBLES Física I y Estructuras
    // de Datos (y Arquitectura de Computadoras, que agrega el segundo lote y pide INF-101).
    // Álgebra y Programación Web las está cursando.
    cursando: [],
    // El mismo historial de la demo del frontend.
    historial: [
      ["MAT-101", "parcial", 8, "2026-04-20"],
      ["MAT-101", "parcial", 9, "2026-06-15", "cierra"],
      ["MAT-101", "final", 9, "2026-07-13"],
      ["INF-101", "tp", 9, "2026-05-04"],
      ["INF-101", "parcial", 7, "2026-06-10", "cierra"],
      ["INF-101", "final", 8, "2026-07-20"],
      ["INF-102", "parcial", 3, "2026-04-27"],
      ["INF-102", "recuperatorio", 6, "2026-05-11"],
      ["INF-102", "parcial", 7, "2026-06-17", "cierra"],
      ["INF-102", "final", 2, "2026-07-27"],
      ["MAT-201", "parcial", 7, "2026-09-21"],
      ["CS-302", "tp", 8, "2026-09-07"],
      ["CS-302", "exposicion", 9, "2026-10-05"],
    ],
  },
  {
    clave: "mariana",
    nombre: "Mariana",
    apellido: "Sosa",
    email: "mariana.sosa@uca.edu.ar",
    cuatrimestre: 2,
    verApuntes: "todos",
    verNotas: "amigos",
    cursando: ["MAT-201", "CS-302"],
    historial: [...aprobada("MAT-101", 9, "2026-1"), ...aprobada("INF-101", 8, "2026-1"), ...aprobada("INF-102", 10, "2026-1")],
  },
  {
    clave: "elena",
    nombre: "Elena",
    apellido: "Ruiz",
    email: "elena.ruiz@uca.edu.ar",
    cuatrimestre: 2,
    verApuntes: "todos",
    verNotas: "todos",
    cursando: ["CS-302", "FIS-204"],
    historial: [...aprobada("MAT-101", 7, "2026-1"), ...aprobada("INF-101", 9, "2026-1"), ...aprobada("INF-102", 8, "2026-1")],
  },
  {
    clave: "david",
    nombre: "David",
    apellido: "López",
    email: "david.lopez@uca.edu.ar",
    cuatrimestre: 3,
    verApuntes: "amigos",
    verNotas: "amigos",
    cursando: ["MAT-201", "FIS-204"],
    historial: [
      ...aprobada("MAT-101", 6, "2025-2"),
      ...aprobada("INF-101", 7, "2025-2"),
      ...aprobada("INF-102", 8, "2025-2"),
      ...aprobada("CS-302", 9, "2026-1"),
    ],
  },
  {
    clave: "tomas",
    nombre: "Tomás",
    apellido: "Vega",
    email: "tomas.vega@uca.edu.ar",
    cuatrimestre: 2,
    verApuntes: "todos",
    verNotas: "amigos",
    cursando: ["MAT-101", "CS-302"],
    historial: [...aprobada("INF-101", 8, "2026-1"), ...aprobada("INF-102", 8, "2026-1")],
  },
];

/**
 * Las reseñas de dificultad de ejemplo (1 a 5 estrellas): `[usuario, materia, estrellas]`.
 * Cada usuario solo reseña materias que arrancó. Franco todavía NO reseñó Programación
 * Web, así que puede probar a dejar la suya.
 */
const RESENIAS: [string, string, number][] = [
  ["franco", "MAT-101", 4], ["franco", "INF-101", 2], ["franco", "INF-102", 3], ["franco", "MAT-201", 4],
  ["mariana", "MAT-101", 4], ["mariana", "INF-101", 2], ["mariana", "INF-102", 3],
  ["mariana", "MAT-201", 5], ["mariana", "CS-302", 4],
  ["elena", "MAT-101", 3], ["elena", "INF-101", 3], ["elena", "INF-102", 3],
  ["elena", "CS-302", 5], ["elena", "FIS-204", 5],
  ["david", "MAT-101", 3], ["david", "INF-101", 2], ["david", "INF-102", 2],
  ["david", "CS-302", 4], ["david", "FIS-204", 5], ["david", "MAT-201", 4],
  ["tomas", "INF-101", 2], ["tomas", "INF-102", 3], ["tomas", "CS-302", 3], ["tomas", "MAT-101", 5],
];

// -----------------------------------------------------------------------------
// Un PDF de ejemplo para cada apunte
// -----------------------------------------------------------------------------

/**
 * Arma los bytes de un PDF de UNA hoja con el título escrito (el mínimo que abre
 * cualquier visor). Un PDF es texto: un objeto por cada parte (catálogo, páginas,
 * página, contenido, fuente) y, al final, una tabla `xref` con en qué posición
 * empieza cada objeto. Sirve para que los apuntes de ejemplo se puedan previsualizar.
 */
export function pdfDeEjemplo(titulo: string, subtitulo: string): Buffer {
  // La fuente estándar no tiene tildes ni eñes: se las sacamos al texto.
  const limpio = (texto: string) =>
    texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[()\\]/g, "");
  const contenido =
    `BT /F1 26 Tf 72 740 Td (${limpio(titulo)}) Tj ET\n` +
    `BT /F1 14 Tf 72 706 Td (${limpio(subtitulo)}) Tj ET\n` +
    `BT /F1 12 Tf 72 660 Td (Apunte de ejemplo de urway.) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((objeto, indice) => {
    posiciones.push(pdf.length); // dónde empieza este objeto
    pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// -----------------------------------------------------------------------------
// Fechas relativas a hoy (para los eventos de ejemplo)
// -----------------------------------------------------------------------------

/** Hoy más `dias` días, como "AAAA-MM-DD". */
export const enDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return claveHoy(d);
};

/** El primer lunes de un mes. */
function primerLunes(anio: number, mes: number): Date {
  const primero = new Date(anio, mes, 1);
  return new Date(anio, mes, 1 + ((8 - primero.getDay()) % 7));
}

/**
 * El cuatrimestre de hoy (o el próximo, si estamos en el receso): arranca el
 * primer lunes de marzo o de agosto y dura 16 semanas (termina un viernes).
 * Es la misma regla que `utilidades/cuatrimestre.ts` de la app.
 */
export function cuatrimestreDeHoy() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const anio = hoy.getFullYear();
  const inicios = [anio, anio + 1].flatMap((a) => [primerLunes(a, 2), primerLunes(a, 7)]);
  const dia = 24 * 60 * 60 * 1000;
  const inicio =
    inicios.find((i) => hoy.getTime() - i.getTime() >= 0 && hoy.getTime() - i.getTime() < 112 * dia) ??
    inicios.find((i) => i > hoy)!;
  const fin = new Date(inicio.getTime() + (112 - 3) * dia);
  return { inicio: claveHoy(inicio), fin: claveHoy(fin) };
}

// -----------------------------------------------------------------------------
// Cargar todo
// -----------------------------------------------------------------------------

/**
 * Crea un usuario de prueba con sus cursadas (una fila por cada materia arrancada) y
 * su historial, y devuelve su id. `db` es el cliente de Prisma o una transacción
 * (`Prisma.TransactionClient`): así la usan los dos lotes de la semilla.
 */
export async function crearUsuarioDePrueba(
  db: Prisma.TransactionClient,
  u: UsuarioDePrueba,
  hash: string,
  sal: string
): Promise<number> {
  const creado = await db.usuario.create({
    data: {
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email,
      dni: u.dni,
      carreraId: CARRERA_DEL_PLAN,
      cuatrimestre: u.cuatrimestre,
      hashContrasenia: hash,
      sal,
      verApuntes: u.verApuntes,
      verNotas: u.verNotas,
    },
  });
  // Arrancó la cursada de las que tienen historial y de las que están en `cursando`:
  // una fila por cada una (las que no arrancó no tienen fila).
  const arrancadas = new Set([...u.historial.map(([materiaId]) => materiaId), ...u.cursando]);
  await db.cursada.createMany({
    data: [...arrancadas].map((materiaId) => ({ usuarioId: creado.id, materiaId })),
  });
  // Uno por uno y en orden: el `id` (autoincremental) define el orden del historial.
  for (const [materiaId, tipo, nota, fecha, extra] of u.historial) {
    await db.instancia.create({
      data: {
        usuarioId: creado.id,
        materiaId,
        tipo,
        nota,
        fecha,
        cierraCursada: extra === "cierra",
        recursa: extra === "recursa",
      },
    });
  }
  return creado.id;
}

/** Carga el PRIMER lote de datos de ejemplo. Se llama una sola vez, con la base vacía. */
export async function sembrar(prisma: PrismaClient) {
  // 1) El catálogo, el plan, sus correlativas, los recursos, los links y las novedades.
  await prisma.facultad.createMany({ data: FACULTADES });
  await prisma.carrera.createMany({ data: CARRERAS });
  await prisma.materia.createMany({ data: MATERIAS.map((m) => ({ ...m, carreraId: CARRERA_DEL_PLAN })) });
  await prisma.correlativa.createMany({ data: CORRELATIVAS });
  await prisma.recurso.createMany({ data: RECURSOS });
  await prisma.linkOficial.createMany({ data: LINKS });
  await prisma.novedad.createMany({ data: NOVEDADES });

  // 2) Los usuarios, con las cursadas que arrancaron y su historial.
  const ids: Record<string, number> = {};
  for (const u of USUARIOS) {
    const { hash, sal } = await hashearContrasenia(CONTRASENIA_DE_PRUEBA);
    ids[u.clave] = await crearUsuarioDePrueba(prisma, u, hash, sal);
  }
  const { franco, mariana, elena, david, tomas } = ids;

  // Las reseñas de dificultad.
  await prisma.resenia.createMany({
    data: RESENIAS.map(([clave, materiaId, estrellas]) => ({ usuarioId: ids[clave], materiaId, estrellas })),
  });

  // 3) Las amistades: Franco–Mariana y Mariana–Elena son amigos; Franco le mandó
  //    una solicitud a David; Tomás le mandó una a Franco.
  await prisma.solicitud.createMany({
    data: [
      { deId: mariana, paraId: franco, estado: "aceptada" },
      { deId: mariana, paraId: elena, estado: "aceptada" },
      { deId: franco, paraId: david, estado: "pendiente" },
    ],
  });
  // La de Tomás aparte: su aviso pendiente (paso 7) necesita el id de la solicitud.
  const solicitudTomas = await prisma.solicitud.create({ data: { deId: tomas, paraId: franco } });

  // 4) Los eventos de Franco (los mismos de la demo) y dos clases de Mariana.
  const cuatri = cuatrimestreDeHoy();
  const hoy = new Date().getDay();
  // Una clase se repite cada semana en sus DÍAS: cada día es una fila de `EventoDia`,
  // que Prisma crea junto con el evento (`dias: { create: [...] }`, una escritura anidada).
  const clase = (usuarioId: number, titulo: string, materiaId: string, desde: string, hasta: string, lugar: string, dias: number[]) => ({
    usuarioId, titulo, materiaId, desde, hasta, lugar, tipo: "clase", fecha: cuatri.inicio,
    frecuencia: "semanal", repetirHasta: cuatri.fin,
    dias: { create: dias.map((dia) => ({ dia })) },
  });
  const eventos = [
    clase(franco, "Álgebra y Geometría", "MAT-201", "08:00", "10:00", "Aula 302", [hoy, (hoy + 2) % 7]),
    clase(franco, "Programación Web", "CS-302", "11:30", "13:30", "Laboratorio 4", [hoy, (hoy + 3) % 7]),
    { usuarioId: franco, titulo: "Parcial de Álgebra", tipo: "parcial", materiaId: "MAT-201", fecha: enDias(1), desde: "14:00", hasta: "16:00", lugar: "Aula 302", notas: "Matrices, determinantes y sistemas de ecuaciones." },
    { usuarioId: franco, titulo: "Entrega de TP de Programación", tipo: "entrega", materiaId: "CS-302", fecha: enDias(3), desde: "23:00", hasta: "23:59", lugar: "Campus virtual", notas: "Subir el repositorio con el README completo." },
    { usuarioId: franco, titulo: "Entrega del informe de avance", tipo: "entrega", materiaId: "CS-302", fecha: enDias(-20), desde: "20:00", hasta: "21:00", lugar: "Campus virtual", frecuencia: "mensual" },
    clase(mariana, "Álgebra y Geometría", "MAT-201", "08:00", "10:00", "Aula 302", [hoy, (hoy + 2) % 7]),
    clase(mariana, "Programación Web", "CS-302", "11:30", "13:30", "Laboratorio 4", [hoy, (hoy + 3) % 7]),
  ];
  // Uno por uno: `createMany` no admite escrituras anidadas (los días).
  for (const evento of eventos) await prisma.evento.create({ data: evento });

  // 5) Las juntadas de estudio: Franco invitó a Mariana (que aceptó) y Mariana
  //    invitó a Franco (todavía sin responder). Una juntada de estudio NO lleva
  //    materia: el título dice de qué es.
  const estudioFranco = await prisma.evento.create({
    data: { usuarioId: franco, titulo: "Estudiar Álgebra", tipo: "estudio", fecha: enDias(2), desde: "18:00", hasta: "20:00", lugar: "Biblioteca central", notas: "Repasar los ejercicios del parcial." },
  });
  await prisma.invitacion.create({ data: { eventoId: estudioFranco.id, invitadoId: mariana, respuesta: "aceptada" } });
  const estudioMariana = await prisma.evento.create({
    data: { usuarioId: mariana, titulo: "Estudiar Programación Web", tipo: "estudio", fecha: enDias(4), desde: "17:00", hasta: "19:00", lugar: "Sala de estudio 2" },
  });
  const invitacion = await prisma.invitacion.create({ data: { eventoId: estudioMariana.id, invitadoId: franco } });

  // 6) Apuntes de los compañeros. Cada uno es un PDF de ejemplo que se guarda en
  //    `uploads/` (así se pueden previsualizar y descargar desde la app).
  const apuntes: { usuarioId: number; materiaId: string; titulo: string; descripcion?: string; fecha: string }[] = [
    { usuarioId: mariana, materiaId: "MAT-201", titulo: "Resumen de matrices", descripcion: "Operaciones, determinantes e inversa, con ejemplos.", fecha: enDias(-2) },
    { usuarioId: mariana, materiaId: "MAT-201", titulo: "Parcial 1 resuelto", descripcion: "El parcial del año pasado, paso a paso.", fecha: "2026-09-25" },
    { usuarioId: mariana, materiaId: "CS-302", titulo: "Ejercicios del TP 2", fecha: "2026-09-10" },
    { usuarioId: mariana, materiaId: "INF-102", titulo: "Resumen para el final", descripcion: "Todo lo que entra en el final de Programación.", fecha: "2026-07-10" },
    { usuarioId: elena, materiaId: "CS-302", titulo: "Mapa conceptual de HTTP", descripcion: "Métodos, códigos de estado y cabeceras en una hoja.", fecha: "2026-10-08" },
    { usuarioId: elena, materiaId: "FIS-204", titulo: "Cinemática: teoría", fecha: "2026-09-30" },
    { usuarioId: elena, materiaId: "MAT-101", titulo: "Límites y derivadas", descripcion: "Fórmulas y ejercicios resueltos.", fecha: "2026-06-02" },
    { usuarioId: david, materiaId: "FIS-204", titulo: "Problemas de dinámica", fecha: "2026-10-01" },
    { usuarioId: tomas, materiaId: "CS-302", titulo: "Flexbox en una hoja", descripcion: "Un resumen visual de justifyContent y alignItems.", fecha: "2026-10-15" },
  ];
  for (const apunte of apuntes) {
    const archivo = await guardarArchivo(pdfDeEjemplo(apunte.titulo, apunte.materiaId), "pdf");
    await prisma.apunte.create({ data: { ...apunte, archivo } });
  }

  // 7) Las notificaciones de Franco (las mismas de la demo).
  const haceHoras = (h: number) => new Date(Date.now() - h * 3600000);
  await prisma.notificacion.createMany({
    data: [
      { usuarioId: franco, tipo: "apunte", titulo: "Mariana Sosa subió un apunte nuevo", detalle: "Álgebra y Geometría · Resumen de matrices", estudianteId: mariana, materiaId: "MAT-201", creadaEn: haceHoras(2) },
      { usuarioId: franco, tipo: "amistad", titulo: "Tomás Vega te mandó una solicitud de amistad", detalle: "Cursan juntos Programación Web", estudianteId: tomas, solicitudId: solicitudTomas.id, creadaEn: haceHoras(5) },
      { usuarioId: franco, tipo: "estudio", titulo: "Mariana Sosa te invitó a estudiar", detalle: `Estudiar Programación Web · ${enDias(4).split("-").reverse().join("/")} · 17:00 a 19:00 · Sala de estudio 2`, estudianteId: mariana, invitacionId: invitacion.id, creadaEn: haceHoras(8) },
      { usuarioId: franco, tipo: "amistad", titulo: "Ahora sos amigo de Mariana Sosa", detalle: "Aceptó tu solicitud de amistad", estudianteId: mariana, leida: true, creadaEn: haceHoras(50) },
      { usuarioId: franco, tipo: "calendario", tipoEvento: "entrega", titulo: "Se abrió una entrega: TP de Programación", detalle: "Campus virtual · Vence en 3 días a las 23:59", leida: true, creadaEn: haceHoras(75) },
      { usuarioId: mariana, tipo: "estudio", titulo: "Franco Díaz te invitó a estudiar", detalle: "Estudiar Álgebra · 18:00 a 20:00 · Biblioteca central", estudianteId: franco, respuesta: "aceptada", leida: true, creadaEn: haceHoras(30) },
    ],
  });
}
