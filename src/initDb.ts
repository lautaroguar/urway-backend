// =============================================================================
// src/initDb.ts — Prepara la base SQLite antes de que arranque Express
// =============================================================================
//
// QUÉ HACE, EN ORDEN:
//   1. Abre (o crea) el archivo de la base (`prisma/dev.db`).
//   2. Mira qué VERSIÓN de la base es (`PRAGMA user_version`, un número que SQLite
//      guarda dentro del archivo):
//        - base nueva (sin tablas)       → crea las tablas normalizadas;
//        - base vieja (versión 0, la del sprint 2 sin normalizar) → hace una copia
//          de respaldo y la CONVIERTE a la forma nueva sin perder datos
//          (`migracion.ts`);
//        - base al día                    → no toca nada.
//   3. Los datos de ejemplo:
//        - si no hay ningún usuario, carga los dos lotes (`semilla.ts` y
//          `semillaAmpliada.ts`);
//        - si la base ya tenía datos y es de antes del segundo lote (versión 1), le
//          AGREGA solo el segundo lote, una vez, sin tocar lo que ya tenía.
//
// POR QUÉ CON SQL Y NO CON MIGRACIONES DE PRISMA:
//   Igual que en la práctica de la cátedra: el motor de migraciones de Prisma dio
//   error en Windows. Las tablas se crean una vez con `sqlite3` y todas las
//   consultas del día a día se hacen con Prisma Client. Las columnas de acá
//   tienen que coincidir con `prisma/schema.prisma`.
//
// LAS REGLAS QUE CUIDA LA BASE (además de las que valida Express):
//   - PRIMARY KEY y UNIQUE: nada repetido (un correo, una reseña por cursada...).
//   - REFERENCES (claves foráneas): no se puede apuntar a algo que no existe.
//     `ON DELETE CASCADE` borra lo que depende de lo borrado; `ON DELETE SET NULL`
//     solo lo desvincula.
//   - CHECK: los valores permitidos ("todos" | "amigos", estrellas de 1 a 5...).
//   Express valida ANTES (para devolver un mensaje claro); la base es la última
//   red: aunque hubiera un error en el código, no guarda datos imposibles.
//
// SE PUEDE CORRER SOLO:
//   `npm run db:init`  → prepara la base (y convierte una vieja).
//   `npm run db:reset` → BORRA la base y los archivos subidos y la vuelve a crear
//                        con los datos de ejemplo.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";

import { carpetaArchivos } from "./archivos";
import { borrarTablasViejas, copiarDatosViejos, renombrarTablasViejas } from "./migracion";
import { prisma } from "./prisma";
import { CORRELATIVAS, sembrar } from "./semilla";
import { ampliarSemilla } from "./semillaAmpliada";
import { consultar, ejecutar, tablasDe } from "./sqlite";
import { claveHoy } from "./utiles";

// La base que indica DATABASE_URL ("file:./dev.db"). Prisma toma una ruta relativa
// desde la carpeta `prisma/`, y acá se hace lo mismo para que las tablas se creen en
// el MISMO archivo que después lee Prisma. `__dirname` es `src` (o `dist`
// compilado): en los dos casos `../prisma` es la misma carpeta.
const rutaBase = path.resolve(
  __dirname,
  "../prisma",
  (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "")
);

/**
 * Las versiones de la base (el número que queda en `PRAGMA user_version`):
 *   0 = la del sprint 2 (sin normalizar);
 *   1 = la normalizada (con el primer lote de datos de ejemplo);
 *   2 = la normalizada con el segundo lote de datos de ejemplo.
 * Si algún día cambia otra vez, se suma un número y su paso para llegar a él.
 */
const VERSION_NORMALIZADA = 1;
const VERSION_ACTUAL = 2;

