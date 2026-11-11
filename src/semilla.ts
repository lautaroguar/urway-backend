// =============================================================================
// src/semilla.ts — Los datos de ejemplo de urway (todos juntos)
// =============================================================================
//
// Este archivo tiene SOLO DATOS: qué materias, usuarios, eventos, apuntes y avisos
// trae la base de ejemplo. Quien los guarda en la base es el SEEDER,
// `prisma/seed.ts` (`npx prisma db seed`): decide si hace falta cargarlos y los
// carga todos de una vez.
//
// QUÉ HAY:
//   - El catálogo: la facultad y la carrera (UCA · Ingeniería Informática). Sus `id`
//     son las mismas claves que manda el registro de la app.
//   - El plan de estudios: 16 materias (tres años), sus correlativas, sus recursos y
//     sus links oficiales. 5 novedades.
//   - 15 usuarios de prueba, todos con la contraseña `urway2026`, con su historial:
//       franco.diaz@uca.edu.ar → el de la demo: amigo de Mariana, Lucía, Joaquín y
//                                Camila; le mandaron solicitud Tomás y Martín; él se
//                                la mandó a David (perfil privado) y a Valentina.
//     Con dos cuentas se puede probar lo multiusuario: por ejemplo, entrar como
//     Franco, subir un apunte, y entrar como Mariana para ver la notificación.
//   - Reseñas, amistades y solicitudes, clases, parciales y entregas, juntadas de
//     estudio con sus invitaciones, 25 apuntes (cada uno con un PDF de ejemplo) y
//     los avisos de cada uno.
//
// CÓMO SE NOMBRA A CADA USUARIO:
//   Los ids los pone la base al guardar. Por eso acá cada usuario tiene una `clave`
//   ("franco", "lucia"...) y el resto de los datos se refiere a él por esa clave; el
//   seeder la traduce al id real.
//
// LAS FECHAS:
//   El historial usa fechas fijas (2024 a 2026). Los eventos, los apuntes recientes y
//   los avisos se calculan a partir del día en que se carga la base (`enDias`), así la
//   demo siempre tiene algo para hoy y los próximos días.

import { claveHoy, fechaParaApi } from "./utiles";

export const CONTRASENIA_DE_PRUEBA = "urway2026";

/** Hoy más `dias` días, como "AAAA-MM-DD". */
export const enDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return claveHoy(d);
};

// =============================================================================
// El catálogo y el plan de estudios
// =============================================================================

export const FACULTADES = [{ id: "uca", nombre: "UCA" }];
export const CARRERAS = [{ id: "informatica", nombre: "Ingeniería Informática", facultadId: "uca" }];

/** La carrera a la que pertenece el plan de estudios (y todos los usuarios de prueba). */
export const CARRERA_DEL_PLAN = "informatica";

// `dificultadInicial` es la estimación (0 a 5) que se muestra hasta que alguien reseña.
export const MATERIAS = [
  // 1º año
  { id: "MAT-101", nombre: "Cálculo Elemental", cuatrimestre: 1, creditos: 8, profesor: "Dra. Emmy Noether", dificultadInicial: 3.5 },
  { id: "INF-101", nombre: "Informática General", cuatrimestre: 1, creditos: 6, profesor: "Ing. Grace Hopper", dificultadInicial: 2.5 },
  { id: "INF-102", nombre: "Introducción a la Programación", cuatrimestre: 1, creditos: 8, profesor: "Ing. Ada Lovelace", dificultadInicial: 3 },
  { id: "MAT-201", nombre: "Álgebra y Geometría", cuatrimestre: 2, creditos: 8, profesor: "Dra. Emmy Noether", dificultadInicial: 4.5 },
  { id: "CS-302", nombre: "Programación Web", cuatrimestre: 2, creditos: 8, profesor: "Dr. Alan Turing", dificultadInicial: 4 },
  { id: "FIS-204", nombre: "Física I", cuatrimestre: 2, creditos: 8, profesor: "Dr. Richard Feynman", dificultadInicial: 4.5 },
  // 2º año
  { id: "MAT-301", nombre: "Análisis Matemático", cuatrimestre: 3, creditos: 8, profesor: "Dr. Carl Gauss", dificultadInicial: 4.5 },
  { id: "INF-301", nombre: "Estructuras de Datos", cuatrimestre: 3, creditos: 8, profesor: "Dr. Edsger Dijkstra", dificultadInicial: 4 },
  { id: "INF-303", nombre: "Arquitectura de Computadoras", cuatrimestre: 3, creditos: 6, profesor: "Dr. John von Neumann", dificultadInicial: 3.5 },
  { id: "INF-302", nombre: "Bases de Datos", cuatrimestre: 4, creditos: 6, profesor: "Dr. Edgar Codd", dificultadInicial: 3.5 },
  { id: "FIS-304", nombre: "Física II", cuatrimestre: 4, creditos: 8, profesor: "Dra. Marie Curie", dificultadInicial: 4.5 },
  { id: "MAT-302", nombre: "Probabilidad y Estadística", cuatrimestre: 4, creditos: 6, profesor: "Dr. Andréi Kolmogórov", dificultadInicial: 4 },
  // 3º año
  { id: "INF-401", nombre: "Sistemas Operativos", cuatrimestre: 5, creditos: 8, profesor: "Dr. Dennis Ritchie", dificultadInicial: 4 },
  { id: "INF-402", nombre: "Redes de Computadoras", cuatrimestre: 5, creditos: 8, profesor: "Dr. Paul Baran", dificultadInicial: 3.5 },
  { id: "INF-501", nombre: "Ingeniería de Software", cuatrimestre: 6, creditos: 8, profesor: "Dr. Fred Brooks", dificultadInicial: 3 },
  { id: "CS-502", nombre: "Desarrollo de Aplicaciones Móviles", cuatrimestre: 6, creditos: 8, profesor: "Dra. Hedy Lamarr", dificultadInicial: 3.5 },
];

