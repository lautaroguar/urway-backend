// =============================================================================
// src/semillaAmpliada.ts — El SEGUNDO lote de datos de ejemplo
// =============================================================================
//
// QUÉ AGREGA (sobre lo que carga `semilla.ts`):
//   - 6 materias más (del 3º al 6º cuatrimestre: el plan queda en 16 materias, tres
//     años) con sus correlativas, y recursos y links oficiales para las que no tenían.
//   - 3 novedades más.
//   - 10 ESTUDIANTES más (contraseña `urway2026`) de distintos cuatrimestres, con
//     historiales variados (materias aprobadas, pendientes de final, recursadas), sus
//     clases, sus reseñas y 16 apuntes con un PDF de ejemplo cada uno.
//   - Amistades entre ellos y con la demo. Franco suma 3 amigos (Lucía, Joaquín y
//     Camila), una solicitud recibida (Martín) y una enviada (Valentina).
//   - En la agenda de Franco: un parcial que cae en el horario de su clase (se ve como
//     círculo), una entrega y una juntada de estudio; más invitaciones y sus avisos.
//
// CUÁNDO SE CARGA (lo decide `initDb.ts`):
//   - Base NUEVA: después del primer lote (`sembrar`).
//   - Base que ya existía (por ejemplo una `dev.db` con datos cargados a mano): UNA
//     sola vez. Solo AGREGA filas, no cambia ni borra nada de lo que ya hay; las
//     cuentas de la demo (Franco, Mariana, Tomás) se buscan por su correo, porque en
//     una base vieja sus ids pueden ser otros. Así todas las copias de la base
//     terminan con los mismos datos nuevos.
//
// TODO O NADA:
//   Se guarda dentro de una transacción (`prisma.$transaction`): si algo falla no
//   queda nada a medias, y se borran los PDF que ya se habían escrito en `uploads/`.

import type { Prisma, PrismaClient } from "@prisma/client";

import { borrarArchivo, guardarArchivo } from "./archivos";
import { hashearContrasenia } from "./seguridad";
import {
  aprobada,
  CARRERA_DEL_PLAN,
  CONTRASENIA_DE_PRUEBA,
  crearUsuarioDePrueba,
  cuatrimestreDeHoy,
  enDias,
  pdfDeEjemplo,
  type UsuarioDePrueba,
} from "./semilla";
import { fechaParaApi } from "./utiles";

/** Un correo que existe solo si este lote ya se cargó (así nunca se carga dos veces). */
export const CORREO_DEL_LOTE = "lucia.fernandez@uca.edu.ar";

/** Las cuentas del primer lote con las que se relacionan los datos nuevos. */
const CUENTAS_DEMO = {
  franco: "franco.diaz@uca.edu.ar",
  mariana: "mariana.sosa@uca.edu.ar",
  tomas: "tomas.vega@uca.edu.ar",
};

// -----------------------------------------------------------------------------
// El plan de estudios: tercer año y lo que faltaba
// -----------------------------------------------------------------------------

const MATERIAS_NUEVAS = [
  { id: "INF-303", nombre: "Arquitectura de Computadoras", cuatrimestre: 3, creditos: 6, profesor: "Dr. John von Neumann", dificultadInicial: 3.5 },
  { id: "MAT-302", nombre: "Probabilidad y Estadística", cuatrimestre: 4, creditos: 6, profesor: "Dr. Andréi Kolmogórov", dificultadInicial: 4 },
  { id: "INF-401", nombre: "Sistemas Operativos", cuatrimestre: 5, creditos: 8, profesor: "Dr. Dennis Ritchie", dificultadInicial: 4 },
  { id: "INF-402", nombre: "Redes de Computadoras", cuatrimestre: 5, creditos: 8, profesor: "Dr. Paul Baran", dificultadInicial: 3.5 },
  { id: "INF-501", nombre: "Ingeniería de Software", cuatrimestre: 6, creditos: 8, profesor: "Dr. Fred Brooks", dificultadInicial: 3 },
  { id: "CS-502", nombre: "Desarrollo de Aplicaciones Móviles", cuatrimestre: 6, creditos: 8, profesor: "Dra. Hedy Lamarr", dificultadInicial: 3.5 },
];

