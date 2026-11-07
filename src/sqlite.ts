// =============================================================================
// src/sqlite.ts — Hablar con SQLite "a mano" (con SQL), sin Prisma
// =============================================================================
//
// QUÉ ES:
//   Cuatro funciones chicas para usar el paquete `sqlite3`. Las usan `initDb.ts`
//   (crear las tablas) y `migracion.ts` (poner al día una base vieja): las dos
//   cosas que Prisma Client no hace, porque se trata de CAMBIAR LA FORMA de la base
//   y no de leer o guardar datos.
//
// POR QUÉ PROMESAS:
//   `sqlite3` trabaja con callbacks. Estas funciones los envuelven en promesas
//   para poder usar `async/await` y leer el código de arriba hacia abajo. [JS 14]

import sqlite3 from "sqlite3";

/** Ejecuta una sentencia que no devuelve filas (CREATE, INSERT, UPDATE...). */
export function ejecutar(db: sqlite3.Database, sql: string, parametros: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, parametros, (error) => (error ? reject(error) : resolve()));
  });
}

/** Ejecuta una consulta y devuelve sus filas (SELECT, PRAGMA...). */
export function consultar<T>(db: sqlite3.Database, sql: string, parametros: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, parametros, (error, filas: T[]) => (error ? reject(error) : resolve(filas)));
  });
}

/** Los nombres de las tablas que tiene hoy la base. */
export async function tablasDe(db: sqlite3.Database): Promise<string[]> {
  // `sqlite_master` es la tabla en la que SQLite anota todo lo que contiene la base.
  const filas = await consultar<{ name: string }>(db, `SELECT name FROM sqlite_master WHERE type = 'table'`);
  return filas.map((fila) => fila.name);
}

/** Los nombres de las columnas que tiene hoy una tabla. */
export async function columnasDe(db: sqlite3.Database, tabla: string): Promise<string[]> {
  // `PRAGMA table_info` es el comando de SQLite que describe una tabla.
  const filas = await consultar<{ name: string }>(db, `PRAGMA table_info("${tabla}")`);
  return filas.map((fila) => fila.name);
}
