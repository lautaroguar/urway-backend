-- =============================================================================
-- Migración 20261110124500_init — Crea la base de urway desde cero
-- =============================================================================
--
-- La GENERÓ Prisma a partir de `prisma/schema.prisma` (`prisma migrate dev
-- --create-only --name init`) y después se le AGREGÓ A MANO lo que el schema de
-- Prisma no sabe expresar (Prisma lo permite: una migración es SQL y se puede
-- editar antes de aplicarla):
--   - las reglas CHECK (marcadas con "Regla CHECK"): los valores permitidos de
--     cada tipo, estrellas de 1 a 5, nota de 1 a 10, horario "desde < hasta"...
--   - el índice único `Solicitud_par_key` (al final): entre dos personas hay UNA
--     sola solicitud de amistad, en cualquier sentido.
-- Express valida ANTES (para devolver un mensaje claro); estas reglas son la
-- última red: aunque hubiera un error en el código, la base no guarda datos
-- imposibles.
--
-- NO se edita una migración que ya se aplicó: los cambios nuevos al modelo van en
-- una migración NUEVA (`npm run db:migrate -- --name lo_que_cambia`).

-- CreateTable
CREATE TABLE "Facultad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Carrera" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "facultadId" TEXT NOT NULL,
    CONSTRAINT "Carrera_facultadId_fkey" FOREIGN KEY ("facultadId") REFERENCES "Facultad" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Materia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carreraId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuatrimestre" INTEGER NOT NULL,
    "creditos" INTEGER NOT NULL,
    "profesor" TEXT NOT NULL,
    "dificultadInicial" REAL NOT NULL,
    CONSTRAINT "Materia_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "Materia_cuatrimestre_check" CHECK ("cuatrimestre" BETWEEN 1 AND 10),
    CONSTRAINT "Materia_creditos_check" CHECK ("creditos" > 0),
    CONSTRAINT "Materia_dificultadInicial_check" CHECK ("dificultadInicial" BETWEEN 0 AND 5)
);

-- CreateTable
CREATE TABLE "Correlativa" (
    "materiaId" TEXT NOT NULL,
    "requiereId" TEXT NOT NULL,

    PRIMARY KEY ("materiaId", "requiereId"),
    CONSTRAINT "Correlativa_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Correlativa_requiereId_fkey" FOREIGN KEY ("requiereId") REFERENCES "Materia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano): una materia no se pide a sí misma
    CONSTRAINT "Correlativa_distintas_check" CHECK ("materiaId" <> "requiereId")
);

-- CreateTable
CREATE TABLE "Recurso" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materiaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "peso" TEXT NOT NULL,
    CONSTRAINT "Recurso_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LinkOficial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materiaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    CONSTRAINT "LinkOficial_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "LinkOficial_tipo_check" CHECK ("tipo" IN ('discord', 'whatsapp', 'campus', 'web', 'repositorio'))
);

-- CreateTable
CREATE TABLE "Novedad" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "icono" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dni" TEXT,
    "fechaNacimiento" TEXT,
    "carreraId" TEXT NOT NULL,
    "cuatrimestre" INTEGER NOT NULL DEFAULT 1,
    "hashContrasenia" TEXT NOT NULL,
    "sal" TEXT NOT NULL,
    "verApuntes" TEXT NOT NULL DEFAULT 'todos',
    "verNotas" TEXT NOT NULL DEFAULT 'amigos',
    "foto" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Usuario_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "Usuario_cuatrimestre_check" CHECK ("cuatrimestre" BETWEEN 1 AND 10),
    CONSTRAINT "Usuario_verApuntes_check" CHECK ("verApuntes" IN ('todos', 'amigos')),
    CONSTRAINT "Usuario_verNotas_check" CHECK ("verNotas" IN ('todos', 'amigos'))
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "hashToken" TEXT NOT NULL,
    "venceEn" DATETIME NOT NULL,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cursada" (
    "usuarioId" INTEGER NOT NULL,
    "materiaId" TEXT NOT NULL,

    PRIMARY KEY ("usuarioId", "materiaId"),
    CONSTRAINT "Cursada_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Cursada_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Resenia" (
    "usuarioId" INTEGER NOT NULL,
    "materiaId" TEXT NOT NULL,
    "estrellas" INTEGER NOT NULL,
    "actualizadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("usuarioId", "materiaId"),
    CONSTRAINT "Resenia_usuarioId_materiaId_fkey" FOREIGN KEY ("usuarioId", "materiaId") REFERENCES "Cursada" ("usuarioId", "materiaId") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "Resenia_estrellas_check" CHECK ("estrellas" BETWEEN 1 AND 5)
);

-- CreateTable
CREATE TABLE "Instancia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "materiaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "fecha" TEXT NOT NULL,
    "cierraCursada" BOOLEAN NOT NULL DEFAULT false,
    "recursa" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Instancia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Instancia_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "Instancia_tipo_check" CHECK ("tipo" IN ('parcial', 'recuperatorio', 'tp', 'exposicion', 'final')),
    CONSTRAINT "Instancia_nota_check" CHECK ("nota" BETWEEN 1 AND 10)
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "materiaId" TEXT,
    "fecha" TEXT NOT NULL,
    "desde" TEXT NOT NULL,
    "hasta" TEXT NOT NULL,
    "lugar" TEXT NOT NULL DEFAULT '',
    "notas" TEXT,
    "frecuencia" TEXT NOT NULL DEFAULT 'nunca',
    "repetirHasta" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Evento_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "Evento_tipo_check" CHECK ("tipo" IN ('clase', 'parcial', 'entrega', 'estudio')),
    CONSTRAINT "Evento_frecuencia_check" CHECK ("frecuencia" IN ('nunca', 'diaria', 'semanal', 'quincenal', 'mensual')),
    CONSTRAINT "Evento_horario_check" CHECK ("desde" < "hasta"),
    -- Una juntada de "estudio" no lleva materia (el título dice de qué es).
    CONSTRAINT "Evento_estudioSinMateria_check" CHECK ("tipo" <> 'estudio' OR "materiaId" IS NULL)
);

