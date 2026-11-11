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
//   - Las MIGRACIONES (`prisma/migrations/`) crean la FORMA de la base: tablas,
//     columnas, claves, reglas CHECK, índices.
//   - El SEEDER (este archivo) solo carga DATOS de ejemplo en esas tablas.
//   Por eso la base (`prisma/dev.db`) NO se sube al repositorio: cualquiera la arma
//   igual con `npm run db:setup`.
//
// QUÉ HACE:
//   1. Se fija si la base ya tiene datos. Si tiene, no carga nada (así se puede
//      correr más de una vez sin duplicar) y lo avisa.
//   2. Si está vacía, prepara lo que tarda (las contraseñas y los PDF de los apuntes)
//      y carga TODOS los datos de `src/semilla.ts` en una sola transacción: o se
//      carga todo, o no queda nada a medias.
//   3. Muestra cuántas filas quedaron en cada tabla.
//
// Los DATOS están en `src/semilla.ts`; acá está solo CÓMO y CUÁNDO se guardan.
// Todas las cuentas tienen la contraseña `urway2026`.

import "dotenv/config";
import fs from "node:fs";
import type { Prisma } from "@prisma/client";

import { borrarArchivo, carpetaArchivos, guardarArchivo } from "../src/archivos";
import { prisma } from "../src/prisma";
import { hashearContrasenia } from "../src/seguridad";
import {
  AMISTADES,
  APUNTES,
  AVISOS,
  CARRERA_DEL_PLAN,
  CARRERAS,
  CONTRASENIA_DE_PRUEBA,
  CORRELATIVAS,
  EVENTOS,
  FACULTADES,
  HORARIOS,
  JUNTADAS,
  LINKS,
  MATERIAS,
  NOVEDADES,
  RECURSOS,
  RESENIAS,
  SOLICITUDES_PENDIENTES,
  USUARIOS,
  type UsuarioDePrueba,
} from "../src/semilla";
import { claveHoy } from "../src/utiles";

async function main() {
  // 1) ¿Ya hay datos? Entonces no se toca nada.
  const usuarios = await prisma.usuario.count();
  if (usuarios > 0) {
    console.log(`Seeder: la base ya tiene datos (${usuarios} usuarios), no se carga nada.`);
    console.log("        Para empezar de cero: npm run db:reset");
    return;
  }

  // 2) Lo que tarda va ANTES de la transacción, para que dure poco: el hash de cada
  //    contraseña y el PDF de cada apunte (se escriben en `uploads/`). Con la base
  //    vacía, lo que hubiera en `uploads/` son restos de una base anterior.
  fs.rmSync(carpetaArchivos, { recursive: true, force: true });
  fs.mkdirSync(carpetaArchivos, { recursive: true });
  const claves = await Promise.all(USUARIOS.map(() => hashearContrasenia(CONTRASENIA_DE_PRUEBA)));
  const archivos: string[] = [];
  try {
    for (const apunte of APUNTES) {
      archivos.push(await guardarArchivo(pdfDeEjemplo(apunte.titulo, apunte.materiaId), "pdf"));
    }
    // `timeout`: cuánto puede durar la transacción (por defecto son 5 segundos).
    await prisma.$transaction((tx) => cargarTodo(tx, claves, archivos), { timeout: 60_000 });
  } catch (error) {
    // No quedó nada en la base: los PDF ya escritos sobran.
    for (const archivo of archivos) await borrarArchivo(archivo);
    throw error;
  }

  // 3) Qué quedó cargado.
  await mostrarResumen();
}