// Una sentencia por tabla, en un orden en que cada tabla existe antes que las
// que la referencian (las FOREIGN KEY).
const TABLAS = [
  // --- La oferta académica -----------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "Facultad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Carrera" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "facultadId" TEXT NOT NULL REFERENCES "Facultad"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Materia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carreraId" TEXT NOT NULL REFERENCES "Carrera"("id"),
    "nombre" TEXT NOT NULL,
    "cuatrimestre" INTEGER NOT NULL CHECK ("cuatrimestre" BETWEEN 1 AND 10),
    "creditos" INTEGER NOT NULL CHECK ("creditos" > 0),
    "profesor" TEXT NOT NULL,
    "dificultadInicial" REAL NOT NULL CHECK ("dificultadInicial" BETWEEN 0 AND 5)
  )`,
  `CREATE TABLE IF NOT EXISTS "Correlativa" (
    "materiaId" TEXT NOT NULL REFERENCES "Materia"("id") ON DELETE CASCADE,
    "requiereId" TEXT NOT NULL REFERENCES "Materia"("id") ON DELETE CASCADE,
    PRIMARY KEY ("materiaId", "requiereId"),
    CHECK ("materiaId" <> "requiereId")
  )`,
  `CREATE TABLE IF NOT EXISTS "Recurso" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materiaId" TEXT NOT NULL REFERENCES "Materia"("id") ON DELETE CASCADE,
    "nombre" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "peso" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "LinkOficial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materiaId" TEXT NOT NULL REFERENCES "Materia"("id") ON DELETE CASCADE,
    "tipo" TEXT NOT NULL CHECK ("tipo" IN ('discord', 'whatsapp', 'campus', 'web', 'repositorio')),
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "url" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Novedad" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "icono" TEXT NOT NULL
  )`,
  // --- Cuentas y sesiones ------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "dni" TEXT,
    "fechaNacimiento" TEXT,
    "carreraId" TEXT NOT NULL REFERENCES "Carrera"("id"),
    "cuatrimestre" INTEGER NOT NULL DEFAULT 1 CHECK ("cuatrimestre" BETWEEN 1 AND 10),
    "hashContrasenia" TEXT NOT NULL,
    "sal" TEXT NOT NULL,
    "verApuntes" TEXT NOT NULL DEFAULT 'todos' CHECK ("verApuntes" IN ('todos', 'amigos')),
    "verNotas" TEXT NOT NULL DEFAULT 'amigos' CHECK ("verNotas" IN ('todos', 'amigos')),
    "foto" TEXT UNIQUE,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Sesion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "hashToken" TEXT NOT NULL UNIQUE,
    "venceEn" DATETIME NOT NULL,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // --- Lo académico de cada estudiante -----------------------------------------
  `CREATE TABLE IF NOT EXISTS "Cursada" (
    "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "materiaId" TEXT NOT NULL REFERENCES "Materia"("id") ON DELETE CASCADE,
    PRIMARY KEY ("usuarioId", "materiaId")
  )`,
  // La clave foránea es DOBLE (usuario + materia) y apunta a la cursada: sin
  // cursada no hay reseña, y al abandonarla la reseña se borra sola.
  `CREATE TABLE IF NOT EXISTS "Resenia" (
    "usuarioId" INTEGER NOT NULL,
    "materiaId" TEXT NOT NULL,
    "estrellas" INTEGER NOT NULL CHECK ("estrellas" BETWEEN 1 AND 5),
    "actualizadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("usuarioId", "materiaId"),
    FOREIGN KEY ("usuarioId", "materiaId") REFERENCES "Cursada"("usuarioId", "materiaId") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Instancia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "materiaId" TEXT NOT NULL REFERENCES "Materia"("id") ON DELETE CASCADE,
    "tipo" TEXT NOT NULL CHECK ("tipo" IN ('parcial', 'recuperatorio', 'tp', 'exposicion', 'final')),
    "nota" INTEGER NOT NULL CHECK ("nota" BETWEEN 1 AND 10),
    "fecha" TEXT NOT NULL,
    "cierraCursada" BOOLEAN NOT NULL DEFAULT 0,
    "recursa" BOOLEAN NOT NULL DEFAULT 0,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // --- La agenda ---------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "Evento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL CHECK ("tipo" IN ('clase', 'parcial', 'entrega', 'estudio')),
    "materiaId" TEXT REFERENCES "Materia"("id") ON DELETE SET NULL,
    "fecha" TEXT NOT NULL,
    "desde" TEXT NOT NULL,
    "hasta" TEXT NOT NULL,
    "lugar" TEXT NOT NULL DEFAULT '',
    "notas" TEXT,
    "frecuencia" TEXT NOT NULL DEFAULT 'nunca'
      CHECK ("frecuencia" IN ('nunca', 'diaria', 'semanal', 'quincenal', 'mensual')),
    "repetirHasta" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ("desde" < "hasta"),
    CHECK ("tipo" <> 'estudio' OR "materiaId" IS NULL)
  )`,
  `CREATE TABLE IF NOT EXISTS "EventoDia" (
    "eventoId" INTEGER NOT NULL REFERENCES "Evento"("id") ON DELETE CASCADE,
    "dia" INTEGER NOT NULL CHECK ("dia" BETWEEN 0 AND 6),
    PRIMARY KEY ("eventoId", "dia")
  )`,
  `CREATE TABLE IF NOT EXISTS "EventoExcepcion" (
    "eventoId" INTEGER NOT NULL REFERENCES "Evento"("id") ON DELETE CASCADE,
    "fecha" TEXT NOT NULL,
    PRIMARY KEY ("eventoId", "fecha")
  )`,
  `CREATE TABLE IF NOT EXISTS "Invitacion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventoId" INTEGER NOT NULL REFERENCES "Evento"("id") ON DELETE CASCADE,
    "invitadoId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "respuesta" TEXT NOT NULL DEFAULT 'pendiente' CHECK ("respuesta" IN ('pendiente', 'aceptada', 'rechazada')),
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("eventoId", "invitadoId")
  )`,
  // --- La comunidad ------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "Solicitud" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "paraId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "estado" TEXT NOT NULL DEFAULT 'pendiente' CHECK ("estado" IN ('pendiente', 'aceptada')),
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("deId", "paraId"),
    CHECK ("deId" <> "paraId")
  )`,
  `CREATE TABLE IF NOT EXISTS "Apunte" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "materiaId" TEXT NOT NULL REFERENCES "Materia"("id") ON DELETE CASCADE,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TEXT NOT NULL,
    "archivo" TEXT UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS "Notificacion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
    "tipo" TEXT NOT NULL CHECK ("tipo" IN ('apunte', 'amistad', 'estudio', 'calendario')),
    "tipoEvento" TEXT CHECK ("tipoEvento" IN ('clase', 'parcial', 'entrega', 'estudio')),
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT 0,
    "estudianteId" INTEGER REFERENCES "Usuario"("id") ON DELETE SET NULL,
    "materiaId" TEXT REFERENCES "Materia"("id") ON DELETE SET NULL,
    "solicitudId" INTEGER REFERENCES "Solicitud"("id") ON DELETE CASCADE,
    "invitacionId" INTEGER REFERENCES "Invitacion"("id") ON DELETE CASCADE,
    "respuesta" TEXT CHECK ("respuesta" IN ('aceptada', 'rechazada')),
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ("solicitudId" IS NULL OR "invitacionId" IS NULL)
  )`,
];