/**
 * Las CORRELATIVAS: qué materias pide cada una. Para cursarla hay que tener APROBADA
 * LA CURSADA de esas (basta con estar "pendiente de final": no hace falta el final).
 * Las del 1º cuatrimestre no piden nada.
 */
export const CORRELATIVAS: Record<string, string[]> = {
  "MAT-201": ["MAT-101"],
  "FIS-204": ["MAT-101"],
  "CS-302": ["INF-102"],
  "MAT-301": ["MAT-201"],
  "INF-301": ["INF-102"],
  "INF-303": ["INF-101"],
  "INF-302": ["INF-301"],
  "FIS-304": ["FIS-204", "MAT-301"],
  "MAT-302": ["MAT-201"],
  "INF-401": ["INF-301", "INF-303"],
  "INF-402": ["INF-303"],
  "INF-501": ["CS-302", "INF-302"],
  "CS-502": ["CS-302", "INF-301"],
};

// Los recursos OFICIALES de cada materia (los de la comunidad son los apuntes).
export const RECURSOS = [
  { materiaId: "MAT-101", nombre: "Programa de la Materia", formato: "PDF", peso: "980 KB" },
  { materiaId: "INF-101", nombre: "Programa de la Materia", formato: "PDF", peso: "850 KB" },
  { materiaId: "INF-102", nombre: "Programa de la Materia", formato: "PDF", peso: "1.0 MB" },
  { materiaId: "INF-102", nombre: "Guía de ejercicios", formato: "PDF", peso: "2.1 MB" },
  { materiaId: "MAT-201", nombre: "Programa de la Materia", formato: "PDF", peso: "1.1 MB" },
  { materiaId: "CS-302", nombre: "Programa de la Materia", formato: "PDF", peso: "1.2 MB" },
  { materiaId: "CS-302", nombre: "Guía de Trabajos Prácticos", formato: "DOCX", peso: "540 KB" },
  { materiaId: "FIS-204", nombre: "Programa de la Materia", formato: "PDF", peso: "1.0 MB" },
  { materiaId: "FIS-204", nombre: "Guía de problemas", formato: "PDF", peso: "1.8 MB" },
  { materiaId: "MAT-301", nombre: "Programa de la Materia", formato: "PDF", peso: "1.2 MB" },
  { materiaId: "INF-301", nombre: "Programa de la Materia", formato: "PDF", peso: "900 KB" },
  { materiaId: "INF-301", nombre: "Enunciados de los trabajos prácticos", formato: "DOCX", peso: "320 KB" },
  { materiaId: "INF-303", nombre: "Programa de la Materia", formato: "PDF", peso: "760 KB" },
  { materiaId: "INF-302", nombre: "Programa de la Materia", formato: "PDF", peso: "1.1 MB" },
  { materiaId: "FIS-304", nombre: "Programa de la Materia", formato: "PDF", peso: "1.0 MB" },
  { materiaId: "MAT-302", nombre: "Programa de la Materia", formato: "PDF", peso: "820 KB" },
  { materiaId: "INF-401", nombre: "Programa de la Materia", formato: "PDF", peso: "1.3 MB" },
  { materiaId: "INF-402", nombre: "Programa de la Materia", formato: "PDF", peso: "1.1 MB" },
  { materiaId: "INF-501", nombre: "Programa de la Materia", formato: "PDF", peso: "980 KB" },
  { materiaId: "INF-501", nombre: "Plantilla del documento de requisitos", formato: "DOCX", peso: "210 KB" },
  { materiaId: "CS-502", nombre: "Programa de la Materia", formato: "PDF", peso: "1.0 MB" },
  { materiaId: "CS-502", nombre: "Guía de instalación de Expo", formato: "PDF", peso: "640 KB" },
];

export const LINKS = [
  { materiaId: "INF-101", tipo: "campus", titulo: "Aula virtual", detalle: "Material de clase y cuestionarios", url: "https://campus.uca.edu.ar/course/inf101" },
  { materiaId: "INF-102", tipo: "discord", titulo: "Discord de la cátedra", detalle: "Consultas sobre los ejercicios de programación", url: "https://discord.gg/urway-inf102" },
  { materiaId: "MAT-201", tipo: "campus", titulo: "Aula virtual", detalle: "Guías de ejercicios y parciales anteriores", url: "https://campus.uca.edu.ar/course/mat201" },
  { materiaId: "MAT-201", tipo: "whatsapp", titulo: "Canal de avisos", detalle: "Canal oficial de la cátedra, solo docentes publican", url: "https://whatsapp.com/channel/urway-mat201" },
  { materiaId: "CS-302", tipo: "discord", titulo: "Discord de la cátedra", detalle: "Consultas y avisos del equipo docente", url: "https://discord.gg/urway-cs302" },
  { materiaId: "CS-302", tipo: "campus", titulo: "Aula virtual", detalle: "Guías de TP, entregas y notas", url: "https://campus.uca.edu.ar/course/cs302" },
  { materiaId: "FIS-204", tipo: "campus", titulo: "Aula virtual", detalle: "Guías de problemas y laboratorios", url: "https://campus.uca.edu.ar/course/fis204" },
  { materiaId: "MAT-301", tipo: "campus", titulo: "Aula virtual", detalle: "Prácticas y parciales anteriores", url: "https://campus.uca.edu.ar/course/mat301" },
  { materiaId: "INF-301", tipo: "campus", titulo: "Aula virtual", detalle: "Enunciados y entregas de los TP", url: "https://campus.uca.edu.ar/course/inf301" },
  { materiaId: "INF-301", tipo: "repositorio", titulo: "Repositorio de ejemplos", detalle: "El código de las clases prácticas", url: "https://github.com/urway-uca/inf301-ejemplos" },
  { materiaId: "INF-302", tipo: "campus", titulo: "Aula virtual", detalle: "Guías de SQL y de normalización", url: "https://campus.uca.edu.ar/course/inf302" },
  { materiaId: "INF-501", tipo: "web", titulo: "Tablero del proyecto", detalle: "Las tareas del proyecto integrador", url: "https://tablero.uca.edu.ar/inf501" },
  { materiaId: "CS-502", tipo: "discord", titulo: "Discord de la cátedra", detalle: "Dudas de Expo y React Native", url: "https://discord.gg/urway-cs502" },
  { materiaId: "CS-502", tipo: "repositorio", titulo: "Proyecto base", detalle: "La plantilla de Expo de la materia", url: "https://github.com/urway-uca/cs502-plantilla" },
];