/** Guarda todos los datos de ejemplo, en orden (primero lo que los demás necesitan). */
async function cargarTodo(tx: Prisma.TransactionClient, claves: { hash: string; sal: string }[], archivos: string[]) {
  // 1) El catálogo y el plan de estudios.
  await tx.facultad.createMany({ data: FACULTADES });
  await tx.carrera.createMany({ data: CARRERAS });
  await tx.materia.createMany({ data: MATERIAS.map((m) => ({ ...m, carreraId: CARRERA_DEL_PLAN })) });
  await tx.correlativa.createMany({
    data: Object.entries(CORRELATIVAS).flatMap(([materiaId, pide]) => pide.map((requiereId) => ({ materiaId, requiereId }))),
  });
  await tx.recurso.createMany({ data: RECURSOS });
  await tx.linkOficial.createMany({ data: LINKS });
  await tx.novedad.createMany({ data: NOVEDADES });

  // 2) Los usuarios. `id` traduce la clave de cada uno ("franco") al id que le dio la base.
  const id: Record<string, number> = {};
  for (const [i, u] of USUARIOS.entries()) {
    id[u.clave] = await crearUsuario(tx, u, claves[i]);
  }

  // 3) Las reseñas.
  await tx.resenia.createMany({
    data: RESENIAS.map(([clave, materiaId, estrellas]) => ({ usuarioId: id[clave], materiaId, estrellas })),
  });

  // 4) Las amistades y las solicitudes pendientes. De las pendientes se guarda el id,
  //    porque sus avisos lo necesitan para poder responderlas.
  await tx.solicitud.createMany({
    data: AMISTADES.map(([de, para]) => ({ deId: id[de], paraId: id[para], estado: "aceptada" })),
  });
  const solicitud: Record<string, number> = {}; // "tomas>franco" → id
  for (const [de, para] of SOLICITUDES_PENDIENTES) {
    const creada = await tx.solicitud.create({ data: { deId: id[de], paraId: id[para] } });
    solicitud[`${de}>${para}`] = creada.id;
  }

  // 5) Las clases: una por cada materia que cursa cada usuario, todas las semanas del
  //    cuatrimestre en sus días (cada día es una fila de `EventoDia`, que Prisma crea
  //    junto con el evento: una escritura anidada).
  const cuatri = cuatrimestreDeHoy();
  const nombreDe = Object.fromEntries(MATERIAS.map((m) => [m.id, m.nombre]));
  for (const u of USUARIOS) {
    for (const materiaId of u.cursando) {
      const { dias, ...horario } = u.horario?.[materiaId] ?? HORARIOS[materiaId];
      await tx.evento.create({
        data: {
          usuarioId: id[u.clave],
          titulo: nombreDe[materiaId],
          tipo: "clase",
          materiaId,
          ...horario,
          fecha: cuatri.inicio,
          frecuencia: "semanal",
          repetirHasta: cuatri.fin,
          dias: { create: dias.map((dia) => ({ dia })) },
        },
      });
    }
  }

  // 6) Los parciales y las entregas.
  for (const { usuario, ...evento } of EVENTOS) {
    await tx.evento.create({ data: { ...evento, usuarioId: id[usuario] } });
  }

  // 7) Las juntadas de estudio y sus invitaciones (se guarda el id de cada una).
  const invitacion: Record<string, number> = {}; // "matrices>franco" → id
  for (const [clave, { organizador, invitados, ...juntada }] of Object.entries(JUNTADAS)) {
    const evento = await tx.evento.create({ data: { ...juntada, tipo: "estudio", usuarioId: id[organizador] } });
    for (const [invitado, respuesta] of Object.entries(invitados)) {
      const creada = await tx.invitacion.create({ data: { eventoId: evento.id, invitadoId: id[invitado], respuesta } });
      invitacion[`${clave}>${invitado}`] = creada.id;
    }
  }

  // 8) Los apuntes, cada uno con su PDF (ya escrito en `uploads/`).
  await tx.apunte.createMany({
    data: APUNTES.map(({ autor, ...apunte }, i) => ({ ...apunte, usuarioId: id[autor], archivo: archivos[i] })),
  });

  // 9) Los avisos. Los que esperan respuesta apuntan a su solicitud o invitación.
  await tx.notificacion.createMany({
    data: AVISOS.map((a) => ({
      usuarioId: id[a.para],
      tipo: a.tipo,
      tipoEvento: a.tipoEvento,
      titulo: a.titulo,
      detalle: a.detalle,
      estudianteId: a.de ? id[a.de] : undefined,
      materiaId: a.materiaId,
      solicitudId: a.solicitudPendiente ? solicitud[`${a.de}>${a.para}`] : undefined,
      invitacionId: a.invitacionPendiente ? invitacion[`${a.invitacionPendiente}>${a.para}`] : undefined,
      respuesta: a.respuesta,
      leida: a.leida ?? false,
      creadaEn: new Date(Date.now() - a.haceHoras * 3600000),
    })),
  });
}

/**
 * Crea un usuario con sus cursadas (una fila por cada materia que arrancó: las que
 * cursa ahora y las que tienen historial) y su historial, y devuelve su id.
 */
