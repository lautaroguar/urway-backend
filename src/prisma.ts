// =============================================================================
// src/prisma.ts — UN solo cliente de Prisma para toda la API
// =============================================================================
//
// `PrismaClient` abre la conexión con SQLite. Se crea UNA vez acá y todos los
// archivos de rutas lo importan: crear uno por archivo abriría varias conexiones
// a la misma base sin necesidad. [PRÁCTICA 08: "el Client no se escribe: se genera"]

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
