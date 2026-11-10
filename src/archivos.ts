// =============================================================================
// src/archivos.ts — Los archivos que suben los usuarios (apuntes y fotos de perfil)
// =============================================================================
//
// QUÉ HAY ACÁ:
//   - `carpetaArchivos`: la carpeta `uploads/` donde se guardan.
//   - `tipoDeArchivo`: mira los primeros bytes para saber QUÉ es (no se confía en lo
//     que diga el cliente).
//   - `guardarArchivo` / `borrarArchivo`: escribir y borrar con un nombre al azar.
//   - `NOMBRE_VALIDO`: la forma de un nombre de archivo nuestro (para validar lo que
//     llega por la URL antes de tocar el disco).
//
// POR QUÉ ESTÁ APARTE:
//   Lo usan varias partes: los apuntes, el perfil, las descargas y los datos de
//   ejemplo (`semilla.ts` y el seeder `prisma/seed.ts`).

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// `__dirname` es `backend/src` (o `backend/dist` compilado): en los dos casos
// `../uploads` es la misma carpeta.
export const carpetaArchivos = path.resolve(__dirname, "../uploads");

/** Los tipos de archivo que se aceptan. */
export type TipoArchivo = "jpg" | "png" | "webp" | "pdf";

/** Tamaño máximo de un archivo subido: 8 MB. */
export const MAXIMO_BYTES = 8 * 1024 * 1024;

/**
 * Un nombre de archivo nuestro: 32 letras/números al azar y la extensión. Sirve para
 * rechazar enseguida cualquier cosa rara que llegue en la URL (por ejemplo "../").
 */
export const NOMBRE_VALIDO = /^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/;

/**
 * Qué tipo de archivo es, mirando sus primeros bytes ("número mágico"). Devuelve
 * `null` si no es una imagen JPG/PNG/WEBP ni un PDF.
 */
export function tipoDeArchivo(bytes: Buffer): TipoArchivo | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === "PNG") return "png";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "webp";
  if (bytes.subarray(0, 4).toString() === "%PDF") return "pdf";
  return null;
}

/** ¿El archivo es un PDF? (por su nombre). */
export const esPdf = (nombre: string) => nombre.endsWith(".pdf");

/**
 * Convierte lo que manda la app (texto base64, a veces con el prefijo
 * "data:image/jpeg;base64,") en los bytes del archivo.
 */
export function bytesDeBase64(texto: string): Buffer {
  return Buffer.from(texto.replace(/^data:[^,]*,/, ""), "base64");
}

/** Guarda los bytes con un nombre al azar y devuelve ese nombre. */
export async function guardarArchivo(bytes: Buffer, tipo: TipoArchivo): Promise<string> {
  await fs.mkdir(carpetaArchivos, { recursive: true });
  const nombre = `${randomBytes(16).toString("hex")}.${tipo}`;
  await fs.writeFile(path.join(carpetaArchivos, nombre), bytes);
  return nombre;
}

/** Borra un archivo guardado (si ya no estaba, no importa: `force`). */
export async function borrarArchivo(nombre: string | null | undefined): Promise<void> {
  if (!nombre || !NOMBRE_VALIDO.test(nombre)) return;
  await fs.rm(path.join(carpetaArchivos, nombre), { force: true });
}
