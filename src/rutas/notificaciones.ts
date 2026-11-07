// =============================================================================
// src/rutas/notificaciones.ts — Los avisos de cada usuario
// =============================================================================
//
// | Método | Ruta                        | Qué hace                              | Respuestas |
// |--------|-----------------------------|---------------------------------------|------------|
// | GET    | /api/notificaciones         | Mis avisos, del más nuevo al más viejo| 200        |
// | POST   | /api/notificaciones/leidas  | Marca todos mis avisos como leídos    | 204        |
//
// Las notificaciones las CREAN otras rutas (`notificar` en `consultas.ts`):
// al subir un apunte (a los amigos), al mandar o aceptar una solicitud, al
// invitar a estudiar o responder una invitación. Acá solo se leen.
// Las solicitudes y las invitaciones se RESPONDEN en sus propias rutas
// (`/api/amistades/:id/respuesta` y `/api/invitaciones/:id/respuesta`).

import { Router } from "express";

import { notificacionParaApi } from "../consultas";
import { prisma } from "../prisma";
import { requiereSesion, usuarioDe } from "../seguridad";
import { responderError } from "../utiles";

export const rutasNotificaciones = Router();
rutasNotificaciones.use("/notificaciones", requiereSesion);

// GET /api/notificaciones
rutasNotificaciones.get("/notificaciones", async (_req, res) => {
  try {
    const avisos = await prisma.notificacion.findMany({
      where: { usuarioId: usuarioDe(res) },
      // Con su solicitud (si espera una respuesta de amistad): de ahí sale quién la mandó.
      include: { solicitud: true },
      orderBy: [{ creadaEn: "desc" }, { id: "desc" }],
      take: 50, // las últimas 50 alcanzan
    });
    res.json(avisos.map(notificacionParaApi));
  } catch {
    responderError(res, 500, "No se pudieron leer tus notificaciones.");
  }
});

// POST /api/notificaciones/leidas
rutasNotificaciones.post("/notificaciones/leidas", async (_req, res) => {
  try {
    await prisma.notificacion.updateMany({
      where: { usuarioId: usuarioDe(res), leida: false },
      data: { leida: true },
    });
    res.status(204).end();
  } catch {
    responderError(res, 500, "No se pudieron marcar como leídas.");
  }
});
