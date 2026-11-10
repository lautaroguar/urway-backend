// =============================================================================
// prisma.config.ts — La configuración de la CLI de Prisma
// =============================================================================
//
// Le dice a Prisma:
//   - dónde está el modelo de datos (`prisma/schema.prisma`);
//   - dónde guarda las MIGRACIONES (`prisma/migrations/`): el historial de cambios
//     de la base, en SQL. Se suben al repositorio;
//   - con qué comando se corre el SEEDER (`npx prisma db seed`): `prisma/seed.ts`.
//
// Con este archivo, Prisma ya no lee el `.env` por su cuenta: por eso el
// `import "dotenv/config"` (de ahí sale DATABASE_URL, la ruta de la base).
// Este archivo lo usa solo la CLI de Prisma; la API no lo importa.

import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "ts-node prisma/seed.ts",
  },
});