export const NOVEDADES = [
  { titulo: "Inscripción a finales abierta", detalle: "El período de inscripción para el turno de diciembre ya está activo.", icono: "megafono" },
  { titulo: "Feriado nacional el viernes", detalle: "La universidad permanecerá cerrada el próximo viernes.", icono: "calendario" },
  { titulo: "Semana de la Ingeniería", detalle: "Charlas y talleres abiertos toda la semana que viene en el auditorio central.", icono: "calendario" },
  { titulo: "Biblioteca en horario extendido", detalle: "Durante el período de finales, la biblioteca abre de 8 a 22 h.", icono: "megafono" },
  { titulo: "Encuesta docente", detalle: "Ya podés completar la encuesta de las materias que cursaste este cuatrimestre.", icono: "megafono" },
];

// =============================================================================
// Los horarios de cursada
// =============================================================================

/** Cuándo y dónde se cursa una materia. Días: 0 = domingo ... 6 = sábado. */
export type Horario = { dias: number[]; desde: string; hasta: string; lugar: string };

// La comisión de Franco y Mariana cae en el día de HOY (y en otro de la semana):
// así la demo siempre tiene clases en «Hoy».
const hoy = new Date().getDay();
const COMISION_DE_LA_DEMO: Record<string, Horario> = {
  "MAT-201": { dias: [hoy, (hoy + 2) % 7], desde: "08:00", hasta: "10:00", lugar: "Aula 302" },
  "CS-302": { dias: [hoy, (hoy + 3) % 7], desde: "11:30", hasta: "13:30", lugar: "Laboratorio 4" },
};

/** El horario de cada materia para los demás estudiantes. */
export const HORARIOS: Record<string, Horario> = {
  "MAT-101": { dias: [1, 3], desde: "08:00", hasta: "10:00", lugar: "Aula 101" },
  "INF-101": { dias: [2], desde: "10:00", hasta: "12:00", lugar: "Laboratorio 1" },
  "INF-102": { dias: [2, 4], desde: "14:00", hasta: "16:00", lugar: "Laboratorio 2" },
  "MAT-201": { dias: [1, 4], desde: "10:00", hasta: "12:00", lugar: "Aula 302" },
  "CS-302": { dias: [3, 5], desde: "14:00", hasta: "16:00", lugar: "Laboratorio 4" },
  "FIS-204": { dias: [2, 5], desde: "08:00", hasta: "10:00", lugar: "Aula 205" },
  "MAT-301": { dias: [1, 3], desde: "14:00", hasta: "16:00", lugar: "Aula 303" },
  "INF-301": { dias: [2, 4], desde: "18:00", hasta: "20:00", lugar: "Laboratorio 3" },
  "INF-303": { dias: [5], desde: "10:00", hasta: "13:00", lugar: "Laboratorio 1" },
  "INF-302": { dias: [1], desde: "18:00", hasta: "21:00", lugar: "Laboratorio 3" },
  "FIS-304": { dias: [3], desde: "18:00", hasta: "21:00", lugar: "Aula 205" },
  "MAT-302": { dias: [4], desde: "08:00", hasta: "11:00", lugar: "Aula 101" },
  "INF-401": { dias: [1, 3], desde: "18:00", hasta: "20:00", lugar: "Laboratorio 5" },
  "INF-402": { dias: [2], desde: "18:00", hasta: "21:00", lugar: "Laboratorio 5" },
  "INF-501": { dias: [4], desde: "18:00", hasta: "21:00", lugar: "Aula 401" },
  "CS-502": { dias: [5], desde: "18:00", hasta: "21:00", lugar: "Laboratorio 4" },
};

// =============================================================================
// Los usuarios de prueba y su historial
// =============================================================================

/** Algo rendido: `[materia, tipo, nota, fecha, "cierra" | "recursa"?]`. */
export type Rendido = [materiaId: string, tipo: string, nota: number, fecha: string, extra?: "cierra" | "recursa"];

/** Cuándo se cerró la cursada y cuándo fue el final de cada cuatrimestre ya cursado. */
const PERIODOS = {
  "2024-1": { cierre: "2024-06-14", final: "2024-07-17" },
  "2024-2": { cierre: "2024-11-15", final: "2024-12-11" },
  "2025-1": { cierre: "2025-06-13", final: "2025-07-16" },
  "2025-2": { cierre: "2025-11-14", final: "2025-12-10" },
  "2026-1": { cierre: "2026-06-12", final: "2026-07-15" },
};

/** "Aprobó la materia con N en tal cuatrimestre" = un parcial que cierra la cursada + el final con N. */
const aprobada = (materiaId: string, nota: number, periodo: keyof typeof PERIODOS): Rendido[] => [
  [materiaId, "parcial", Math.max(nota - 1, 4), PERIODOS[periodo].cierre, "cierra"],
  [materiaId, "final", nota, PERIODOS[periodo].final],
];

/**
 * Un usuario de prueba.
 *   - `cursando`: las materias que cursa AHORA. Tiene una clase de cada una en la
 *     agenda, con su `horario` propio o, si no tiene, el de `HORARIOS`.
 *   - `historial`: lo que rindió, de lo más viejo a lo más nuevo. Las materias con
 *     historial cuentan como arrancadas; las demás quedan "disponibles" (si tiene
 *     las correlativas) o "bloqueadas".
 */
export type UsuarioDePrueba = {
  clave: string;
  nombre: string;
  apellido: string;
  email: string;
  dni?: string;
  cuatrimestre: number;
  verApuntes: "todos" | "amigos";
  verNotas: "todos" | "amigos";
  cursando: string[];
  horario?: Record<string, Horario>;
  historial: Rendido[];
};