// Los ÍNDICES: como el índice de un libro, hacen rápidas las búsquedas por esas
// columnas (SQLite no los crea solo para las claves foráneas). El primero, además,
// es una REGLA: entre dos personas hay una sola solicitud, en cualquier sentido
// (con el par ordenado de menor a mayor, A→B y B→A son "el mismo par").
const INDICES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "Solicitud_par_key" ON "Solicitud"(min("deId", "paraId"), max("deId", "paraId"))`,
  `CREATE INDEX IF NOT EXISTS "Solicitud_paraId_idx" ON "Solicitud"("paraId")`,
  `CREATE INDEX IF NOT EXISTS "Sesion_usuarioId_idx" ON "Sesion"("usuarioId")`,
  `CREATE INDEX IF NOT EXISTS "Resenia_materiaId_idx" ON "Resenia"("materiaId")`,
  `CREATE INDEX IF NOT EXISTS "Instancia_usuarioId_materiaId_idx" ON "Instancia"("usuarioId", "materiaId")`,
  `CREATE INDEX IF NOT EXISTS "Evento_usuarioId_idx" ON "Evento"("usuarioId")`,
  `CREATE INDEX IF NOT EXISTS "Invitacion_invitadoId_idx" ON "Invitacion"("invitadoId")`,
  `CREATE INDEX IF NOT EXISTS "Apunte_usuarioId_idx" ON "Apunte"("usuarioId")`,
  `CREATE INDEX IF NOT EXISTS "Apunte_materiaId_idx" ON "Apunte"("materiaId")`,
  `CREATE INDEX IF NOT EXISTS "Notificacion_usuarioId_idx" ON "Notificacion"("usuarioId")`,
];

/** Crea las tablas y los índices que falten. */
async function crearTablas(db: sqlite3.Database): Promise<void> {
  for (const sql of [...TABLAS, ...INDICES]) await ejecutar(db, sql);
}

/**
 * Convierte una base de la versión 0 (sin normalizar) a la forma de ahora, TODO
 * dentro de una transacción: si algo falla, `ROLLBACK` deja la base como estaba.
 * Antes, una copia del archivo por las dudas ("dev.respaldo-2026-11-07.db").
 */
async function migrar(db: sqlite3.Database): Promise<void> {
  const respaldo = rutaBase.replace(/\.db$/, "") + `.respaldo-${claveHoy()}.db`;
  fs.copyFileSync(rutaBase, respaldo);
  console.log(`Base vieja: se guardó una copia en ${path.basename(respaldo)} y se convierte a la forma normalizada.`);

  await ejecutar(db, "BEGIN");
  try {
    await renombrarTablasViejas(db); // "Evento" → "_viejo_Evento"...
    await crearTablas(db); //            las tablas nuevas, vacías
    await copiarDatosViejos(db); //      de las viejas a las nuevas, convirtiendo
    await borrarTablasViejas(db);
    // Última revisión: ¿quedó alguna clave foránea apuntando a algo que no existe?
    const rotas = await consultar(db, "PRAGMA foreign_key_check");
    if (rotas.length > 0) throw new Error(`La conversión dejó ${rotas.length} referencias rotas.`);
    await ejecutar(db, `PRAGMA user_version = ${VERSION_NORMALIZADA}`);
    await ejecutar(db, "COMMIT");
  } catch (error) {
    await ejecutar(db, "ROLLBACK");
    throw error;
  }
  // Las tablas viejas dejaron lugar vacío en el archivo: `VACUUM` lo compacta.
  await ejecutar(db, "VACUUM");
}

/** Anota en la base a qué versión llegó (con Prisma: la conexión de sqlite3 ya se cerró). */
async function marcarVersion(version: number): Promise<void> {
  await prisma.$executeRawUnsafe(`PRAGMA user_version = ${version}`);
}

/** Deja la base lista (creada o convertida) y con los datos de ejemplo al día. */
export async function inicializarBase(): Promise<void> {
  fs.mkdirSync(carpetaArchivos, { recursive: true }); // la carpeta de los archivos subidos
  const db = new sqlite3.Database(rutaBase); // si el archivo no existe, sqlite3 lo crea

  let hayUsuarios = false;
  let version = 0;
  try {
    [{ user_version: version }] = await consultar<{ user_version: number }>(db, "PRAGMA user_version");
    const esNueva = !(await tablasDe(db)).includes("Usuario");

    if (esNueva) {
      await crearTablas(db);
      version = VERSION_NORMALIZADA;
      await ejecutar(db, `PRAGMA user_version = ${version}`);
    } else if (version < VERSION_NORMALIZADA) {
      await migrar(db);
      version = VERSION_NORMALIZADA;
    }

    const [{ cantidad }] = await consultar<{ cantidad: number }>(db, `SELECT COUNT(*) AS cantidad FROM "Usuario"`);
    hayUsuarios = cantidad > 0;
  } finally {
    // `finally` cierra la conexión de sqlite3 siempre, salga bien o mal. La carga
    // de datos se hace DESPUÉS, con Prisma, para no tener dos conexiones escribiendo.
    db.close();
  }

  if (!hayUsuarios) {
    // Base vacía: los dos lotes, uno detrás del otro.
    await sembrar(prisma);
    await ampliarSemilla(prisma);
    await marcarVersion(VERSION_ACTUAL);
    console.log("Base nueva: se cargaron los datos de ejemplo.");
    return;
  }

  // Una base de una versión muy vieja no tenía correlatividades (son parte del PLAN,
  // no datos de un usuario): se cargan una sola vez.
  if ((await prisma.correlativa.count()) === 0) {
    await prisma.correlativa.createMany({ data: CORRELATIVAS });
    console.log("Base actualizada: se cargaron las correlatividades del plan.");
  }

  // Una base con datos de antes del segundo lote: se le agrega (una sola vez).
  if (version < VERSION_ACTUAL) {
    await ampliarSemilla(prisma);
    await marcarVersion(VERSION_ACTUAL);
    console.log("Base actualizada: se agregaron los datos de ejemplo nuevos (segundo lote).");
  }
}

/** Borra la base y los archivos subidos (para `npm run db:reset`). */
function borrarTodo() {
  fs.rmSync(rutaBase, { force: true });
  fs.rmSync(carpetaArchivos, { recursive: true, force: true });
}

// Permite ejecutar este archivo directamente (npm run db:init / db:reset).
if (require.main === module) {
  if (process.argv.includes("--reset")) borrarTodo();
  inicializarBase()
    .then(() => console.log("Base de datos lista"))
    .catch((error) => {
      console.error("No se pudo preparar la base de datos", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