async function crearUsuario(tx: Prisma.TransactionClient, u: UsuarioDePrueba, clave: { hash: string; sal: string }) {
  const creado = await tx.usuario.create({
    data: {
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email,
      dni: u.dni,
      carreraId: CARRERA_DEL_PLAN,
      cuatrimestre: u.cuatrimestre,
      hashContrasenia: clave.hash,
      sal: clave.sal,
      verApuntes: u.verApuntes,
      verNotas: u.verNotas,
    },
  });
  const arrancadas = new Set([...u.historial.map(([materiaId]) => materiaId), ...u.cursando]);
  await tx.cursada.createMany({ data: [...arrancadas].map((materiaId) => ({ usuarioId: creado.id, materiaId })) });
  // Uno por uno y en orden: el `id` (autoincremental) define el orden del historial.
  for (const [materiaId, tipo, nota, fecha, extra] of u.historial) {
    await tx.instancia.create({
      data: { usuarioId: creado.id, materiaId, tipo, nota, fecha, cierraCursada: extra === "cierra", recursa: extra === "recursa" },
    });
  }
  return creado.id;
}

/** Muestra cuántas filas quedaron en cada tabla. */
async function mostrarResumen() {
  const cuentas: [string, number][] = [
    ["materias", await prisma.materia.count()],
    ["correlativas", await prisma.correlativa.count()],
    ["usuarios", await prisma.usuario.count()],
    ["notas cargadas", await prisma.instancia.count()],
    ["reseñas", await prisma.resenia.count()],
    ["amistades y solicitudes", await prisma.solicitud.count()],
    ["eventos", await prisma.evento.count()],
    ["invitaciones", await prisma.invitacion.count()],
    ["apuntes", await prisma.apunte.count()],
    ["avisos", await prisma.notificacion.count()],
  ];
  console.log("Seeder: se cargaron los datos de ejemplo:");
  for (const [nombre, cantidad] of cuentas) console.log(`  ${String(cantidad).padStart(4)} ${nombre}`);
}

// -----------------------------------------------------------------------------
// Ayudas
// -----------------------------------------------------------------------------

/**
 * El cuatrimestre de hoy (o el próximo, si estamos en el receso): arranca el primer
 * lunes de marzo o de agosto y dura 16 semanas (termina un viernes). Es la misma
 * regla que `utilidades/cuatrimestre.ts` de la app. Las clases se repiten hasta su fin.
 */
function cuatrimestreDeHoy() {
  const primerLunes = (anio: number, mes: number) => {
    const primero = new Date(anio, mes, 1);
    return new Date(anio, mes, 1 + ((8 - primero.getDay()) % 7));
  };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const anio = hoy.getFullYear();
  const inicios = [anio, anio + 1].flatMap((a) => [primerLunes(a, 2), primerLunes(a, 7)]);
  const dia = 24 * 60 * 60 * 1000;
  const inicio =
    inicios.find((i) => hoy.getTime() - i.getTime() >= 0 && hoy.getTime() - i.getTime() < 112 * dia) ??
    inicios.find((i) => i > hoy)!;
  const fin = new Date(inicio.getTime() + (112 - 3) * dia);
  return { inicio: claveHoy(inicio), fin: claveHoy(fin) };
}

/**
 * Arma un PDF de UNA hoja con el título escrito, para que cada apunte de ejemplo se
 * pueda previsualizar y descargar. Un PDF es texto: un objeto por cada parte
 * (catálogo, páginas, página, contenido, fuente) y al final una tabla `xref` con la
 * posición donde empieza cada objeto.
 */
function pdfDeEjemplo(titulo: string, subtitulo: string): Buffer {
  // La fuente estándar no tiene tildes ni eñes: se las sacamos al texto.
  const limpio = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[()\\]/g, "");
  const contenido =
    `BT /F1 26 Tf 72 740 Td (${limpio(titulo)}) Tj ET\n` +
    `BT /F1 14 Tf 72 706 Td (${limpio(subtitulo)}) Tj ET\n` +
    `BT /F1 12 Tf 72 660 Td (Apunte de ejemplo de urway.) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((objeto, indice) => {
    posiciones.push(pdf.length);
    pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("No se pudieron cargar los datos de ejemplo", error);
    await prisma.$disconnect();
    process.exit(1);
  });