export const USUARIOS: UsuarioDePrueba[] = [
  {
    clave: "franco", nombre: "Franco", apellido: "Díaz", email: "franco.diaz@uca.edu.ar", dni: "40111222",
    cuatrimestre: 2, verApuntes: "todos", verNotas: "amigos",
    // Aprobó la cursada de MAT-101, INF-101 e INF-102: tiene DISPONIBLES Física I,
    // Estructuras de Datos y Arquitectura de Computadoras para arrancar.
    cursando: ["MAT-201", "CS-302"],
    horario: COMISION_DE_LA_DEMO,
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
    clave: "mariana", nombre: "Mariana", apellido: "Sosa", email: "mariana.sosa@uca.edu.ar",
    cuatrimestre: 2, verApuntes: "todos", verNotas: "amigos",
    cursando: ["MAT-201", "CS-302"],
    horario: COMISION_DE_LA_DEMO, // cursa con Franco
    historial: [...aprobada("MAT-101", 9, "2026-1"), ...aprobada("INF-101", 8, "2026-1"), ...aprobada("INF-102", 10, "2026-1")],
  },
  {
    clave: "elena", nombre: "Elena", apellido: "Ruiz", email: "elena.ruiz@uca.edu.ar",
    cuatrimestre: 2, verApuntes: "todos", verNotas: "todos",
    cursando: ["CS-302", "FIS-204"],
    historial: [...aprobada("MAT-101", 7, "2026-1"), ...aprobada("INF-101", 9, "2026-1"), ...aprobada("INF-102", 8, "2026-1")],
  },
  {
    clave: "david", nombre: "David", apellido: "López", email: "david.lopez@uca.edu.ar",
    cuatrimestre: 3, verApuntes: "amigos", verNotas: "amigos", // perfil privado
    cursando: ["MAT-201", "FIS-204"],
    historial: [
      ...aprobada("MAT-101", 6, "2025-2"),
      ...aprobada("INF-101", 7, "2025-2"),
      ...aprobada("INF-102", 8, "2025-2"),
      ...aprobada("CS-302", 9, "2026-1"),
    ],
  },
  {
    clave: "tomas", nombre: "Tomás", apellido: "Vega", email: "tomas.vega@uca.edu.ar",
    cuatrimestre: 2, verApuntes: "todos", verNotas: "amigos",
    cursando: ["MAT-101", "CS-302"],
    historial: [...aprobada("INF-101", 8, "2026-1"), ...aprobada("INF-102", 8, "2026-1")],
  },
  {
    clave: "lucia", nombre: "Lucía", apellido: "Fernández", email: "lucia.fernandez@uca.edu.ar", dni: "41234567",
    cuatrimestre: 2, verApuntes: "todos", verNotas: "todos",
    cursando: ["MAT-201", "CS-302"],
    historial: [
      ...aprobada("MAT-101", 8, "2026-1"),
      ...aprobada("INF-101", 9, "2026-1"),
      ...aprobada("INF-102", 7, "2026-1"),
      ["CS-302", "tp", 9, "2026-09-07"],
      ["MAT-201", "parcial", 8, "2026-09-21"],
    ],
  },
  {
    clave: "martin", nombre: "Martín", apellido: "Gómez", email: "martin.gomez@uca.edu.ar",
    cuatrimestre: 2, verApuntes: "todos", verNotas: "amigos",
    cursando: ["FIS-204", "CS-302"],
    historial: [
      ...aprobada("MAT-101", 6, "2026-1"),
      ...aprobada("INF-102", 8, "2026-1"),
      // Cerró la cursada de Informática General pero desaprobó el final: pendiente de final.
      ["INF-101", "parcial", 5, "2026-06-10", "cierra"],
      ["INF-101", "final", 3, "2026-07-20"],
      ["FIS-204", "parcial", 6, "2026-09-28"],
    ],
  },
  {
    clave: "sofia", nombre: "Sofía", apellido: "Romero", email: "sofia.romero@uca.edu.ar", dni: "40987654",
    cuatrimestre: 4, verApuntes: "amigos", verNotas: "amigos",
    cursando: ["INF-302", "MAT-302"],
    historial: [
      ...aprobada("MAT-101", 9, "2025-1"),
      ...aprobada("INF-101", 10, "2025-1"),
      ...aprobada("INF-102", 9, "2025-1"),
      ...aprobada("MAT-201", 8, "2025-2"),
      ...aprobada("CS-302", 10, "2025-2"),
      ...aprobada("FIS-204", 7, "2025-2"),
      ...aprobada("INF-301", 9, "2026-1"),
      ...aprobada("MAT-301", 7, "2026-1"),
      ...aprobada("INF-303", 8, "2026-1"),
      ["INF-302", "tp", 10, "2026-09-25"],
    ],
  },
  {
    clave: "joaquin", nombre: "Joaquín", apellido: "Álvarez", email: "joaquin.alvarez@uca.edu.ar",
    cuatrimestre: 3, verApuntes: "todos", verNotas: "todos",
    cursando: ["INF-301", "MAT-301", "FIS-204"],
    historial: [
      ...aprobada("MAT-101", 7, "2025-2"),
      ...aprobada("INF-101", 8, "2025-2"),
      ...aprobada("INF-102", 9, "2025-2"),
      ...aprobada("MAT-201", 6, "2026-1"),
      ...aprobada("CS-302", 9, "2026-1"),
      // Física I: desaprobó el parcial y el recuperatorio y la RECURSA (2º intento).
      ["FIS-204", "parcial", 3, "2026-04-27"],
      ["FIS-204", "recuperatorio", 2, "2026-05-11", "recursa"],
      ["FIS-204", "parcial", 6, "2026-09-28"],
      ["INF-301", "parcial", 8, "2026-09-29"],
    ],
  },
  {
    clave: "valentina", nombre: "Valentina", apellido: "Torres", email: "valentina.torres@uca.edu.ar",
    cuatrimestre: 1, verApuntes: "todos", verNotas: "amigos",
    // Recién empieza: cursa las tres del 1º cuatrimestre y todavía no rindió nada.
    cursando: ["MAT-101", "INF-101", "INF-102"],
    historial: [],
  },
  {
    clave: "nicolas", nombre: "Nicolás", apellido: "Herrera", email: "nicolas.herrera@uca.edu.ar", dni: "39876543",
    cuatrimestre: 6, verApuntes: "todos", verNotas: "todos",
    cursando: ["INF-501", "CS-502"],
    historial: [
      ...aprobada("MAT-101", 7, "2024-1"),
      ...aprobada("INF-101", 8, "2024-1"),
      ...aprobada("INF-102", 8, "2024-1"),
      ...aprobada("MAT-201", 7, "2024-2"),
      ...aprobada("CS-302", 8, "2024-2"),
      ...aprobada("FIS-204", 6, "2024-2"),
      ...aprobada("MAT-301", 6, "2025-1"),
      ...aprobada("INF-301", 8, "2025-1"),
      ...aprobada("INF-303", 9, "2025-1"),
      ...aprobada("INF-302", 9, "2025-2"),
      ...aprobada("FIS-304", 6, "2025-2"),
      ...aprobada("MAT-302", 7, "2025-2"),
      ...aprobada("INF-401", 8, "2026-1"),
      ...aprobada("INF-402", 7, "2026-1"),
      ["CS-502", "tp", 9, "2026-09-15"],
      ["INF-501", "exposicion", 8, "2026-10-06"],
    ],
  },
  {
    clave: "camila", nombre: "Camila", apellido: "Medina", email: "camila.medina@uca.edu.ar",
    cuatrimestre: 2, verApuntes: "amigos", verNotas: "amigos",
    cursando: ["MAT-201", "FIS-204"],
    historial: [
      ...aprobada("MAT-101", 9, "2026-1"),
      ...aprobada("INF-101", 8, "2026-1"),
      // Introducción a la Programación: cerró la cursada y todavía no rindió el final.
      ["INF-102", "parcial", 6, "2026-04-20"],
      ["INF-102", "parcial", 7, "2026-06-17", "cierra"],
    ],
  },
  {
    clave: "agustin", nombre: "Agustín", apellido: "Castro", email: "agustin.castro@uca.edu.ar",
    cuatrimestre: 4, verApuntes: "todos", verNotas: "amigos",
    cursando: ["FIS-304", "MAT-302"],
    historial: [
      ...aprobada("MAT-101", 6, "2025-1"),
      ...aprobada("INF-101", 7, "2025-1"),
      ...aprobada("INF-102", 6, "2025-1"),
      ...aprobada("MAT-201", 5, "2025-2"),
      ...aprobada("CS-302", 7, "2025-2"),
      ...aprobada("FIS-204", 6, "2025-2"),
      ...aprobada("MAT-301", 4, "2026-1"),
      // Estructuras de Datos: cursada aprobada, le falta el final.
      ["INF-301", "parcial", 7, "2026-06-12", "cierra"],
    ],
  },
  {
    clave: "florencia", nombre: "Florencia", apellido: "Ríos", email: "florencia.rios@uca.edu.ar",
    cuatrimestre: 3, verApuntes: "amigos", verNotas: "todos",
    cursando: ["INF-301", "INF-303", "MAT-301"],
    historial: [
      ...aprobada("MAT-101", 8, "2025-2"),
      ...aprobada("INF-101", 9, "2025-2"),
      ...aprobada("INF-102", 10, "2025-2"),
      ...aprobada("CS-302", 10, "2026-1"),
      ...aprobada("MAT-201", 9, "2026-1"),
      ...aprobada("FIS-204", 8, "2026-1"),
      ["INF-303", "tp", 9, "2026-10-02"],
    ],
  },
  {
    clave: "bruno", nombre: "Bruno", apellido: "Acosta", email: "bruno.acosta@uca.edu.ar",
    cuatrimestre: 2, verApuntes: "todos", verNotas: "amigos",
    cursando: ["MAT-101", "CS-302"],
    historial: [
      ...aprobada("INF-101", 7, "2026-1"),
      ...aprobada("INF-102", 6, "2026-1"),
      // Cálculo: desaprobó el parcial y el recuperatorio y la recursa este cuatrimestre.
      ["MAT-101", "parcial", 2, "2026-04-20"],
      ["MAT-101", "recuperatorio", 3, "2026-05-04", "recursa"],
    ],
  },
];

