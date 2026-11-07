// =============================================================================
// src/seguridad.ts — Contraseñas, tokens de sesión y el "portero" de las rutas
// =============================================================================
//
// QUÉ RESUELVE:
//   1. CONTRASEÑAS: nunca se guardan. Se guarda su HASH con scrypt y una "sal"
//      al azar. Un hash no se puede dar vuelta: para validar un ingreso se
//      calcula el hash de lo que escribió la persona y se compara.
//   2. SESIONES: al ingresar, el servidor crea un TOKEN al azar (64 caracteres)
//      y se lo da a la app, que lo guarda cifrado (SecureStore). En la base se
//      guarda el SHA-256 del token: si alguien leyera la base, no podría usarlo.
//      La sesión vence a los 30 días. Las vencidas se BORRAN solas: al arrancar el
//      servidor, una vez por hora, y en el momento en que alguien intenta usar una.
//   3. EL PORTERO (`requiereSesion`): un middleware que corre ANTES de cada ruta
//      privada. Lee el header `Authorization: Bearer <token>`, busca la sesión
//      y, si es válida, deja pasar con el id del usuario en `res.locals`. Si no,
//      corta con 401.
//
// TODO SALE DE `node:crypto`: viene con Node, no hace falta instalar nada.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";

import { prisma } from "./prisma";
import { responderError } from "./utiles";

// `scrypt` trabaja con callbacks; `promisify` lo convierte en una función que
// devuelve una promesa, para usarla con `await`.
const scryptAsync = promisify(scrypt) as (
  texto: string,
  sal: string,
  largo: number
) => Promise<Buffer>;

/** Cuánto dura una sesión: 30 días, en milisegundos. */
const DURACION_SESION = 30 * 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// Contraseñas
// -----------------------------------------------------------------------------

/** Calcula el hash de una contraseña nueva. Devuelve el hash y la sal (las dos se guardan). */
export async function hashearContrasenia(contrasenia: string) {
  const sal = randomBytes(16).toString("hex"); // 16 bytes al azar → 32 caracteres
  const hash = await scryptAsync(contrasenia, sal, 64);
  return { hash: hash.toString("hex"), sal };
}

/** ¿La contraseña escrita corresponde al hash guardado? */
export async function verificarContrasenia(
  contrasenia: string,
  hashGuardado: string,
  sal: string
): Promise<boolean> {
  const calculado = await scryptAsync(contrasenia, sal, 64);
  const guardado = Buffer.from(hashGuardado, "hex");
  // `timingSafeEqual` compara en tiempo constante: no da pistas por lo que tarda.
  return guardado.length === calculado.length && timingSafeEqual(guardado, calculado);
}

// -----------------------------------------------------------------------------
// Tokens de sesión
// -----------------------------------------------------------------------------

/** SHA-256 de un token: lo que se guarda en la base en lugar del token. */
function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Abre una sesión para el usuario y devuelve el token (que SOLO conoce la app). */
export async function crearSesion(usuarioId: number): Promise<string> {
  const token = randomBytes(32).toString("hex"); // 32 bytes al azar → 64 caracteres
  await prisma.sesion.create({
    data: {
      usuarioId,
      hashToken: hashDeToken(token),
      venceEn: new Date(Date.now() + DURACION_SESION),
    },
  });
  return token;
}

/** Cierra la sesión de ese token (borra su fila). */
export async function cerrarSesion(token: string): Promise<void> {
  await prisma.sesion.deleteMany({ where: { hashToken: hashDeToken(token) } });
}

/**
 * Borra de la base TODAS las sesiones que ya vencieron y devuelve cuántas eran. Sin
 * esto no molestarían (una sesión vencida igual no pasa la validación), pero las filas
 * se irían acumulando para siempre.
 */
export async function limpiarSesionesVencidas(): Promise<number> {
  const borradas = await prisma.sesion.deleteMany({ where: { venceEn: { lt: new Date() } } });
  return borradas.count;
}

/** Saca el token del header `Authorization: Bearer <token>`, o `null` si no viene. */
export function tokenDe(req: Request): string | null {
  const encabezado = req.headers.authorization ?? "";
  const [esquema, token] = encabezado.split(" ");
  return esquema === "Bearer" && token ? token : null;
}

// -----------------------------------------------------------------------------
// El portero de las rutas privadas
// -----------------------------------------------------------------------------

/**
 * Middleware: solo deja pasar si el token es de una sesión vigente. Guarda el id
 * del usuario en `res.locals.usuarioId` para que la ruta sepa QUIÉN pregunta.
 * [PRÁCTICA 06: los middlewares preparan el request antes de las rutas]
 */
export async function requiereSesion(req: Request, res: Response, next: NextFunction) {
  const token = tokenDe(req);
  if (!token) return responderError(res, 401, "Tenés que iniciar sesión.");

  try {
    const sesion = await prisma.sesion.findUnique({ where: { hashToken: hashDeToken(token) } });
    if (!sesion || sesion.venceEn < new Date()) {
      // Si existía pero venció, se borra ahora mismo (no hace falta esperar a la limpieza).
      if (sesion) await prisma.sesion.deleteMany({ where: { id: sesion.id } });
      return responderError(res, 401, "Tu sesión venció. Volvé a ingresar.");
    }
    res.locals.usuarioId = sesion.usuarioId;
    next(); // sigue con la ruta
  } catch {
    responderError(res, 500, "No se pudo verificar la sesión.");
  }
}

/** El id del usuario que hizo el pedido (lo dejó `requiereSesion`). */
export function usuarioDe(res: Response): number {
  return res.locals.usuarioId as number;
}
