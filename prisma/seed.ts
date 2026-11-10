// =============================================================================
// prisma/seed.ts — El SEEDER: carga los datos de ejemplo en la base
// =============================================================================
//
// CÓMO SE CORRE:
//   `npx prisma db seed` (o `npm run db:seed`). Prisma toma el comando de
//   `prisma.config.ts` (`migrations.seed`). `npm run db:setup` y `npm run db:reset`
//   lo corren solos, después de aplicar las migraciones.
//
// MIGRACIONES Y SEEDER, CADA UNO LO SUYO:
//   - Las MIGRACIONES (`prisma/migrations/`) crean y cambian la FORMA de la base:
//     tablas, columnas, claves, reglas CHECK, índices.
//   - El SEEDER (este archivo) solo carga DATOS de ejemplo en esas tablas.
//   Por eso la base (`prisma/dev.db`) NO se sube al repositorio: cualquiera la arma
//   igual con `npm run db:setup`.
//
// QUÉ CARGA: los dos lotes de datos de ejemplo
//   1. `src/semilla.ts`: el catálogo (UCA · Ingeniería Informática), el plan de
//      estudios con sus correlativas, las novedades y las 5 cuentas de la demo.
//   2. `src/semillaAmpliada.ts`: 6 materias y 10 estudiantes más, con sus apuntes,
//      clases, reseñas, amistades y avisos.
//   Todas las cuentas tienen la contraseña `urway2026`.
//
// SE PUEDE CORRER MÁS DE UNA VEZ SIN DUPLICAR NADA:
//   - El primer lote se carga solo si la base no tiene ningún usuario.
//   - El segundo lote se saltea solo si ya está (lo reconoce por una de sus cuentas).

import "dotenv/config";
import fs from "node:fs";

import { carpetaArchivos } from "../src/archivos";
import { prisma } from "../src/prisma";
import { sembrar } from "../src/semilla";
import { ampliarSemilla } from "../src/semillaAmpliada";

async function main() {
  const hayUsuarios = (await prisma.usuario.count()) > 0;

  if (!hayUsuarios) {
    // Sin usuarios, ningún archivo de `uploads/` es de alguien (cada apunte y cada
    // foto de perfil es de un usuario): son restos de una base anterior (por ejemplo,
    // de antes de un `db:reset`). Se borran para no acumular PDF huérfanos.
    fs.rmSync(carpetaArchivos, { recursive: true, force: true });
    fs.mkdirSync(carpetaArchivos, { recursive: true });

    await sembrar(prisma);
    console.log("Seeder: se cargó el primer lote (plan de estudios y las cuentas de la demo).");
  } else {
    console.log("Seeder: la base ya tenía usuarios, el primer lote no se vuelve a cargar.");
  }

  // `ampliarSemilla` mira sola si el segundo lote ya está (y entonces no hace nada).
  await ampliarSemilla(prisma);
  console.log("Seeder: segundo lote al día (materias y estudiantes de ejemplo).");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("No se pudieron cargar los datos de ejemplo", error);
    await prisma.$disconnect();
    process.exit(1);
  });