/**
 * Las reseñas de dificultad (1 a 5 estrellas): `[usuario, materia, estrellas]`. Cada
 * uno reseña materias que arrancó. Franco todavía NO reseñó Programación Web, así que
 * puede probar a dejar la suya.
 */
export const RESENIAS: [string, string, number][] = [
  ["franco", "MAT-101", 4], ["franco", "INF-101", 2], ["franco", "INF-102", 3], ["franco", "MAT-201", 4],
  ["mariana", "MAT-101", 4], ["mariana", "INF-101", 2], ["mariana", "INF-102", 3], ["mariana", "MAT-201", 5], ["mariana", "CS-302", 4],
  ["elena", "MAT-101", 3], ["elena", "INF-101", 3], ["elena", "INF-102", 3], ["elena", "CS-302", 5], ["elena", "FIS-204", 5],
  ["david", "MAT-101", 3], ["david", "INF-101", 2], ["david", "INF-102", 2], ["david", "CS-302", 4], ["david", "FIS-204", 5], ["david", "MAT-201", 4],
  ["tomas", "INF-101", 2], ["tomas", "INF-102", 3], ["tomas", "CS-302", 3], ["tomas", "MAT-101", 5],
  ["lucia", "MAT-101", 3], ["lucia", "INF-101", 2], ["lucia", "INF-102", 3], ["lucia", "MAT-201", 4], ["lucia", "CS-302", 4],
  ["martin", "MAT-101", 4], ["martin", "INF-101", 3], ["martin", "INF-102", 3], ["martin", "FIS-204", 5],
  ["sofia", "MAT-201", 4], ["sofia", "CS-302", 3], ["sofia", "INF-301", 4], ["sofia", "MAT-301", 5], ["sofia", "INF-303", 3], ["sofia", "INF-302", 3],
  ["joaquin", "FIS-204", 5], ["joaquin", "CS-302", 4], ["joaquin", "MAT-201", 4], ["joaquin", "INF-301", 4],
  ["valentina", "MAT-101", 4], ["valentina", "INF-102", 3],
  ["nicolas", "MAT-302", 3], ["nicolas", "FIS-304", 5], ["nicolas", "INF-302", 3], ["nicolas", "INF-401", 4],
  ["nicolas", "INF-402", 4], ["nicolas", "INF-501", 3], ["nicolas", "CS-502", 4],
  ["camila", "MAT-101", 3], ["camila", "INF-101", 2], ["camila", "INF-102", 4], ["camila", "MAT-201", 5],
  ["agustin", "MAT-301", 5], ["agustin", "FIS-204", 4], ["agustin", "FIS-304", 5], ["agustin", "MAT-302", 3],
  ["florencia", "CS-302", 3], ["florencia", "INF-303", 3], ["florencia", "INF-301", 4],
  ["bruno", "MAT-101", 5], ["bruno", "CS-302", 4],
];