/**
 * Las correlatividades de las materias nuevas (como siempre: hay que tener APROBADA
 * LA CURSADA de `requiereId`).
 *
 *   INF-101 ─▶ INF-303 ─▶ INF-402
 *                 └─────┐
 *   INF-301 ────────────┴▶ INF-401        MAT-201 ─▶ MAT-302
 *      └──────────┐
 *   CS-302 ───────┴▶ CS-502
 *      └──────────┐
 *   INF-302 ──────┴▶ INF-501
 */
const CORRELATIVAS_NUEVAS = [
  { materiaId: "INF-303", requiereId: "INF-101" },
  { materiaId: "MAT-302", requiereId: "MAT-201" },
  { materiaId: "INF-401", requiereId: "INF-301" },
  { materiaId: "INF-401", requiereId: "INF-303" },
  { materiaId: "INF-402", requiereId: "INF-303" },
  { materiaId: "INF-501", requiereId: "CS-302" },
  { materiaId: "INF-501", requiereId: "INF-302" },
  { materiaId: "CS-502", requiereId: "CS-302" },
  { materiaId: "CS-502", requiereId: "INF-301" },
];

// Recursos oficiales para las materias que no tenían (y para las nuevas).
const RECURSOS_NUEVOS = [
  { materiaId: "INF-101", nombre: "Programa de la Materia", formato: "PDF", peso: "850 KB" },
  { materiaId: "FIS-204", nombre: "Programa de la Materia", formato: "PDF", peso: "1.0 MB" },
  { materiaId: "FIS-204", nombre: "Guía de problemas", formato: "PDF", peso: "1.8 MB" },
  { materiaId: "MAT-301", nombre: "Programa de la Materia", formato: "PDF", peso: "1.2 MB" },
  { materiaId: "INF-301", nombre: "Programa de la Materia", formato: "PDF", peso: "900 KB" },
  { materiaId: "INF-301", nombre: "Enunciados de los trabajos prácticos", formato: "DOCX", peso: "320 KB" },
  { materiaId: "INF-302", nombre: "Programa de la Materia", formato: "PDF", peso: "1.1 MB" },
  { materiaId: "FIS-304", nombre: "Programa de la Materia", formato: "PDF", peso: "1.0 MB" },
  { materiaId: "INF-303", nombre: "Programa de la Materia", formato: "PDF", peso: "760 KB" },
  { materiaId: "MAT-302", nombre: "Programa de la Materia", formato: "PDF", peso: "820 KB" },
  { materiaId: "INF-401", nombre: "Programa de la Materia", formato: "PDF", peso: "1.3 MB" },
  { materiaId: "INF-402", nombre: "Programa de la Materia", formato: "PDF", peso: "1.1 MB" },
  { materiaId: "INF-501", nombre: "Programa de la Materia", formato: "PDF", peso: "980 KB" },
  { materiaId: "INF-501", nombre: "Plantilla del documento de requisitos", formato: "DOCX", peso: "210 KB" },
  { materiaId: "CS-502", nombre: "Programa de la Materia", formato: "PDF", peso: "1.0 MB" },
  { materiaId: "CS-502", nombre: "Guía de instalación de Expo", formato: "PDF", peso: "640 KB" },
];

