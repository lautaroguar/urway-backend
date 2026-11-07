// =============================================================================
// src/migracion.ts — Convierte una base VIEJA (sin normalizar) a la forma de ahora
// =============================================================================
//
// CUÁNDO SE USA:
//   Solo si al arrancar se encuentra una base de la versión 0 (la del sprint 2, antes
//   de normalizar). Lo decide y lo ordena `initDb.ts`, dentro de una transacción.
//   Una base nueva nunca pasa por acá.
//
// CÓMO (la receta que recomienda SQLite para cambiar la forma de una tabla):
//   1. `renombrarTablasViejas`: cada tabla vieja pasa a llamarse "_viejo_<nombre>".
//   2. `initDb.ts` crea las tablas nuevas (vacías) con sus nombres de siempre.
//   3. `copiarDatosViejos`: copia los datos con `INSERT ... SELECT`, convirtiendo
//      lo que cambió de forma.
//   4. `borrarTablasViejas`: borra las "_viejo_...".
//
// QUÉ SE CONVIERTE (lo que la normalización cambió):
//   - Usuario.facultad / Usuario.carrera (texto) → tablas `Facultad` y `Carrera`, y
//     el usuario apunta a su carrera (`carreraId`). El plan (las materias) también.
//   - Usuario.fechaNacimiento "DD/MM/AAAA" → "AAAA-MM-DD", como todas las fechas.
//   - Materia.dificultad → `dificultadInicial` (el nombre dice lo que es); la columna
//     sobrante `resenias` de una versión anterior no se copia.
//   - Recurso: solo los "oficiales" (los de la comunidad son apuntes) y con id
//     numérico (el id de texto "MAT-101-1" repetía la materia).
//   - Cursada: solo las ARRANCADAS (`iniciada = 1`, o `bloqueada = 0` en la versión
//     más vieja). Una fila con "no arrancada" no decía nada que la falta de fila no diga.
//   - Resenia: solo las de una cursada arrancada (la regla de siempre).
//   - Evento.dias '[1,3]' y Evento.excepciones '["2026-10-24"]' → una fila por valor
//     en `EventoDia` y `EventoExcepcion`. `json_each` es la función de SQLite que
//     "abre" un texto JSON en filas. Una juntada de estudio queda sin materia.
//   - Apunte.creadoEn no se copia: repetía `fecha` (el día en que se subió).
//   - Notificacion.pendienteClase + pendienteId (que apuntaba a veces a un USUARIO y a
//     veces a una INVITACIÓN) → `solicitudId` o `invitacionId`, claves foráneas de verdad.
//   - Se conservan los ids y el contador de cada tabla (`sqlite_sequence`), así los
//     ids nuevos nunca repiten uno que ya se usó.

import type sqlite3 from "sqlite3";

import { CARRERA_DEL_PLAN, CARRERAS, FACULTADES } from "./semilla";
import { columnasDe, ejecutar, tablasDe } from "./sqlite";

/** Las tablas que podía tener una base vieja. */
const TABLAS_VIEJAS = [
  "Usuario", "Sesion", "Materia", "Correlativa", "Recurso", "LinkOficial", "Novedad",
  "Cursada", "Resenia", "Instancia", "Evento", "Invitacion", "Solicitud", "Apunte",
  "Notificacion",
];

/** Las tablas con ids AUTOINCREMENT cuyos ids se conservan al copiar. */
const CON_CONTADOR = [
  "Usuario", "Sesion", "LinkOficial", "Novedad", "Instancia", "Evento", "Invitacion",
  "Solicitud", "Apunte", "Notificacion",
];

const vieja = (tabla: string) => `"_viejo_${tabla}"`;

