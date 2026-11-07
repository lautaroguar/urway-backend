// =============================================================================
// src/rutas/materias.ts — Las materias, su cursada, su historial y su comunidad
// =============================================================================
//
// | Método | Ruta                                  | Qué hace                                  | Respuestas            |
// |--------|---------------------------------------|-------------------------------------------|-----------------------|
// | GET    | /api/materias                         | Mis materias, con el estado calculado     | 200                   |
// | POST   | /api/materias/:id/cursada             | «Arrancar la cursada» (materia disponible)| 201 / 400 / 404       |
// | DELETE | /api/materias/:id/cursada             | «Abandonar cursada» (solo si la estoy cursando) | 200 / 400 / 404 |
// | PUT    | /api/materias/:id/resenia             | Dejo o cambio MI reseña de dificultad     | 200 / 400 / 404       |
// | GET    | /api/materias/:id/apuntes             | Apuntes de la comunidad y de mis amigos   | 200 / 404             |
// | POST   | /api/materias/:id/historial           | Carga algo rendido (parcial, final...)    | 201 / 400 / 404       |
// | DELETE | /api/materias/:id/historial/ultimo    | Borra lo último cargado de esa materia    | 200 / 404             |
//
// EL ESTADO NO SE GUARDA: cada GET lo calcula con las correlativas, si hay una fila
// en `Cursada` («cursada arrancada») y el historial (`resolverMateria`). Así nunca
// puede quedar un estado que no coincida con lo que pasó de verdad.
//
// CADA ACCIÓN DEVUELVE LA MATERIA YA RECALCULADA: la app la muestra tal cual.

import { Router } from "express";

import { apunteParaApi, idsDeAmigos, materiasDe } from "../consultas";
import { prisma } from "../prisma";
import {
  motivoNoAbandonar,
  motivoNoArrancar,
  motivoNoResenia,
  validarInstancia,
} from "../reglas";
import { requiereSesion, usuarioDe } from "../seguridad";
import { claveHoy, esClaveFecha, responderError } from "../utiles";

export const rutasMaterias = Router();

// Todas las rutas de este archivo necesitan sesión: el middleware va para todas.
rutasMaterias.use("/materias", requiereSesion);

/** Una materia mía (con su estado al día), o `undefined` si el código no existe. */
async function materiaDe(usuarioId: number, materiaId: string) {
  return (await materiasDe(usuarioId)).find((m) => m.id === materiaId);
}

// GET /api/materias
rutasMaterias.get("/materias", async (_req, res) => {
  try {
    res.json(await materiasDe(usuarioDe(res)));
  } catch {
    responderError(res, 500, "No se pudieron leer tus materias.");
  }
});

// POST /api/materias/:id/cursada
// «Arrancar la cursada»: solo si la materia está DISPONIBLE (tengo las correlativas).
rutasMaterias.post("/materias/:id/cursada", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const materiaId = String(req.params.id);
  try {
    const materia = await materiaDe(usuarioId, materiaId);
    if (!materia) return responderError(res, 404, "No existe una materia con ese código.");
    const motivo = motivoNoArrancar(materia.estado);
    if (motivo) return responderError(res, 400, motivo);

    // Arrancar = crear la fila de la cursada (si está "disponible", no existe todavía).
    await prisma.cursada.create({ data: { usuarioId, materiaId } });
    res.status(201).json(await materiaDe(usuarioId, materiaId));
  } catch {
    responderError(res, 500, "No se pudo arrancar la cursada.");
  }
});

// DELETE /api/materias/:id/cursada
// «Abandonar cursada». Pasa lo siguiente, todo junto o nada:
//   - se borra lo que rendí en ESTA cursada (lo de cursadas anteriores que se recursaron queda),
//   - se borra MI reseña: deja de contar para la dificultad que ven los demás,
//   - la materia vuelve a estar DISPONIBLE para anotarse de nuevo.
// Una cursada ya aprobada (pendiente de final o aprobada) NO se puede abandonar.
rutasMaterias.delete("/materias/:id/cursada", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const materiaId = String(req.params.id);
  try {
    const materia = await materiaDe(usuarioId, materiaId);
    if (!materia) return responderError(res, 404, "No existe una materia con ese código.");
    const motivo = motivoNoAbandonar(materia.estado);
    if (motivo) return responderError(res, 400, motivo);

    // Lo rendido en la cursada de ahora: los pasos del historial de este intento.
    const deEstaCursada = materia.historial
      .filter((paso) => paso.intento === materia.intento)
      .map((paso) => Number(paso.instancia.id));

    // `$transaction`: las dos cosas se hacen juntas, o ninguna. La reseña no se borra
    // a mano: cuelga de la cursada (clave foránea con ON DELETE CASCADE), así que al
    // borrar la cursada la base la borra sola.
    await prisma.$transaction([
      prisma.instancia.deleteMany({ where: { id: { in: deEstaCursada } } }),
      prisma.cursada.delete({ where: { usuarioId_materiaId: { usuarioId, materiaId } } }),
    ]);
    res.json(await materiaDe(usuarioId, materiaId));
  } catch {
    responderError(res, 500, "No se pudo abandonar la cursada.");
  }
});