const LINKS_NUEVOS = [
  { materiaId: "INF-101", tipo: "campus", titulo: "Aula virtual", detalle: "Material de clase y cuestionarios", url: "https://campus.uca.edu.ar/course/inf101" },
  { materiaId: "INF-102", tipo: "discord", titulo: "Discord de la cátedra", detalle: "Consultas sobre los ejercicios de programación", url: "https://discord.gg/urway-inf102" },
  { materiaId: "MAT-301", tipo: "campus", titulo: "Aula virtual", detalle: "Prácticas y parciales anteriores", url: "https://campus.uca.edu.ar/course/mat301" },
  { materiaId: "INF-301", tipo: "campus", titulo: "Aula virtual", detalle: "Enunciados y entregas de los TP", url: "https://campus.uca.edu.ar/course/inf301" },
  { materiaId: "INF-301", tipo: "repositorio", titulo: "Repositorio de ejemplos", detalle: "El código de las clases prácticas", url: "https://github.com/urway-uca/inf301-ejemplos" },
  { materiaId: "INF-302", tipo: "campus", titulo: "Aula virtual", detalle: "Guías de SQL y de normalización", url: "https://campus.uca.edu.ar/course/inf302" },
  { materiaId: "INF-501", tipo: "web", titulo: "Tablero del proyecto", detalle: "Las tareas del proyecto integrador", url: "https://tablero.uca.edu.ar/inf501" },
  { materiaId: "CS-502", tipo: "discord", titulo: "Discord de la cátedra", detalle: "Dudas de Expo y React Native", url: "https://discord.gg/urway-cs502" },
  { materiaId: "CS-502", tipo: "repositorio", titulo: "Proyecto base", detalle: "La plantilla de Expo de la materia", url: "https://github.com/urway-uca/cs502-plantilla" },
];

const NOVEDADES_NUEVAS = [
  { titulo: "Semana de la Ingeniería", detalle: "Charlas y talleres abiertos toda la semana que viene en el auditorio central.", icono: "calendario" },
  { titulo: "Biblioteca en horario extendido", detalle: "Durante el período de finales, la biblioteca abre de 8 a 22 h.", icono: "megafono" },
  { titulo: "Encuesta docente", detalle: "Ya podés completar la encuesta de las materias que cursaste este cuatrimestre.", icono: "megafono" },
];

/**
 * El horario de cada materia para los estudiantes nuevos (la "comisión B": los de la
 * demo tienen el suyo en `semilla.ts`). Días: 0 = domingo ... 6 = sábado.
 */
