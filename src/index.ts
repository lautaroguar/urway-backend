// =============================================================================
// src/index.ts — El servidor: Express + las rutas de la API de urway
// =============================================================================
//
// EL VIAJE DE UN DATO [PRÁCTICA 02 y 17]:
//
//   App (fetch) → HTTP → Express (valida y decide) → Prisma Client → SQLite
//   App ← JSON ← Express ← Prisma ← SQLite
//
//   La app no sabe que existe SQLite: solo conoce la URL de la API. Express
//   decide qué se acepta, Prisma habla con la base y SQLite guarda.
//
// QUÉ HACE ESTE ARCHIVO, EN ORDEN:
//   1. Crea la app de Express y registra los MIDDLEWARES (corren antes que las
//      rutas, en el orden en que se registran).
//   2. Monta las rutas, agrupadas por tema en `src/rutas/`.
//   3. Arranca: primero prepara la base (`inicializarBase`) y después escucha.
//
// TODAS LAS RUTAS (ver cada archivo de `src/rutas/` para el detalle):
//   GET  /api/health                         → prueba de que el servidor está vivo
//   POST /api/auth/registro | ingreso | salida, GET/PATCH /api/yo, PATCH /api/yo/perfil
//                                                                    (cuentas.ts)
//   GET  /api/materias, POST/DELETE .../cursada, PUT .../resenia, GET .../apuntes,
//   POST/DELETE .../historial                                        (materias.ts)
//   GET/POST/PATCH/DELETE /api/eventos, /api/invitaciones/...        (eventos.ts)
//   GET  /api/estudiantes, /api/amistades/..., /api/links, /novedades (comunidad.ts)
//   GET/POST/DELETE /api/apuntes                                     (apuntes.ts)
//   GET  /api/notificaciones, POST /api/notificaciones/leidas        (notificaciones.ts)
//   GET  /uploads/<archivo>                  → los apuntes (fotos y PDF) y las fotos de perfil
//   GET  /uploads/<archivo>?descargar=1      → el mismo archivo, para guardarlo en el dispositivo

// dotenv carga las variables de backend/.env (DATABASE_URL y PORT).
import "dotenv/config";

import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import { carpetaArchivos, NOMBRE_VALIDO } from "./archivos";
import { inicializarBase } from "./initDb";
import { prisma } from "./prisma";
import { rutasApuntes } from "./rutas/apuntes";
import { rutasComunidad } from "./rutas/comunidad";
import { rutasCuentas } from "./rutas/cuentas";
import { rutasEventos } from "./rutas/eventos";
import { rutasMaterias } from "./rutas/materias";
import { rutasNotificaciones } from "./rutas/notificaciones";
import { limpiarSesionesVencidas } from "./seguridad";
import { responderError } from "./utiles";

// -----------------------------------------------------------------------------
// 1. Configuración y middlewares
// -----------------------------------------------------------------------------

const app = express();
const puerto = Number(process.env.PORT ?? 3000);

// No anunciar "X-Powered-By: Express" (no hace falta dar pistas de qué hay atrás).
app.disable("x-powered-by");
// CORS: deja que la app (que corre en otro origen, por ejemplo la web de Expo
// en el puerto 8081) llame a la API.
app.use(cors());
// Convierte el body JSON en `req.body`. El límite es alto porque los apuntes y las
// fotos viajan en el JSON (en base64 pesan un tercio más que el archivo).
app.use(express.json({ limit: "12mb" }));

// DESCARGAR un archivo: `/uploads/<archivo>?descargar=1` lo devuelve como adjunto
// (header `Content-Disposition: attachment`) y con el título del apunte como nombre,
// así el navegador del teléfono lo GUARDA en el dispositivo en vez de mostrarlo.
// Va ANTES del `express.static` de abajo; sin `?descargar`, sigue de largo (`next`).
app.get("/uploads/:archivo", async (req, res, next) => {
  if (req.query.descargar === undefined) return next();
  const nombre = String(req.params.archivo);
  // Solo nombres como los que generamos nosotros: así no se puede pedir "../algo".
  if (!NOMBRE_VALIDO.test(nombre)) return responderError(res, 404, "No existe ese archivo.");
  try {
    // `archivo` es único en la tabla: a lo sumo hay un apunte con ese nombre.
    const apunte = await prisma.apunte.findUnique({ where: { archivo: nombre } });
    if (!apunte) return responderError(res, 404, "No existe ese archivo.");
    // El título sirve de nombre, sin caracteres raros: "Resumen de matrices.pdf".
    const titulo = apunte.titulo.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "apunte";
    res.download(path.join(carpetaArchivos, nombre), `${titulo}.${nombre.split(".")[1]}`);
  } catch {
    responderError(res, 500, "No se pudo descargar el archivo.");
  }
});

// Los archivos subidos, como archivos estáticos. `nosniff` le dice al navegador que
// no adivine el tipo del archivo.
app.use(
  "/uploads",
  express.static(carpetaArchivos, {
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

// -----------------------------------------------------------------------------
// 2. Rutas
// -----------------------------------------------------------------------------

// GET /api/health — prueba mínima: si responde, Express está vivo. [PRÁCTICA 06]
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Cada grupo de rutas vive en su archivo; todas cuelgan de /api.
app.use("/api", rutasCuentas);
app.use("/api", rutasMaterias);
app.use("/api", rutasEventos);
app.use("/api", rutasComunidad);
app.use("/api", rutasApuntes);
app.use("/api", rutasNotificaciones);

// Cualquier otra ruta de /api: 404 con el formato de siempre.
app.use("/api", (_req, res) => {
  responderError(res, 404, "Esa ruta no existe.");
});

// Errores que no atrapó ninguna ruta (por ejemplo, un JSON mal escrito o una
// foto demasiado grande). Un manejador de errores de Express tiene 4 parámetros.
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  if (error?.type === "entity.too.large") return responderError(res, 413, "El pedido es demasiado grande.");
  if (error?.type === "entity.parse.failed") return responderError(res, 400, "El JSON no es válido.");
  console.error(error);
  responderError(res, 500, "Error inesperado.");
});

// -----------------------------------------------------------------------------
// 3. Arranque
// -----------------------------------------------------------------------------

// Cada cuánto se borran las sesiones vencidas: una vez por hora.
const CADA_CUANTO_LIMPIEZA = 60 * 60 * 1000;

/** Borra las sesiones vencidas. Si falla, solo avisa: la limpieza no es urgente. */
async function limpiar() {
  try {
    const cantidad = await limpiarSesionesVencidas();
    if (cantidad > 0) console.log(`Se borraron ${cantidad} sesiones vencidas.`);
  } catch (error) {
    console.error("No se pudieron borrar las sesiones vencidas", error);
  }
}

async function iniciar() {
  // Primero, la base lista (tablas creadas y datos de ejemplo si estaba vacía).
  await inicializarBase();
  // Y las sesiones vencidas afuera: ahora, y después cada hora. `unref` hace que este
  // reloj no mantenga vivo el proceso si el servidor se está cerrando.
  await limpiar();
  setInterval(limpiar, CADA_CUANTO_LIMPIEZA).unref();
  // Recién ahí Express empieza a recibir pedidos. "0.0.0.0" = también desde otros
  // equipos de la red (el celular con Expo Go), no solo desde esta PC.
  app.listen(puerto, "0.0.0.0", () => {
    console.log(`API de urway escuchando en http://localhost:${puerto}`);
  });
}

// Si la base no se puede preparar, se muestra el error y se cierra el proceso.
iniciar().catch((error) => {
  console.error("No se pudo iniciar la API", error);
  process.exit(1);
});