// =============================================================================
// Amistades
// =============================================================================

/** Amistades ya aceptadas: `[quien mandó la solicitud, quien la aceptó]`. */
export const AMISTADES: [string, string][] = [
  ["mariana", "franco"], ["mariana", "elena"], ["lucia", "franco"], ["franco", "joaquin"], ["franco", "camila"],
  ["lucia", "sofia"], ["sofia", "nicolas"], ["lucia", "florencia"], ["joaquin", "florencia"],
  ["mariana", "lucia"], ["tomas", "bruno"], ["nicolas", "martin"], ["camila", "lucia"],
];

/** Solicitudes todavía sin responder: `[quien la mandó, a quién]`. */
export const SOLICITUDES_PENDIENTES: [string, string][] = [
  ["franco", "david"], ["tomas", "franco"], ["martin", "franco"], ["franco", "valentina"], ["agustin", "nicolas"],
];

// =============================================================================
// La agenda (además de las clases, que salen de `cursando`)
// =============================================================================

/** El parcial 2 de Franco: en 7 días, a la hora de su clase (en la agenda se ve como un círculo dentro de la clase). */
const PARCIAL_2 = { fecha: enDias(7), desde: "11:30", lugar: "Laboratorio 4" };

/** Parciales y entregas. `usuario` = de quién es el evento. */
export const EVENTOS = [
  { usuario: "franco", titulo: "Parcial de Álgebra", tipo: "parcial", materiaId: "MAT-201", fecha: enDias(1), desde: "14:00", hasta: "16:00", lugar: "Aula 302", notas: "Matrices, determinantes y sistemas de ecuaciones." },
  { usuario: "franco", titulo: "Entrega de TP de Programación", tipo: "entrega", materiaId: "CS-302", fecha: enDias(3), desde: "23:00", hasta: "23:59", lugar: "Campus virtual", notas: "Subir el repositorio con el README completo." },
  { usuario: "franco", titulo: "Entrega del informe de avance", tipo: "entrega", materiaId: "CS-302", fecha: enDias(-20), desde: "20:00", hasta: "21:00", lugar: "Campus virtual", frecuencia: "mensual" },
  { usuario: "franco", titulo: "Parcial 2 de Programación Web", tipo: "parcial", materiaId: "CS-302", ...PARCIAL_2, hasta: "13:30", notas: "Fetch, Context y navegación con expo-router." },
  { usuario: "franco", titulo: "Entrega del TP 3 de Programación Web", tipo: "entrega", materiaId: "CS-302", fecha: enDias(12), desde: "23:00", hasta: "23:59", lugar: "Campus virtual", notas: "Subir el link al repositorio y el video de la demo." },
  { usuario: "sofia", titulo: "Parcial de Bases de Datos", tipo: "parcial", materiaId: "INF-302", fecha: enDias(6), desde: "18:00", hasta: "21:00", lugar: "Laboratorio 3" },
  { usuario: "nicolas", titulo: "Entrega del documento de requisitos", tipo: "entrega", materiaId: "INF-501", fecha: enDias(9), desde: "20:00", hasta: "21:00", lugar: "Campus virtual" },
];

/**
 * Las juntadas de estudio (no llevan materia: el título dice de qué son) y sus
 * invitados con la respuesta de cada uno. Cada una tiene una clave para que los
 * avisos de abajo la nombren.
 */
export type Juntada = {
  organizador: string;
  titulo: string;
  fecha: string;
  desde: string;
  hasta: string;
  lugar: string;
  notas?: string;
  invitados: Record<string, "pendiente" | "aceptada" | "rechazada">;
};

export const JUNTADAS: Record<string, Juntada> = {
  algebra: { organizador: "franco", titulo: "Estudiar Álgebra", fecha: enDias(2), desde: "18:00", hasta: "20:00", lugar: "Biblioteca central", notas: "Repasar los ejercicios del parcial.", invitados: { mariana: "aceptada" } },
  web: { organizador: "mariana", titulo: "Estudiar Programación Web", fecha: enDias(4), desde: "17:00", hasta: "19:00", lugar: "Sala de estudio 2", invitados: { franco: "pendiente" } },
  repaso: { organizador: "franco", titulo: "Repaso para el parcial de Web", fecha: enDias(5), desde: "17:00", hasta: "19:00", lugar: "Biblioteca central", notas: "Traer los TP anteriores.", invitados: { lucia: "aceptada", joaquin: "pendiente" } },
  matrices: { organizador: "lucia", titulo: "Repasar matrices", fecha: enDias(3), desde: "16:00", hasta: "18:00", lugar: "Sala de estudio 1", invitados: { franco: "pendiente", mariana: "aceptada" } },
  fisica: { organizador: "joaquin", titulo: "Práctica de Física I", fecha: enDias(1), desde: "19:00", hasta: "21:00", lugar: "Biblioteca central", invitados: { franco: "aceptada", florencia: "pendiente" } },
};