// PUT /api/materias/:id/resenia
// Body: { estrellas: 1 a 5 }. Deja MI reseña o, si ya tenía una, la cambia. Solo quien
// arrancó la cursada puede reseñar. La dificultad que se devuelve ya la incluye.
rutasMaterias.put("/materias/:id/resenia", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const materiaId = String(req.params.id);
  const estrellas = Number(req.body?.estrellas);
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return responderError(res, 400, "Las estrellas van de 1 a 5.");
  }
  try {
    const materia = await materiaDe(usuarioId, materiaId);
    if (!materia) return responderError(res, 404, "No existe una materia con ese código.");
    const motivo = motivoNoResenia(materia.estado);
    if (motivo) return responderError(res, 400, motivo);

    await prisma.resenia.upsert({
      where: { usuarioId_materiaId: { usuarioId, materiaId } },
      update: { estrellas, actualizadaEn: new Date() },
      create: { usuarioId, materiaId, estrellas },
    });
    res.json(await materiaDe(usuarioId, materiaId));
  } catch {
    responderError(res, 500, "No se pudo guardar tu reseña.");
  }
});

// GET /api/materias/:id/apuntes
// Los apuntes de OTROS estudiantes de esta materia, en dos listas:
//   - comunidad: los de quienes comparten sus apuntes con todos (los públicos),
//   - amigos:    los de mis amigos (los veo aunque los compartan solo con amigos).
// Los míos no están acá: van en «Mis apuntes».
rutasMaterias.get("/materias/:id/apuntes", async (req, res) => {
  const yo = usuarioDe(res);
  const materiaId = String(req.params.id);
  try {
    const materia = await prisma.materia.findUnique({ where: { id: materiaId } });
    if (!materia) return responderError(res, 404, "No existe una materia con ese código.");

    const amigos = await idsDeAmigos(yo);
    const apuntes = await prisma.apunte.findMany({
      where: { materiaId, usuarioId: { not: yo } },
      include: { autor: true }, // para mostrar quién lo subió
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
    });

    res.json({
      comunidad: apuntes.filter((a) => a.autor.verApuntes === "todos").map(apunteParaApi),
      amigos: apuntes.filter((a) => amigos.includes(a.usuarioId)).map(apunteParaApi),
    });
  } catch {
    responderError(res, 500, "No se pudieron leer los apuntes.");
  }
});

// POST /api/materias/:id/historial
// Body: { tipo, nota, fecha: "AAAA-MM-DD", cierraCursada?, recursa? }
rutasMaterias.post("/materias/:id/historial", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const materiaId = String(req.params.id);
  const { tipo, nota, fecha, cierraCursada, recursa } = req.body ?? {};

  if (!esClaveFecha(fecha)) return responderError(res, 400, "La fecha va como AAAA-MM-DD y tiene que existir.");
  const borrador = {
    tipo: String(tipo ?? ""),
    nota: Number(nota),
    fecha,
    cierraCursada: Boolean(cierraCursada),
    recursa: Boolean(recursa),
  };

  try {
    // El estado ACTUAL de la materia, calculado con lo que ya hay en la base.
    const materia = await materiaDe(usuarioId, materiaId);
    if (!materia) return responderError(res, 404, "No existe una materia con ese código.");

    // El servidor vuelve a validar las reglas (nunca se confía solo en la app).
    const motivo = validarInstancia(
      materia.estado,
      materia.historial.at(-1)?.instancia.fecha,
      borrador,
      claveHoy()
    );
    if (motivo) return responderError(res, 400, motivo);

    await prisma.instancia.create({ data: { usuarioId, materiaId, ...borrador } });
    // Se devuelve la materia ya recalculada (con su estado nuevo).
    res.status(201).json(await materiaDe(usuarioId, materiaId));
  } catch {
    responderError(res, 500, "No se pudo guardar lo que rendiste.");
  }
});

// DELETE /api/materias/:id/historial/ultimo
// "Deshacer lo último": para corregir un error de carga.
rutasMaterias.delete("/materias/:id/historial/ultimo", async (req, res) => {
  const usuarioId = usuarioDe(res);
  const materiaId = String(req.params.id);
  try {
    // Lo último cargado = el de id más alto (los ids crecen con cada carga).
    const ultima = await prisma.instancia.findFirst({
      where: { usuarioId, materiaId },
      orderBy: { id: "desc" },
    });
    if (!ultima) return responderError(res, 404, "No hay nada cargado en esta materia.");
    await prisma.instancia.delete({ where: { id: ultima.id } });
    res.json(await materiaDe(usuarioId, materiaId));
  } catch {
    responderError(res, 500, "No se pudo deshacer.");
  }
});
