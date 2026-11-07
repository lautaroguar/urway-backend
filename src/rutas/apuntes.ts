// =============================================================================
// src/rutas/apuntes.ts — Mis apuntes (fotos y PDF) y el aviso a los amigos
// =============================================================================
//
// | Método | Ruta              | Qué hace                                              | Respuestas            |
// |--------|-------------------|-------------------------------------------------------|-----------------------|
// | GET    | /api/apuntes      | Mis apuntes                                           | 200                   |
// | POST   | /api/apuntes      | Sube un archivo con título; AVISA a todos mis amigos  | 201 / 400 / 404 / 413 |
// | DELETE | /api/apuntes/:id  | Borra un apunte mío (y su archivo)                    | 204 / 404             |
//
// CUÁNDO SE SUBE:
//   La app NO manda nada al elegir el archivo: lo guarda en memoria, le pide al
//   estudiante un título y una descripción, y recién cuando toca «Confirmar» hace este
//   POST. Por eso en `uploads/` solo llegan apuntes confirmados: no hay que limpiar
//   fotos subidas sin querer.
//
// CÓMO VIAJA EL ARCHIVO:
//   La app lo manda en el JSON como texto base64 (la forma de escribir bytes con
//   letras). El servidor lo decodifica y lo guarda como ARCHIVO en `uploads/`, con
//   un nombre al azar de 32 caracteres ("3f9a...c2.pdf"): imposible de adivinar.
//   En la base solo queda ese nombre. Se sirven en `/uploads/<nombre>`.

import { Router } from "express";

import { borrarArchivo, bytesDeBase64, guardarArchivo, MAXIMO_BYTES, tipoDeArchivo } from "../archivos";
import { apunteParaApi, idsDeAmigos, nombreCompleto, notificar } from "../consultas";
import { prisma } from "../prisma";
import { requiereSesion, usuarioDe } from "../seguridad";
import { claveHoy, leerId, responderError, textoObligatorio } from "../utiles";

export const rutasApuntes = Router();
rutasApuntes.use("/apuntes", requiereSesion);

// GET /api/apuntes
rutasApuntes.get("/apuntes", async (_req, res) => {
  try {
    const apuntes = await prisma.apunte.findMany({
      where: { usuarioId: usuarioDe(res) },
      orderBy: { id: "desc" }, // el más nuevo primero
    });
    res.json(apuntes.map(apunteParaApi));
  } catch {
    responderError(res, 500, "No se pudieron leer tus apuntes.");
  }
});

// POST /api/apuntes
// Body: { materiaId, archivo: "<base64>", titulo, descripcion? }
rutasApuntes.post("/apuntes", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const materiaId = String(req.body?.materiaId ?? "");

  // Primero se valida todo lo que llegó, SIN tocar el disco.
  const titulo = textoObligatorio(req.body?.titulo, 60);
  if (!titulo) return responderError(res, 400, "Poné un título para el apunte (hasta 60 letras).");
  const descripcion =
    typeof req.body?.descripcion === "string" && req.body.descripcion.trim()
      ? req.body.descripcion.trim().slice(0, 300)
      : null;
  if (!req.body?.archivo) return responderError(res, 400, "Falta el archivo.");

  const bytes = bytesDeBase64(String(req.body.archivo));
  if (bytes.length > MAXIMO_BYTES) return responderError(res, 413, "El archivo es demasiado grande (máximo 8 MB).");
  const tipo = tipoDeArchivo(bytes);
  if (!tipo) return responderError(res, 400, "El archivo tiene que ser una foto (JPG, PNG o WEBP) o un PDF.");

  try {
    const materia = await prisma.materia.findUnique({ where: { id: materiaId } });
    if (!materia) return responderError(res, 404, "No existe esa materia.");

    // Recién ahora se escribe el archivo, con un nombre al azar que nadie puede adivinar.
    const archivo = await guardarArchivo(bytes, tipo);
    // Si la fila no se pudiera guardar, se borra el archivo recién escrito (si no,
    // quedaría suelto en `uploads/`) y el error sigue hasta el `catch` de abajo.
    const apunte = await prisma.apunte
      .create({ data: { usuarioId, materiaId, titulo, descripcion, fecha: claveHoy(), archivo } })
      .catch(async (error) => {
        await borrarArchivo(archivo);
        throw error;
      });

    // EL AVISO A LOS AMIGOS: una notificación para cada uno.
    const autor = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    for (const amigoId of await idsDeAmigos(usuarioId)) {
      await notificar(amigoId, {
        tipo: "apunte",
        titulo: `${nombreCompleto(autor)} subió un apunte nuevo`,
        detalle: `${materia.nombre} · ${titulo}`,
        estudianteId: usuarioId,
        materiaId,
      });
    }

    res.status(201).json(apunteParaApi(apunte));
  } catch {
    responderError(res, 500, "No se pudo guardar el apunte.");
  }
});

// DELETE /api/apuntes/:id
rutasApuntes.delete("/apuntes/:id", async (req, res) => {
  const id = leerId(req.params.id);
  if (!id) return responderError(res, 400, "El id no es válido.");
  try {
    // Solo un apunte MÍO: si es de otro, es como si no existiera.
    const apunte = await prisma.apunte.findFirst({ where: { id, usuarioId: usuarioDe(res) } });
    if (!apunte) return responderError(res, 404, "No existe un apunte tuyo con ese id.");
    await prisma.apunte.delete({ where: { id } });
    // El archivo también.
    await borrarArchivo(apunte.archivo);
    res.status(204).end();
  } catch {
    responderError(res, 500, "No se pudo borrar el apunte.");
  }
});