/** "Repasar matrices · 14/11/2026 · 16:00 a 18:00 · Sala de estudio 1" (como lo escribe la API al invitar). */
const detalleDe = (j: Juntada) => `${j.titulo} · ${fechaParaApi(j.fecha)} · ${j.desde} a ${j.hasta} · ${j.lugar}`;

// =============================================================================
// Apuntes (el seeder le genera un PDF de ejemplo a cada uno)
// =============================================================================

export const APUNTES: { autor: string; materiaId: string; titulo: string; descripcion?: string; fecha: string }[] = [
  { autor: "mariana", materiaId: "MAT-201", titulo: "Resumen de matrices", descripcion: "Operaciones, determinantes e inversa, con ejemplos.", fecha: enDias(-2) },
  { autor: "mariana", materiaId: "MAT-201", titulo: "Parcial 1 resuelto", descripcion: "El parcial del año pasado, paso a paso.", fecha: "2026-09-25" },
  { autor: "mariana", materiaId: "CS-302", titulo: "Ejercicios del TP 2", fecha: "2026-09-10" },
  { autor: "mariana", materiaId: "INF-102", titulo: "Resumen para el final", descripcion: "Todo lo que entra en el final de Programación.", fecha: "2026-07-10" },
  { autor: "elena", materiaId: "CS-302", titulo: "Mapa conceptual de HTTP", descripcion: "Métodos, códigos de estado y cabeceras en una hoja.", fecha: "2026-10-08" },
  { autor: "elena", materiaId: "FIS-204", titulo: "Cinemática: teoría", fecha: "2026-09-30" },
  { autor: "elena", materiaId: "MAT-101", titulo: "Límites y derivadas", descripcion: "Fórmulas y ejercicios resueltos.", fecha: "2026-06-02" },
  { autor: "david", materiaId: "FIS-204", titulo: "Problemas de dinámica", fecha: "2026-10-01" },
  { autor: "tomas", materiaId: "CS-302", titulo: "Flexbox en una hoja", descripcion: "Un resumen visual de justifyContent y alignItems.", fecha: "2026-10-15" },
  { autor: "lucia", materiaId: "MAT-201", titulo: "Guía de ejercicios resueltos de matrices", descripcion: "Los ejercicios de la guía 3, resueltos y comentados.", fecha: enDias(0) },
  { autor: "lucia", materiaId: "CS-302", titulo: "Apuntes de clase: Flexbox y Grid", descripcion: "Lo que se vio en las clases de maquetado.", fecha: "2026-10-20" },
  { autor: "lucia", materiaId: "INF-102", titulo: "Resumen de punteros y memoria", fecha: "2026-07-05" },
  { autor: "joaquin", materiaId: "CS-302", titulo: "Cheatsheet de fetch y async/await", descripcion: "Pedidos HTTP, manejo de errores y estados de carga.", fecha: enDias(0) },
  { autor: "joaquin", materiaId: "FIS-204", titulo: "Ejercicios de cinemática con soluciones", fecha: "2026-10-10" },
  { autor: "sofia", materiaId: "INF-302", titulo: "Normalización: 1FN, 2FN y 3FN", descripcion: "Las tres formas normales con un ejemplo que se va arreglando paso a paso.", fecha: "2026-10-18" },
  { autor: "sofia", materiaId: "INF-301", titulo: "Árboles y grafos: resumen", fecha: "2026-06-20" },
  { autor: "nicolas", materiaId: "INF-401", titulo: "Planificación de procesos", descripcion: "FIFO, SJF, Round Robin y prioridades, con diagramas de Gantt.", fecha: "2026-05-30" },
  { autor: "nicolas", materiaId: "INF-501", titulo: "Patrones de diseño en una hoja", fecha: "2026-10-12" },
  { autor: "nicolas", materiaId: "CS-502", titulo: "Navegación con expo-router", descripcion: "Stack, Tabs y rutas dinámicas con ejemplos.", fecha: "2026-10-22" },
  { autor: "camila", materiaId: "MAT-201", titulo: "Determinantes paso a paso", descripcion: "Laplace, Sarrus y propiedades.", fecha: enDias(-1) },
  { autor: "camila", materiaId: "MAT-101", titulo: "Final de Cálculo resuelto", fecha: "2026-07-12" },
  { autor: "florencia", materiaId: "INF-303", titulo: "Compuertas lógicas y álgebra de Boole", fecha: "2026-09-28" },
  { autor: "agustin", materiaId: "MAT-301", titulo: "Integrales: tabla y métodos", descripcion: "Sustitución, partes y fracciones simples.", fecha: "2026-07-02" },
  { autor: "martin", materiaId: "FIS-204", titulo: "Leyes de Newton con ejemplos", fecha: "2026-10-05" },
  { autor: "bruno", materiaId: "MAT-101", titulo: "Límites: ejercicios del recuperatorio", fecha: "2026-05-02" },
];

// =============================================================================
// Avisos (notificaciones)
// =============================================================================

/**
 * Un aviso de ejemplo.
 *   - `para`: quién lo recibe. `de`: de quién habla (al tocarlo se abre su perfil).
 *   - Los que esperan una respuesta dicen a qué: `solicitudPendiente` (la solicitud
 *     que `de` le mandó a `para`) o `invitacionPendiente` (la clave de la juntada).
 *   - `haceHoras`: cuánto hace que llegó.
 */
export type AvisoDePrueba = {
  para: string;
  tipo: "apunte" | "amistad" | "estudio" | "calendario";
  titulo: string;
  detalle: string;
  de?: string;
  materiaId?: string;
  tipoEvento?: "clase" | "parcial" | "entrega" | "estudio";
  solicitudPendiente?: boolean;
  invitacionPendiente?: string;
  respuesta?: "aceptada" | "rechazada";
  leida?: boolean;
  haceHoras: number;
};

