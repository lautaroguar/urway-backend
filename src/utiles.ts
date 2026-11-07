// =============================================================================
// src/utiles.ts — Funciones auxiliares que usan todas las rutas
// =============================================================================
//
// Son las mismas ideas de la práctica de la cátedra (`leerId`, `noExiste`...):
// convertir y validar lo que llega del cliente ANTES de tocar la base. Express
// decide qué se acepta; Prisma solo guarda. [PRÁCTICA 09: "que el nombre no
// esté vacío es una regla de negocio, y esa sigue siendo tarea de Express"]

import { Prisma } from "@prisma/client";
import type { Response } from "express";

/** Convierte el `:id` de la URL a número. Devuelve `null` si no es un entero positivo. */
export function leerId(valor: unknown): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** ¿Es una fecha "AAAA-MM-DD" que existe en el calendario? */
export function esClaveFecha(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  // Si `Date` la "corrigió" (el 31/02 pasa a marzo), no existía.
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
}

/** ¿Es una hora "HH:MM" válida (00:00 a 23:59)? */
export function esHora(valor: unknown): valor is string {
  return typeof valor === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

/** La fecha de hoy como "AAAA-MM-DD", en hora LOCAL (no UTC). */
export function claveHoy(dia = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dia.getFullYear()}-${dos(dia.getMonth() + 1)}-${dos(dia.getDate())}`;
}

/** Un texto obligatorio: sin espacios en los extremos. Vacío o no-texto → `null`. */
export function textoObligatorio(valor: unknown, maximo = 120): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio.length > 0 && limpio.length <= maximo ? limpio : null;
}

/**
 * `P2025` es el error de Prisma cuando se quiere modificar o borrar un registro
 * que no existe. Se traduce a un 404. [PRÁCTICA 13]
 */
export function noExiste(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/**
 * Responde un error con el formato de toda la API: `{ "error": "mensaje" }`.
 * El status dice de quién es el problema [PRÁCTICA 14]: 400 (datos mal), 401
 * (sin sesión), 403 (sin permiso), 404 (no existe), 409 (repetido), 500 (nuestro).
 */
export function responderError(res: Response, status: number, mensaje: string) {
  return res.status(status).json({ error: mensaje });
}

// -----------------------------------------------------------------------------
// La fecha de nacimiento: la app la escribe DD/MM/AAAA; la base, AAAA-MM-DD
// -----------------------------------------------------------------------------
// En la base TODAS las fechas tienen la misma forma (AAAA-MM-DD): un mismo dato,
// un mismo formato. La conversión se hace acá, en el borde de la API, así la app
// sigue mandando y recibiendo "15/03/2001" como siempre.

/** "15/03/2001" → "2001-03-15", o `null` si no tiene esa forma o la fecha no existe. */
export function fechaParaBase(texto: string): string | null {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!partes) return null;
  const clave = `${partes[3]}-${partes[2]}-${partes[1]}`;
  return esClaveFecha(clave) ? clave : null;
}

/** "2001-03-15" → "15/03/2001" (lo que muestra la app). */
export function fechaParaApi(clave: string): string {
  return clave.split("-").reverse().join("/");
}