const HORARIOS: Record<string, { dias: number[]; desde: string; hasta: string; lugar: string }> = {
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

// -----------------------------------------------------------------------------
// Los 10 estudiantes nuevos
// -----------------------------------------------------------------------------

const ESTUDIANTES: UsuarioDePrueba[] = [
  {
    clave: "lucia",
    nombre: "Lucía",
    apellido: "Fernández",
    email: "lucia.fernandez@uca.edu.ar",
    dni: "41234567",
    cuatrimestre: 2,
    verApuntes: "todos",
    verNotas: "todos",
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
    clave: "martin",
    nombre: "Martín",
    apellido: "Gómez",
    email: "martin.gomez@uca.edu.ar",
    cuatrimestre: 2,
    verApuntes: "todos",
    verNotas: "amigos",
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
    clave: "sofia",
    nombre: "Sofía",
    apellido: "Romero",
    email: "sofia.romero@uca.edu.ar",
    dni: "40987654",
    cuatrimestre: 4,
    verApuntes: "amigos",
    verNotas: "amigos",
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
    clave: "joaquin",
    nombre: "Joaquín",
    apellido: "Álvarez",
    email: "joaquin.alvarez@uca.edu.ar",
    cuatrimestre: 3,
    verApuntes: "todos",
    verNotas: "todos",
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
    clave: "valentina",
    nombre: "Valentina",
    apellido: "Torres",
    email: "valentina.torres@uca.edu.ar",
    cuatrimestre: 1,
    verApuntes: "todos",
    verNotas: "amigos",
    // Recién empieza: cursa las tres del 1º cuatrimestre y todavía no rindió nada.
    cursando: ["MAT-101", "INF-101", "INF-102"],
    historial: [],
  },
  {
    clave: "nicolas",
    nombre: "Nicolás",
    apellido: "Herrera",
    email: "nicolas.herrera@uca.edu.ar",
    dni: "39876543",
    cuatrimestre: 6,
    verApuntes: "todos",
    verNotas: "todos",
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
    clave: "camila",
    nombre: "Camila",
    apellido: "Medina",
    email: "camila.medina@uca.edu.ar",
    cuatrimestre: 2,
    verApuntes: "amigos",
    verNotas: "amigos",
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
    clave: "agustin",
    nombre: "Agustín",
    apellido: "Castro",
    email: "agustin.castro@uca.edu.ar",
    cuatrimestre: 4,
    verApuntes: "todos",
    verNotas: "amigos",
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
    clave: "florencia",
    nombre: "Florencia",
    apellido: "Ríos",
    email: "florencia.rios@uca.edu.ar",
    cuatrimestre: 3,
    verApuntes: "amigos",
    verNotas: "todos",
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
    clave: "bruno",
    nombre: "Bruno",
    apellido: "Acosta",
    email: "bruno.acosta@uca.edu.ar",
    cuatrimestre: 2,
    verApuntes: "todos",
    verNotas: "amigos",
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

/** Reseñas de dificultad `[estudiante, materia, estrellas]`: cada uno, de materias que arrancó. */
const RESENIAS_NUEVAS: [string, string, number][] = [
  ["lucia", "MAT-101", 3], ["lucia", "INF-101", 2], ["lucia", "INF-102", 3], ["lucia", "MAT-201", 4], ["lucia", "CS-302", 4],
  ["martin", "MAT-101", 4], ["martin", "INF-101", 3], ["martin", "INF-102", 3], ["martin", "FIS-204", 5],
  ["sofia", "MAT-201", 4], ["sofia", "CS-302", 3], ["sofia", "INF-301", 4], ["sofia", "MAT-301", 5],
  ["sofia", "INF-303", 3], ["sofia", "INF-302", 3],
  ["joaquin", "FIS-204", 5], ["joaquin", "CS-302", 4], ["joaquin", "MAT-201", 4], ["joaquin", "INF-301", 4],
  ["valentina", "MAT-101", 4], ["valentina", "INF-102", 3],
  ["nicolas", "MAT-302", 3], ["nicolas", "FIS-304", 5], ["nicolas", "INF-302", 3], ["nicolas", "INF-401", 4],
  ["nicolas", "INF-402", 4], ["nicolas", "INF-501", 3], ["nicolas", "CS-502", 4],
  ["camila", "MAT-101", 3], ["camila", "INF-101", 2], ["camila", "INF-102", 4], ["camila", "MAT-201", 5],
  ["agustin", "MAT-301", 5], ["agustin", "FIS-204", 4], ["agustin", "FIS-304", 5], ["agustin", "MAT-302", 3],
  ["florencia", "CS-302", 3], ["florencia", "INF-303", 3], ["florencia", "INF-301", 4],
  ["bruno", "MAT-101", 5], ["bruno", "CS-302", 4],
];

/** Amistades ya aceptadas `[quien la mandó, quien la aceptó]`. */
const AMISTADES: [string, string][] = [
  ["lucia", "franco"], ["franco", "joaquin"], ["franco", "camila"],
  ["lucia", "sofia"], ["sofia", "nicolas"], ["lucia", "florencia"], ["joaquin", "florencia"],
  ["mariana", "lucia"], ["tomas", "bruno"], ["nicolas", "martin"], ["camila", "lucia"],
];

/** Los apuntes (cada uno con un PDF de ejemplo). */
const APUNTES: { autor: string; materiaId: string; titulo: string; descripcion?: string; fecha: string }[] = [
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

// -----------------------------------------------------------------------------
// Cargar el lote
// -----------------------------------------------------------------------------

/** Una juntada de estudio, para armar el evento y el texto de su invitación. */
type DatosJuntada = { titulo: string; fecha: string; desde: string; hasta: string; lugar: string; notas?: string };

/** "Repasar matrices · 10/11/2026 · 16:00 a 18:00 · Sala de estudio 1" (como lo escribe `invitar`). */
const detalleDe = (j: DatosJuntada) =>
  `${j.titulo} · ${fechaParaApi(j.fecha)} · ${j.desde} a ${j.hasta} · ${j.lugar}`;

/** Agrega el segundo lote de datos de ejemplo (si todavía no está). */
export async function ampliarSemilla(prisma: PrismaClient): Promise<void> {
  // ¿Ya está cargado? Entonces no hay nada que hacer.
  if (await prisma.usuario.findUnique({ where: { email: CORREO_DEL_LOTE } })) return;

  // Las cuentas de la demo, por su correo.
  const ids: Record<string, number> = {};
  for (const [clave, email] of Object.entries(CUENTAS_DEMO)) {
    const cuenta = await prisma.usuario.findUnique({ where: { email } });
    if (!cuenta) {
      console.warn(`Falta la cuenta ${email}: no se agregan los datos de ejemplo nuevos.`);
      return;
    }
    ids[clave] = cuenta.id;
  }

  // Lo lento va ANTES de la transacción, para que dure poco: el hash de cada
  // contraseña y los PDF de los apuntes (que se escriben en `uploads/`).
  const claves = await Promise.all(ESTUDIANTES.map(() => hashearContrasenia(CONTRASENIA_DE_PRUEBA)));
  const archivos: string[] = [];
  try {
    for (const apunte of APUNTES) {
      archivos.push(await guardarArchivo(pdfDeEjemplo(apunte.titulo, apunte.materiaId), "pdf"));
    }
    // `timeout`: cuánto puede durar la transacción (por defecto son 5 segundos).
    await prisma.$transaction((tx) => cargarLote(tx, ids, claves, archivos), { timeout: 60_000 });
  } catch (error) {
    // No quedó nada en la base: los PDF ya escritos sobran.
    for (const archivo of archivos) await borrarArchivo(archivo);
    throw error;
  }
}

/** Guarda todo el lote con el cliente de la transacción (`tx`). */
async function cargarLote(
  tx: Prisma.TransactionClient,
  ids: Record<string, number>,
  claves: { hash: string; sal: string }[],
  archivos: string[]
) {
  // 1) El plan: materias nuevas (de la misma carrera), correlativas, recursos, links y novedades.
  await tx.materia.createMany({ data: MATERIAS_NUEVAS.map((m) => ({ ...m, carreraId: CARRERA_DEL_PLAN })) });
  await tx.correlativa.createMany({ data: CORRELATIVAS_NUEVAS });
  await tx.recurso.createMany({ data: RECURSOS_NUEVOS });
  await tx.linkOficial.createMany({ data: LINKS_NUEVOS });
  await tx.novedad.createMany({ data: NOVEDADES_NUEVAS });
  // El nombre de cada materia (para el título de las clases).
  const nombres = Object.fromEntries((await tx.materia.findMany()).map((m) => [m.id, m.nombre]));

  // 2) Los estudiantes, con sus cursadas y su historial.
  for (const [i, u] of ESTUDIANTES.entries()) {
    ids[u.clave] = await crearUsuarioDePrueba(tx, u, claves[i].hash, claves[i].sal);
  }
  const { franco, mariana, lucia, martin, joaquin, valentina, nicolas, camila, agustin, florencia, sofia } = ids;

  // 3) Las reseñas.
  await tx.resenia.createMany({
    data: RESENIAS_NUEVAS.map(([clave, materiaId, estrellas]) => ({ usuarioId: ids[clave], materiaId, estrellas })),
  });

  // 4) Las amistades aceptadas y las tres solicitudes pendientes (estas, una por una:
  //    sus avisos necesitan el id de la solicitud).
  await tx.solicitud.createMany({
    data: AMISTADES.map(([de, para]) => ({ deId: ids[de], paraId: ids[para], estado: "aceptada" })),
  });
  const deMartin = await tx.solicitud.create({ data: { deId: martin, paraId: franco } });
  const aValentina = await tx.solicitud.create({ data: { deId: franco, paraId: valentina } });
  const deAgustin = await tx.solicitud.create({ data: { deId: agustin, paraId: nicolas } });

  // 5) Las clases de cada estudiante nuevo: una por cada materia que cursa ahora,
  //    todas las semanas del cuatrimestre en sus días (filas de `EventoDia`).
  const cuatri = cuatrimestreDeHoy();
  for (const u of ESTUDIANTES) {
    for (const materiaId of u.cursando) {
      const { dias, ...horario } = HORARIOS[materiaId];
      await tx.evento.create({
        data: {
          usuarioId: ids[u.clave],
          titulo: nombres[materiaId],
          tipo: "clase",
          materiaId,
          fecha: cuatri.inicio,
          ...horario,
          frecuencia: "semanal",
          repetirHasta: cuatri.fin,
          dias: { create: dias.map((dia) => ({ dia })) },
        },
      });
    }
  }

  // 6) Parciales y entregas. El parcial de Franco es en 7 días (el mismo día de la
  //    semana que hoy) a la hora de su clase de Programación Web: en la agenda se ve
  //    como un círculo dentro de la clase.
  const parcialFranco = { fecha: enDias(7), desde: "11:30", lugar: "Laboratorio 4" };
  const fechas = [
    { usuarioId: franco, titulo: "Parcial 2 de Programación Web", tipo: "parcial", materiaId: "CS-302", ...parcialFranco, hasta: "13:30", notas: "Fetch, Context y navegación con expo-router." },
    { usuarioId: franco, titulo: "Entrega del TP 3 de Programación Web", tipo: "entrega", materiaId: "CS-302", fecha: enDias(12), desde: "23:00", hasta: "23:59", lugar: "Campus virtual", notas: "Subir el link al repositorio y el video de la demo." },
    { usuarioId: sofia, titulo: "Parcial de Bases de Datos", tipo: "parcial", materiaId: "INF-302", fecha: enDias(6), desde: "18:00", hasta: "21:00", lugar: "Laboratorio 3" },
    { usuarioId: nicolas, titulo: "Entrega del documento de requisitos", tipo: "entrega", materiaId: "INF-501", fecha: enDias(9), desde: "20:00", hasta: "21:00", lugar: "Campus virtual" },
  ];
  for (const evento of fechas) await tx.evento.create({ data: evento });

  // 7) Las juntadas de estudio (sin materia) y sus invitaciones (solo a amigos).
  //    Devuelve el id de la invitación de cada invitado.
  const juntada = async (organizadorId: number, datos: DatosJuntada, invitados: [number, string][]) => {
    const evento = await tx.evento.create({ data: { usuarioId: organizadorId, tipo: "estudio", ...datos } });
    const invitaciones: Record<number, number> = {};
    for (const [invitadoId, respuesta] of invitados) {
      const invitacion = await tx.invitacion.create({ data: { eventoId: evento.id, invitadoId, respuesta } });
      invitaciones[invitadoId] = invitacion.id;
    }
    return invitaciones;
  };
  const repaso: DatosJuntada = { titulo: "Repaso para el parcial de Web", fecha: enDias(5), desde: "17:00", hasta: "19:00", lugar: "Biblioteca central", notas: "Traer los TP anteriores." };
  const matrices: DatosJuntada = { titulo: "Repasar matrices", fecha: enDias(3), desde: "16:00", hasta: "18:00", lugar: "Sala de estudio 1" };
  const fisica: DatosJuntada = { titulo: "Práctica de Física I", fecha: enDias(1), desde: "19:00", hasta: "21:00", lugar: "Biblioteca central" };
  const invRepaso = await juntada(franco, repaso, [[lucia, "aceptada"], [joaquin, "pendiente"]]);
  const invMatrices = await juntada(lucia, matrices, [[franco, "pendiente"], [mariana, "aceptada"]]);
  const invFisica = await juntada(joaquin, fisica, [[franco, "aceptada"], [florencia, "pendiente"]]);

  // 8) Los apuntes, cada uno con su PDF (ya escrito en `uploads/`).
  await tx.apunte.createMany({
    data: APUNTES.map(({ autor, ...apunte }, i) => ({ ...apunte, usuarioId: ids[autor], archivo: archivos[i] })),
  });

  // 9) Los avisos. Los que esperan respuesta apuntan a su solicitud o invitación.
  const haceHoras = (h: number) => new Date(Date.now() - h * 3600000);
  // "Lucía Fernández subió un apunte nuevo" (su primer apunte de esa materia). El `!`
  // le asegura a TypeScript que `find` lo encuentra (los datos son nuestros).
  const subio = (autor: string, materiaId: string, horas: number, leida = false) => {
    const persona = ESTUDIANTES.find((e) => e.clave === autor)!;
    const apunte = APUNTES.find((a) => a.autor === autor && a.materiaId === materiaId)!;
    return {
      tipo: "apunte",
      titulo: `${persona.nombre} ${persona.apellido} subió un apunte nuevo`,
      detalle: `${nombres[materiaId]} · ${apunte.titulo}`,
      estudianteId: ids[autor],
      materiaId,
      leida,
      creadaEn: haceHoras(horas),
    };
  };
  await tx.notificacion.createMany({
    data: [
      // Para Franco:
      { usuarioId: franco, ...subio("lucia", "MAT-201", 1) },
      { usuarioId: franco, tipo: "estudio", titulo: "Lucía Fernández te invitó a estudiar", detalle: detalleDe(matrices), estudianteId: lucia, invitacionId: invMatrices[franco], creadaEn: haceHoras(4) },
      { usuarioId: franco, ...subio("joaquin", "CS-302", 6) },
      { usuarioId: franco, tipo: "amistad", titulo: "Martín Gómez te mandó una solicitud de amistad", detalle: "Cursan juntos Programación Web", estudianteId: martin, solicitudId: deMartin.id, creadaEn: haceHoras(10) },
      { usuarioId: franco, tipo: "estudio", titulo: "Lucía Fernández aceptó tu invitación", detalle: repaso.titulo, estudianteId: lucia, leida: true, creadaEn: haceHoras(20) },
      { usuarioId: franco, tipo: "estudio", titulo: "Joaquín Álvarez te invitó a estudiar", detalle: detalleDe(fisica), estudianteId: joaquin, respuesta: "aceptada", leida: true, creadaEn: haceHoras(28) },
      { usuarioId: franco, ...subio("camila", "MAT-201", 30, true) },
      { usuarioId: franco, tipo: "amistad", titulo: "Ahora sos amigo de Camila Medina", detalle: "Aceptó tu solicitud de amistad", estudianteId: camila, leida: true, creadaEn: haceHoras(48) },
      { usuarioId: franco, tipo: "calendario", tipoEvento: "parcial", titulo: "Se confirmó la fecha del parcial 2", detalle: `Programación Web · ${fechaParaApi(parcialFranco.fecha)} · ${parcialFranco.desde} · ${parcialFranco.lugar}`, leida: true, creadaEn: haceHoras(52) },
      // Para los demás:
      { usuarioId: mariana, ...subio("lucia", "MAT-201", 1) },
      { usuarioId: mariana, tipo: "estudio", titulo: "Lucía Fernández te invitó a estudiar", detalle: detalleDe(matrices), estudianteId: lucia, respuesta: "aceptada", leida: true, creadaEn: haceHoras(5) },
      { usuarioId: lucia, tipo: "estudio", titulo: "Mariana Sosa aceptó tu invitación", detalle: matrices.titulo, estudianteId: mariana, leida: true, creadaEn: haceHoras(3) },
      { usuarioId: lucia, tipo: "estudio", titulo: "Franco Díaz te invitó a estudiar", detalle: detalleDe(repaso), estudianteId: franco, respuesta: "aceptada", leida: true, creadaEn: haceHoras(22) },
      { usuarioId: joaquin, tipo: "estudio", titulo: "Franco Díaz te invitó a estudiar", detalle: detalleDe(repaso), estudianteId: franco, invitacionId: invRepaso[joaquin], creadaEn: haceHoras(22) },
      { usuarioId: joaquin, tipo: "estudio", titulo: "Franco Díaz aceptó tu invitación", detalle: fisica.titulo, estudianteId: franco, leida: true, creadaEn: haceHoras(27) },
      { usuarioId: florencia, tipo: "estudio", titulo: "Joaquín Álvarez te invitó a estudiar", detalle: detalleDe(fisica), estudianteId: joaquin, invitacionId: invFisica[florencia], creadaEn: haceHoras(29) },
      { usuarioId: valentina, tipo: "amistad", titulo: "Franco Díaz te mandó una solicitud de amistad", detalle: "Tocá para ver su perfil", estudianteId: franco, solicitudId: aValentina.id, creadaEn: haceHoras(15) },
      { usuarioId: nicolas, tipo: "amistad", titulo: "Agustín Castro te mandó una solicitud de amistad", detalle: "Tocá para ver su perfil", estudianteId: agustin, solicitudId: deAgustin.id, creadaEn: haceHoras(40) },
    ],
  });
}