export const AVISOS: AvisoDePrueba[] = [
  // Para Franco
  { para: "franco", tipo: "apunte", titulo: "Lucía Fernández subió un apunte nuevo", detalle: "Álgebra y Geometría · Guía de ejercicios resueltos de matrices", de: "lucia", materiaId: "MAT-201", haceHoras: 1 },
  { para: "franco", tipo: "apunte", titulo: "Mariana Sosa subió un apunte nuevo", detalle: "Álgebra y Geometría · Resumen de matrices", de: "mariana", materiaId: "MAT-201", haceHoras: 2 },
  { para: "franco", tipo: "estudio", titulo: "Lucía Fernández te invitó a estudiar", detalle: detalleDe(JUNTADAS.matrices), de: "lucia", invitacionPendiente: "matrices", haceHoras: 4 },
  { para: "franco", tipo: "amistad", titulo: "Tomás Vega te mandó una solicitud de amistad", detalle: "Cursan juntos Programación Web", de: "tomas", solicitudPendiente: true, haceHoras: 5 },
  { para: "franco", tipo: "apunte", titulo: "Joaquín Álvarez subió un apunte nuevo", detalle: "Programación Web · Cheatsheet de fetch y async/await", de: "joaquin", materiaId: "CS-302", haceHoras: 6 },
  { para: "franco", tipo: "estudio", titulo: "Mariana Sosa te invitó a estudiar", detalle: detalleDe(JUNTADAS.web), de: "mariana", invitacionPendiente: "web", haceHoras: 8 },
  { para: "franco", tipo: "amistad", titulo: "Martín Gómez te mandó una solicitud de amistad", detalle: "Cursan juntos Programación Web", de: "martin", solicitudPendiente: true, haceHoras: 10 },
  { para: "franco", tipo: "estudio", titulo: "Lucía Fernández aceptó tu invitación", detalle: JUNTADAS.repaso.titulo, de: "lucia", leida: true, haceHoras: 20 },
  { para: "franco", tipo: "estudio", titulo: "Joaquín Álvarez te invitó a estudiar", detalle: detalleDe(JUNTADAS.fisica), de: "joaquin", respuesta: "aceptada", leida: true, haceHoras: 28 },
  { para: "franco", tipo: "apunte", titulo: "Camila Medina subió un apunte nuevo", detalle: "Álgebra y Geometría · Determinantes paso a paso", de: "camila", materiaId: "MAT-201", leida: true, haceHoras: 30 },
  { para: "franco", tipo: "amistad", titulo: "Ahora sos amigo de Camila Medina", detalle: "Aceptó tu solicitud de amistad", de: "camila", leida: true, haceHoras: 48 },
  { para: "franco", tipo: "amistad", titulo: "Ahora sos amigo de Mariana Sosa", detalle: "Aceptó tu solicitud de amistad", de: "mariana", leida: true, haceHoras: 50 },
  { para: "franco", tipo: "calendario", tipoEvento: "parcial", titulo: "Se confirmó la fecha del parcial 2", detalle: `Programación Web · ${fechaParaApi(PARCIAL_2.fecha)} · ${PARCIAL_2.desde} · ${PARCIAL_2.lugar}`, leida: true, haceHoras: 52 },
  { para: "franco", tipo: "calendario", tipoEvento: "entrega", titulo: "Se abrió una entrega: TP de Programación", detalle: "Campus virtual · Vence en 3 días a las 23:59", leida: true, haceHoras: 75 },
  // Para los demás
  { para: "mariana", tipo: "apunte", titulo: "Lucía Fernández subió un apunte nuevo", detalle: "Álgebra y Geometría · Guía de ejercicios resueltos de matrices", de: "lucia", materiaId: "MAT-201", haceHoras: 1 },
  { para: "mariana", tipo: "estudio", titulo: "Lucía Fernández te invitó a estudiar", detalle: detalleDe(JUNTADAS.matrices), de: "lucia", respuesta: "aceptada", leida: true, haceHoras: 5 },
  { para: "mariana", tipo: "estudio", titulo: "Franco Díaz te invitó a estudiar", detalle: detalleDe(JUNTADAS.algebra), de: "franco", respuesta: "aceptada", leida: true, haceHoras: 30 },
  { para: "lucia", tipo: "estudio", titulo: "Mariana Sosa aceptó tu invitación", detalle: JUNTADAS.matrices.titulo, de: "mariana", leida: true, haceHoras: 3 },
  { para: "lucia", tipo: "estudio", titulo: "Franco Díaz te invitó a estudiar", detalle: detalleDe(JUNTADAS.repaso), de: "franco", respuesta: "aceptada", leida: true, haceHoras: 22 },
  { para: "joaquin", tipo: "estudio", titulo: "Franco Díaz te invitó a estudiar", detalle: detalleDe(JUNTADAS.repaso), de: "franco", invitacionPendiente: "repaso", haceHoras: 22 },
  { para: "joaquin", tipo: "estudio", titulo: "Franco Díaz aceptó tu invitación", detalle: JUNTADAS.fisica.titulo, de: "franco", leida: true, haceHoras: 27 },
  { para: "florencia", tipo: "estudio", titulo: "Joaquín Álvarez te invitó a estudiar", detalle: detalleDe(JUNTADAS.fisica), de: "joaquin", invitacionPendiente: "fisica", haceHoras: 29 },
  { para: "valentina", tipo: "amistad", titulo: "Franco Díaz te mandó una solicitud de amistad", detalle: "Tocá para ver su perfil", de: "franco", solicitudPendiente: true, haceHoras: 15 },
  { para: "nicolas", tipo: "amistad", titulo: "Agustín Castro te mandó una solicitud de amistad", detalle: "Tocá para ver su perfil", de: "agustin", solicitudPendiente: true, haceHoras: 40 },
];