-- CreateTable
CREATE TABLE "EventoDia" (
    "eventoId" INTEGER NOT NULL,
    "dia" INTEGER NOT NULL,

    PRIMARY KEY ("eventoId", "dia"),
    CONSTRAINT "EventoDia_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano): 0 = domingo ... 6 = sábado
    CONSTRAINT "EventoDia_dia_check" CHECK ("dia" BETWEEN 0 AND 6)
);

-- CreateTable
CREATE TABLE "EventoExcepcion" (
    "eventoId" INTEGER NOT NULL,
    "fecha" TEXT NOT NULL,

    PRIMARY KEY ("eventoId", "fecha"),
    CONSTRAINT "EventoExcepcion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitacion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventoId" INTEGER NOT NULL,
    "invitadoId" INTEGER NOT NULL,
    "respuesta" TEXT NOT NULL DEFAULT 'pendiente',
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitacion_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitacion_invitadoId_fkey" FOREIGN KEY ("invitadoId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "Invitacion_respuesta_check" CHECK ("respuesta" IN ('pendiente', 'aceptada', 'rechazada'))
);

-- CreateTable
CREATE TABLE "Solicitud" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deId" INTEGER NOT NULL,
    "paraId" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Solicitud_deId_fkey" FOREIGN KEY ("deId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Solicitud_paraId_fkey" FOREIGN KEY ("paraId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "Solicitud_estado_check" CHECK ("estado" IN ('pendiente', 'aceptada')),
    CONSTRAINT "Solicitud_distintos_check" CHECK ("deId" <> "paraId")
);

-- CreateTable
CREATE TABLE "Apunte" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "materiaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TEXT NOT NULL,
    "archivo" TEXT,
    CONSTRAINT "Apunte_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Apunte_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "tipoEvento" TEXT,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "estudianteId" INTEGER,
    "materiaId" TEXT,
    "solicitudId" INTEGER,
    "invitacionId" INTEGER,
    "respuesta" TEXT,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notificacion_estudianteId_fkey" FOREIGN KEY ("estudianteId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notificacion_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notificacion_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notificacion_invitacionId_fkey" FOREIGN KEY ("invitacionId") REFERENCES "Invitacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Regla CHECK (agregada a mano)
    CONSTRAINT "Notificacion_tipo_check" CHECK ("tipo" IN ('apunte', 'amistad', 'estudio', 'calendario')),
    CONSTRAINT "Notificacion_tipoEvento_check" CHECK ("tipoEvento" IN ('clase', 'parcial', 'entrega', 'estudio')),
    CONSTRAINT "Notificacion_respuesta_check" CHECK ("respuesta" IN ('aceptada', 'rechazada')),
    -- Espera respuesta de una solicitud O de una invitación, nunca de las dos.
    CONSTRAINT "Notificacion_unPendiente_check" CHECK ("solicitudId" IS NULL OR "invitacionId" IS NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_foto_key" ON "Usuario"("foto");

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_hashToken_key" ON "Sesion"("hashToken");

-- CreateIndex
CREATE INDEX "Sesion_usuarioId_idx" ON "Sesion"("usuarioId");

-- CreateIndex
CREATE INDEX "Resenia_materiaId_idx" ON "Resenia"("materiaId");

-- CreateIndex
CREATE INDEX "Instancia_usuarioId_materiaId_idx" ON "Instancia"("usuarioId", "materiaId");

-- CreateIndex
CREATE INDEX "Evento_usuarioId_idx" ON "Evento"("usuarioId");

-- CreateIndex
CREATE INDEX "Invitacion_invitadoId_idx" ON "Invitacion"("invitadoId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitacion_eventoId_invitadoId_key" ON "Invitacion"("eventoId", "invitadoId");

-- CreateIndex
CREATE INDEX "Solicitud_paraId_idx" ON "Solicitud"("paraId");

-- CreateIndex
CREATE UNIQUE INDEX "Solicitud_deId_paraId_key" ON "Solicitud"("deId", "paraId");

-- CreateIndex
CREATE UNIQUE INDEX "Apunte_archivo_key" ON "Apunte"("archivo");

-- CreateIndex
CREATE INDEX "Apunte_usuarioId_idx" ON "Apunte"("usuarioId");

-- CreateIndex
CREATE INDEX "Apunte_materiaId_idx" ON "Apunte"("materiaId");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_idx" ON "Notificacion"("usuarioId");

-- CreateIndex (agregado a mano): UNA sola solicitud entre dos personas, en
-- cualquier sentido. Con el par ordenado de menor a mayor, A→B y B→A son "el
-- mismo par". `@@unique([deId, paraId])` del schema solo frena A→B repetida.
CREATE UNIQUE INDEX "Solicitud_par_key" ON "Solicitud"(min("deId", "paraId"), max("deId", "paraId"));