/** Paso 1: "Evento" → "_viejo_Evento" (las que existan). */
export async function renombrarTablasViejas(db: sqlite3.Database): Promise<void> {
  const existentes = await tablasDe(db);
  for (const tabla of TABLAS_VIEJAS) {
    if (existentes.includes(tabla)) await ejecutar(db, `ALTER TABLE "${tabla}" RENAME TO ${vieja(tabla)}`);
  }
}

/** Paso 4: borra las tablas "_viejo_...". */
export async function borrarTablasViejas(db: sqlite3.Database): Promise<void> {
  const existentes = await tablasDe(db);
  for (const tabla of TABLAS_VIEJAS) {
    if (existentes.includes(`_viejo_${tabla}`)) await ejecutar(db, `DROP TABLE ${vieja(tabla)}`);
  }
}

/** Paso 3: copia los datos de las tablas viejas a las nuevas. */
export async function copiarDatosViejos(db: sqlite3.Database): Promise<void> {
  const existentes = await tablasDe(db);
  const hay = (tabla: string) => existentes.includes(`_viejo_${tabla}`);
  // Una columna de una tabla vieja, o `siFalta` si esa versión todavía no la tenía.
  const columna = async (tabla: string, nombre: string, siFalta = "NULL") =>
    (await columnasDe(db, `_viejo_${tabla}`)).includes(nombre) ? `"${nombre}"` : siFalta;

  // --- La oferta académica ---------------------------------------------------
  // Primero el catálogo de siempre (con sus nombres lindos) y después, por las dudas,
  // cualquier otra facultad o carrera que aparezca en los usuarios.
  for (const f of FACULTADES) {
    await ejecutar(db, `INSERT INTO "Facultad" ("id", "nombre") VALUES (?, ?)`, [f.id, f.nombre]);
  }
  for (const c of CARRERAS) {
    await ejecutar(db, `INSERT INTO "Carrera" ("id", "nombre", "facultadId") VALUES (?, ?, ?)`, [
      c.id,
      c.nombre,
      c.facultadId,
    ]);
  }
  await ejecutar(db, `INSERT OR IGNORE INTO "Facultad" ("id", "nombre")
    SELECT DISTINCT "facultad", "facultad" FROM ${vieja("Usuario")}`);
  await ejecutar(db, `INSERT OR IGNORE INTO "Carrera" ("id", "nombre", "facultadId")
    SELECT "carrera", "carrera", MIN("facultad") FROM ${vieja("Usuario")} GROUP BY "carrera"`);

  // El plan: era uno solo, el de la carrera de la demo.
  await ejecutar(
    db,
    `INSERT INTO "Materia" ("id", "carreraId", "nombre", "cuatrimestre", "creditos", "profesor", "dificultadInicial")
     SELECT "id", ?, "nombre", "cuatrimestre", "creditos", "profesor", "dificultad" FROM ${vieja("Materia")}`,
    [CARRERA_DEL_PLAN]
  );
  const materiaExiste = (col: string) => `${col} IN (SELECT "id" FROM "Materia")`;

  if (hay("Correlativa")) {
    await ejecutar(db, `INSERT OR IGNORE INTO "Correlativa" ("materiaId", "requiereId")
      SELECT "materiaId", "requiereId" FROM ${vieja("Correlativa")}
      WHERE ${materiaExiste('"materiaId"')} AND ${materiaExiste('"requiereId"')} AND "materiaId" <> "requiereId"`);
  }
  await ejecutar(db, `INSERT INTO "Recurso" ("materiaId", "nombre", "formato", "peso")
    SELECT "materiaId", "nombre", "formato", "peso" FROM ${vieja("Recurso")}
    WHERE "categoria" = 'oficiales' AND ${materiaExiste('"materiaId"')} ORDER BY rowid`);
  await ejecutar(db, `INSERT INTO "LinkOficial" ("id", "materiaId", "tipo", "titulo", "detalle", "url")
    SELECT "id", "materiaId", "tipo", "titulo", "detalle", "url" FROM ${vieja("LinkOficial")}
    WHERE ${materiaExiste('"materiaId"')}`);
  await ejecutar(db, `INSERT INTO "Novedad" ("id", "titulo", "detalle", "icono")
    SELECT "id", "titulo", "detalle", "icono" FROM ${vieja("Novedad")}`);

  // --- Cuentas y sesiones ----------------------------------------------------
  // "15/03/2001" → "2001-03-15" (`substr(texto, desde, cuántos)` corta un pedazo).
  await ejecutar(db, `INSERT INTO "Usuario" ("id", "nombre", "apellido", "email", "dni", "fechaNacimiento",
      "carreraId", "cuatrimestre", "hashContrasenia", "sal", "verApuntes", "verNotas", "foto", "creadoEn")
    SELECT "id", "nombre", "apellido", "email", NULLIF("dni", ''),
      CASE WHEN "fechaNacimiento" LIKE '__/__/____'
           THEN substr("fechaNacimiento", 7, 4) || '-' || substr("fechaNacimiento", 4, 2) || '-' || substr("fechaNacimiento", 1, 2)
           ELSE NULLIF("fechaNacimiento", '') END,
      "carrera", "cuatrimestre", "hashContrasenia", "sal", "verApuntes", "verNotas",
      NULLIF(${await columna("Usuario", "foto")}, ''), "creadoEn"
    FROM ${vieja("Usuario")}`);
  await ejecutar(db, `INSERT INTO "Sesion" ("id", "usuarioId", "hashToken", "venceEn", "creadaEn")
    SELECT "id", "usuarioId", "hashToken", "venceEn", "creadaEn" FROM ${vieja("Sesion")}`);

  // --- Lo académico ----------------------------------------------------------
  const arrancada = (await columnasDe(db, "_viejo_Cursada")).includes("iniciada")
    ? `"iniciada" = 1`
    : `"bloqueada" = 0`;
  await ejecutar(db, `INSERT INTO "Cursada" ("usuarioId", "materiaId")
    SELECT "usuarioId", "materiaId" FROM ${vieja("Cursada")}
    WHERE ${arrancada} AND ${materiaExiste('"materiaId"')}`);
  if (hay("Resenia")) {
    await ejecutar(db, `INSERT INTO "Resenia" ("usuarioId", "materiaId", "estrellas", "actualizadaEn")
      SELECT r."usuarioId", r."materiaId", r."estrellas", r."actualizadaEn" FROM ${vieja("Resenia")} AS r
      WHERE EXISTS (SELECT 1 FROM "Cursada" AS c WHERE c."usuarioId" = r."usuarioId" AND c."materiaId" = r."materiaId")`);
  }
  await ejecutar(db, `INSERT INTO "Instancia" ("id", "usuarioId", "materiaId", "tipo", "nota", "fecha",
      "cierraCursada", "recursa", "creadaEn")
    SELECT "id", "usuarioId", "materiaId", "tipo", "nota", "fecha", "cierraCursada", "recursa", "creadaEn"
    FROM ${vieja("Instancia")} WHERE ${materiaExiste('"materiaId"')}`);

  // --- La agenda -------------------------------------------------------------
  await ejecutar(db, `INSERT INTO "Evento" ("id", "usuarioId", "titulo", "tipo", "materiaId", "fecha", "desde",
      "hasta", "lugar", "notas", "frecuencia", "repetirHasta", "creadoEn")
    SELECT "id", "usuarioId", "titulo", "tipo",
      CASE WHEN "tipo" = 'estudio' OR NOT ${materiaExiste('"materiaId"')} THEN NULL ELSE "materiaId" END,
      "fecha", "desde", "hasta", "lugar", "notas", "frecuencia", "repetirHasta", "creadoEn"
    FROM ${vieja("Evento")}`);
  // Las listas en texto JSON, abiertas en filas: un día (o una fecha) por fila.
  await ejecutar(db, `INSERT OR IGNORE INTO "EventoDia" ("eventoId", "dia")
    SELECT e."id", j."value" FROM ${vieja("Evento")} AS e, json_each(e."dias") AS j
    WHERE json_valid(e."dias") AND j."value" BETWEEN 0 AND 6`);
  await ejecutar(db, `INSERT OR IGNORE INTO "EventoExcepcion" ("eventoId", "fecha")
    SELECT e."id", j."value" FROM ${vieja("Evento")} AS e, json_each(e."excepciones") AS j
    WHERE json_valid(e."excepciones")`);
  await ejecutar(db, `INSERT INTO "Invitacion" ("id", "eventoId", "invitadoId", "respuesta", "creadaEn")
    SELECT "id", "eventoId", "invitadoId", "respuesta", "creadaEn" FROM ${vieja("Invitacion")}
    WHERE "eventoId" IN (SELECT "id" FROM "Evento")`);

  // --- La comunidad ----------------------------------------------------------
  // `OR IGNORE`: si hubiera A→B y B→A, queda la primera (el índice del par no deja dos).
  await ejecutar(db, `INSERT OR IGNORE INTO "Solicitud" ("id", "deId", "paraId", "estado", "creadaEn")
    SELECT "id", "deId", "paraId", "estado", "creadaEn" FROM ${vieja("Solicitud")}
    WHERE "deId" <> "paraId" ORDER BY "id"`);
  await ejecutar(db, `INSERT INTO "Apunte" ("id", "usuarioId", "materiaId", "titulo", "descripcion", "fecha", "archivo")
    SELECT "id", "usuarioId", "materiaId", "titulo", ${await columna("Apunte", "descripcion")}, "fecha",
      NULLIF("archivo", '')
    FROM ${vieja("Apunte")} WHERE ${materiaExiste('"materiaId"')}`);
  // Lo pendiente: una "solicitud" guardaba el id de QUIEN LA MANDÓ (hay que buscar la
  // solicitud pendiente de esa persona a este usuario); una "invitacion", su propio id.
  await ejecutar(db, `INSERT INTO "Notificacion" ("id", "usuarioId", "tipo", "tipoEvento", "titulo", "detalle",
      "leida", "estudianteId", "materiaId", "solicitudId", "invitacionId", "respuesta", "creadaEn")
    SELECT n."id", n."usuarioId", n."tipo", n."tipoEvento", n."titulo", n."detalle", n."leida",
      CASE WHEN n."estudianteId" IN (SELECT "id" FROM "Usuario") THEN n."estudianteId" END,
      CASE WHEN ${materiaExiste('n."materiaId"')} THEN n."materiaId" END,
      CASE WHEN n."pendienteClase" = 'solicitud' THEN
        (SELECT s."id" FROM "Solicitud" AS s
         WHERE s."deId" = n."pendienteId" AND s."paraId" = n."usuarioId" AND s."estado" = 'pendiente') END,
      CASE WHEN n."pendienteClase" = 'invitacion' THEN
        (SELECT i."id" FROM "Invitacion" AS i WHERE i."id" = n."pendienteId") END,
      n."respuesta", n."creadaEn"
    FROM ${vieja("Notificacion")} AS n`);

  // --- Los contadores de ids -------------------------------------------------
  // `sqlite_sequence` guarda el último id que dio cada tabla AUTOINCREMENT. Se copia
  // el de la tabla vieja: si se había borrado el evento 12, el próximo sigue siendo el 13.
  for (const tabla of CON_CONTADOR) {
    if (!hay(tabla)) continue;
    await ejecutar(db, `DELETE FROM sqlite_sequence WHERE "name" = ?`, [tabla]);
    await ejecutar(db, `INSERT INTO sqlite_sequence ("name", "seq")
      SELECT ?, "seq" FROM sqlite_sequence WHERE "name" = ?`, [tabla, `_viejo_${tabla}`]);
  }
}
