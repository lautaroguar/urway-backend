# Backend de urway — Express + TypeScript + Prisma (SQLite)

API REST de **urway**. Sigue el mismo esquema de la práctica de la cátedra
(Express + Prisma + SQLite): la app pide por HTTP, Express valida y decide, Prisma habla
con la base y SQLite guarda.

Este repositorio es **solo el backend**. La app (Expo + React Native) está en **otro
repositorio: `urway_frontend`**.

El código es el mismo que el de la carpeta de desarrollo, donde este backend vivía en una
subcarpeta `backend/` junto a la app. Por eso algunos comentarios dicen `backend/src/...` (es la
carpeta `src/` de este repo) o nombran archivos de la app como `utilidades/validaciones.ts` (están
en `src/` del repo `urway_frontend`).

```
App (fetch) → HTTP → Express (valida) → Prisma Client → SQLite (prisma/dev.db)
```

Hecho por Lautaro Guarnieri y Franco Di Biase para Programación de Aplicaciones Móviles.

## Cómo correrlo

Requisitos: Node.js 20 o superior y npm. Desde esta carpeta:

```bash
npm install
npx prisma generate
npm run db:setup
npm run dev
```

> `npx prisma generate` va siempre, aunque `npm install` no muestre errores: las versiones nuevas
> de npm no corren solas el paso de instalación de Prisma, y sin el cliente generado la API no arranca.

`npm run db:setup` se corre **una sola vez** (y cada vez que llegue una migración nueva): arma la
base `prisma/dev.db` aplicando las **migraciones** y la llena con el **seeder**. La API queda
escuchando en `http://localhost:3000`. Prueba rápida: `http://localhost:3000/api/health` →
`{ "ok": true }`.

**El `.env` viene en el repositorio** (lo pidió la cátedra y no tiene nada secreto): solo dice
dónde está la base (`DATABASE_URL="file:./dev.db"`, relativo a `prisma/`) y en qué puerto escucha
la API (`PORT=3000`). Si el 3000 está ocupado, se cambia ahí.

Comandos:

| Comando              | Qué hace                                                                     |
|----------------------|------------------------------------------------------------------------------|
| `npm run dev`        | Levanta la API y la reinicia sola al guardar cambios                         |
| `npm run db:setup`   | `prisma migrate deploy` + `prisma db seed`: aplica las migraciones que falten y carga los datos de ejemplo |
| `npm run db:seed`    | Solo el seeder (`prisma db seed`). Se puede correr de nuevo: no duplica nada  |
| `npm run db:migrate` | `prisma migrate dev`: crea una migración nueva después de cambiar el schema   |
| `npm run db:reset`   | **Borra** la base, la vuelve a crear con las migraciones y corre el seeder (también vacía `uploads/`) |
| `npm run build`      | Compila a `dist/` (`npm start` corre lo compilado)                           |

> Si `npm run db:reset` falla con "archivo en uso", primero cortá `npm run dev` (Ctrl+C).

## Base de datos: migraciones y seeder (no se sube la base)

**La base de datos no está en el repositorio** (`*.db` está en el `.gitignore`). Lo que se sube
son los scripts para armarla, como se hace con Prisma ORM:

| Qué                        | Dónde                         | Para qué                                                 |
|----------------------------|-------------------------------|----------------------------------------------------------|
| El modelo                  | `prisma/schema.prisma`        | Las tablas y sus relaciones (de acá sale el cliente)      |
| Las **migraciones**        | `prisma/migrations/`          | El historial de cambios de la base, en SQL. Prisma las aplica en orden y anota cuáles ya corrió en la tabla `_prisma_migrations` |
| El **seeder**              | `prisma/seed.ts`              | Carga los datos de ejemplo de `src/semilla.ts` |
| La configuración de Prisma | `prisma.config.ts`            | Dónde están el schema y las migraciones, y el comando del seeder |

La migración `20261110124500_init` crea las 19 tablas. La generó Prisma a partir del schema y se le
agregaron a mano las reglas que el schema no sabe expresar: los `CHECK` (estrellas 1 a 5, nota 1 a
10, horario "desde < hasta", valores permitidos de cada tipo...) y el índice único
`Solicitud_par_key` (una sola solicitud de amistad entre dos personas, en cualquier sentido).

**Para cambiar la base** (agregar una columna, una tabla...):

1. Se cambia `prisma/schema.prisma`.
2. `npm run db:migrate -- --name que_cambio` → Prisma compara el schema con las migraciones,
   escribe la migración nueva en `prisma/migrations/` y la aplica a tu base.
3. Se suben juntos el schema y la carpeta de la migración nueva. Los demás, al bajar el cambio,
   corren `npm run db:setup` (aplica solo lo que les falta, sin borrar sus datos).

Una migración que ya se subió **no se edita**: si hay que corregir algo, va en otra migración.

**Los datos de ejemplo están todos en `src/semilla.ts`**: el plan (16 materias con sus
correlativas), 15 estudiantes con su historial, clases, parciales, juntadas, reseñas, amistades,
25 apuntes y los avisos. Ese archivo tiene solo datos; el que los guarda es `prisma/seed.ts`:

1. Si la base ya tiene usuarios, no carga nada y lo avisa (por eso correrlo dos veces no duplica).
2. Si está vacía, carga todo de una vez, dentro de una transacción (o se carga todo, o nada).
3. Muestra cuántas filas quedaron en cada tabla.

Los apuntes de ejemplo son PDF que el seeder escribe en `uploads/` (tampoco se suben).
`npm run db:reset` deja la base exactamente como la semilla.

**Si ya tenías una `prisma/dev.db` de antes** (de cuando la creaba `src/initDb.ts`, sin
migraciones), `npm run db:setup` avisa que la base "no está vacía" (error `P3005`). Hay dos salidas:

- `npm run db:reset`: la borra y la arma de nuevo con las migraciones y el seeder (se pierde lo
  que hayas cargado a mano).
- Para conservarla: `npx prisma migrate resolve --applied 20261110124500_init` le anota a Prisma
  que esa migración ya está aplicada (las tablas son las mismas).

## Cuentas de prueba

Todas con la contraseña **`urway2026`**:

| Correo                        | Para qué sirve                                                   |
|-------------------------------|------------------------------------------------------------------|
| `franco.diaz@uca.edu.ar`      | La cuenta de la demo: historial, agenda, avisos pendientes       |
| `mariana.sosa@uca.edu.ar`     | Amiga de Franco (para ver los avisos de apuntes y de estudio)    |
| `elena.ruiz@uca.edu.ar`       | Sin relación con Franco, perfil público                          |
| `david.lopez@uca.edu.ar`      | Franco le mandó una solicitud; perfil privado (solo amigos)      |
| `tomas.vega@uca.edu.ar`       | Le mandó una solicitud a Franco                                  |
| `lucia.fernandez@uca.edu.ar`  | Amiga de Franco; lo invitó a estudiar (sin responder)            |
| `joaquin.alvarez@uca.edu.ar`  | Amigo de Franco; recursa Física I; Franco va a su juntada        |
| `camila.medina@uca.edu.ar`    | Amiga de Franco; apuntes solo para amigos; pendiente de final    |
| `martin.gomez@uca.edu.ar`     | Le mandó una solicitud a Franco; desaprobó un final              |
| `valentina.torres@uca.edu.ar` | Recién empieza (1º cuatrimestre); Franco le mandó una solicitud  |
| `sofia.romero@uca.edu.ar`     | 4º cuatrimestre, perfil privado (Franco ve el candado)           |
| `nicolas.herrera@uca.edu.ar`  | 6º cuatrimestre: tiene casi todo el plan aprobado                |
| `agustin.castro@uca.edu.ar`   | 4º cuatrimestre; le mandó una solicitud a Nicolás                |
| `florencia.rios@uca.edu.ar`   | 3º cuatrimestre; tiene una invitación de Joaquín sin responder   |
| `bruno.acosta@uca.edu.ar`     | Recursa Cálculo Elemental                                        |

Prueba multiusuario (con la app de `urway_frontend` corriendo): entrar como Franco en el
celular, subir un apunte, y entrar como Mariana en la web (`w` en Expo): le llega la notificación.

## Estructura

```
urway_backend/
├── prisma.config.ts       Configuración de la CLI de Prisma (schema, migraciones y comando del seeder)
├── prisma/
│   ├── schema.prisma      El modelo de datos (el "contrato"): 19 tablas, normalizado (3FN)
│   ├── migrations/        Las migraciones (SQL): crean la base. Se suben al repo
│   │   ├── migration_lock.toml
│   │   └── 20261110124500_init/migration.sql   Las 19 tablas, con sus CHECK e índices
│   ├── seed.ts            El seeder: carga los datos de ejemplo (`npx prisma db seed`)
│   └── dev.db             La base. NO se sube: la arma `npm run db:setup`
├── src/
│   ├── index.ts           Express: middlewares, rutas, descargas, limpieza de sesiones, arranque
│   ├── archivos.ts        La carpeta uploads/: guardar, borrar y reconocer fotos y PDF
│   ├── semilla.ts         Los datos de ejemplo, todos juntos (solo datos: los guarda prisma/seed.ts)
│   ├── prisma.ts          El único PrismaClient de la API
│   ├── seguridad.ts       Hash de contraseñas, tokens, el middleware de sesión y su limpieza
│   ├── reglas.ts          Las reglas académicas (estado, correlativas, arrancar/abandonar/reseñar)
│   ├── consultas.ts       Consultas compartidas y la forma del JSON que se devuelve
│   ├── utiles.ts          leerId, validaciones, fechas, noExiste (P2025), responderError
│   └── rutas/             Una carpeta por tema (cuentas, materias, eventos...)
└── uploads/               Los apuntes (fotos y PDF) y las fotos de perfil (nombre al azar). No se sube
```

## Endpoints

Todas las rutas (salvo `health`, `registro` e `ingreso`) piden el header
`Authorization: Bearer <token>`. Los errores siempre vuelven como `{ "error": "mensaje" }`.

| Método | Ruta                                   | Qué hace                                         | Respuestas       |
|--------|----------------------------------------|--------------------------------------------------|------------------|
| GET    | `/api/health`                          | Prueba del servidor                              | 200              |
| POST   | `/api/auth/registro`                   | Crea la cuenta                                   | 201 / 400 / 409  |
| POST   | `/api/auth/ingreso`                    | Correo + contraseña → `{ token, usuario }`       | 200 / 400 / 401  |
| POST   | `/api/auth/salida`                     | Cierra la sesión del token                       | 204 / 401        |
| GET    | `/api/yo`                              | Mis datos                                        | 200 / 401        |
| PATCH  | `/api/yo`                              | Cambia mi privacidad `{ privacidad: { apuntes, notas } }` | 200 / 400 |
| PATCH  | `/api/yo/perfil`                       | Edita mis datos y mi foto `{ contrasenia, nombre?, apellido?, dni?, fechaNacimiento?, foto?, quitarFoto? }`; **pide la contraseña actual** | 200 / 400 / 403 / 413 |
| GET    | `/api/materias`                        | Mis materias: estado calculado, correlativas, dificultad con las reseñas de hoy y mi reseña | 200 |
| POST   | `/api/materias/:id/cursada`            | «Arrancar la cursada» (solo si está *disponible*) | 201 / 400 / 404  |
| DELETE | `/api/materias/:id/cursada`            | «Abandonar cursada»: borra mi reseña y lo rendido en esa cursada y vuelve a *disponible*. No vale para cursadas aprobadas | 200 / 400 / 404 |
| PUT    | `/api/materias/:id/resenia`            | Dejo o cambio MI reseña `{ estrellas: 1 a 5 }` (solo si cursa la materia) | 200 / 400 / 404 |
| GET    | `/api/materias/:id/apuntes`            | Apuntes de otros: `{ comunidad, amigos }`        | 200 / 404        |
| POST   | `/api/materias/:id/historial`          | Cargo algo rendido `{ tipo, nota, fecha, cierraCursada?, recursa? }` | 201 / 400 / 404 |
| DELETE | `/api/materias/:id/historial/ultimo`   | Deshago lo último cargado                        | 200 / 404        |
| GET    | `/api/eventos`                         | Mis eventos + juntadas a las que voy             | 200              |
| POST   | `/api/eventos`                         | Creo un evento (e invito amigos si es "estudio") | 201 / 400        |
| PATCH  | `/api/eventos/:id`                     | Edito un evento mío (toda la serie)              | 200 / 400 / 404  |
| DELETE | `/api/eventos/:id`                     | Borro un evento mío                              | 204 / 400 / 404  |
| POST   | `/api/eventos/:id/excepciones`         | Borro una sola fecha `{ fecha }`                 | 200 / 400 / 404  |
| POST   | `/api/invitaciones/:id/respuesta`      | Acepto o rechazo una invitación `{ acepta }`     | 200 / 400 / 404  |
| GET    | `/api/estudiantes`                     | Los demás estudiantes y mi relación con cada uno | 200              |
| GET    | `/api/estudiantes/:id`                 | Perfil (notas y apuntes según su privacidad)     | 200 / 400 / 404  |
| POST   | `/api/amistades/:id`                   | Mando una solicitud (o acepto la suya)           | 200 / 400 / 404  |
| DELETE | `/api/amistades/:id`                   | Retiro mi solicitud                              | 204 / 404        |
| POST   | `/api/amistades/:id/respuesta`         | Acepto o rechazo su solicitud `{ acepta }`       | 200 / 400 / 404  |
| GET    | `/api/links`                           | Links oficiales de las materias                  | 200              |
| GET    | `/api/novedades`                       | Avisos institucionales                           | 200              |
| GET    | `/api/apuntes`                         | Mis apuntes                                      | 200              |
| POST   | `/api/apuntes`                         | Subo un apunte (foto o PDF) `{ materiaId, archivo (base64), titulo, descripcion? }` y aviso a mis amigos | 201 / 400 / 404 / 413 |
| DELETE | `/api/apuntes/:id`                     | Borro un apunte mío                              | 204 / 404        |
| GET    | `/api/notificaciones`                  | Mis avisos                                       | 200              |
| POST   | `/api/notificaciones/leidas`           | Marco todos como leídos                          | 204              |
| GET    | `/uploads/<archivo>`                   | El archivo de un apunte o una foto de perfil     | 200 / 404        |
| GET    | `/uploads/<archivo>?descargar=1`       | Lo mismo, como descarga (con el título del apunte de nombre) | 200 / 404 |

Pruebas rápidas desde PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
$r = Invoke-RestMethod http://localhost:3000/api/auth/ingreso -Method Post -ContentType "application/json" -Body '{"email":"franco.diaz@uca.edu.ar","contrasenia":"urway2026"}'
Invoke-RestMethod http://localhost:3000/api/materias -Headers @{ Authorization = "Bearer $($r.token)" }
```

## Estados de una materia y correlativas

El estado **no se guarda**: se calcula en cada lectura (`reglas.ts`).

```
bloqueada ──(aprobó la CURSADA de todas sus correlativas)──▶ disponible
disponible ──(«Arrancar la cursada»)──▶ cursando ──(«Abandonar cursada»)──▶ disponible
cursando ──(parcial/TP/exposición aprobado + «terminé de cursar»)──▶ pendienteFinal ──(final ≥ 4)──▶ aprobada
```

"Cursada aprobada" es *pendienteFinal* o *aprobada*: no hace falta rendir el final para desbloquear
la siguiente. Las correlativas están en la tabla `Correlativa` (ver `semilla.ts`). «Arrancar la
cursada» crea una fila en `Cursada` y «Abandonar» la borra. La **dificultad** de una materia es el
promedio de las reseñas actuales (tabla `Resenia`, una por cursada); sin reseñas se muestra la
estimación inicial del plan (`Materia.dificultadInicial`).

## La base de datos (normalizada)

```
Facultad ─< Carrera ─< Materia ─< Correlativa >─ Materia      (qué materia pide cuál)
               │          ├─< Recurso, LinkOficial
               │          │
               └─< Usuario ─< Cursada >─ Materia ── Resenia     (0 o 1 reseña por cursada)
                     │  ├─< Instancia >─ Materia                 (lo rendido)
                     │  ├─< Sesion
                     │  ├─< Apunte >─ Materia
                     │  ├─< Solicitud >─ Usuario                 (de → para)
                     │  └─< Evento ─< EventoDia, EventoExcepcion, Invitacion >─ Usuario
                     └─< Notificacion ──▶ Solicitud | Invitacion (lo que espera respuesta)

A ─< B = "un A tiene muchos B" (B guarda la clave foránea de A).    Novedad va sola.
```

Qué se hizo para llegar a la **3ª forma normal** (y por qué):

| Antes (sprint 2)                                         | Ahora                                                            | Regla       |
|----------------------------------------------------------|------------------------------------------------------------------|-------------|
| `Evento.dias = "[1,3]"`, `Evento.excepciones = '["…"]'`  | Tablas `EventoDia` y `EventoExcepcion`: una fila por valor       | 1FN         |
| `Usuario.facultad` y `Usuario.carrera` como texto        | Tablas `Facultad` y `Carrera`; `Usuario.carreraId` (la facultad sale de la carrera) | 3FN |
| `Notificacion.pendienteClase + pendienteId` (a veces un usuario, a veces una invitación) | `solicitudId` / `invitacionId`: claves foráneas de verdad | Integridad |
| `Recurso.id = "MAT-101-1"` y `Recurso.categoria` siempre "oficiales" | id numérico; la categoría no se guarda (es siempre la misma) | 3FN |
| `Cursada` con una fila por materia y `iniciada` true/false | Una fila SOLO si arrancó la cursada                             | Sin redundancia |
| `Apunte.fecha` y `Apunte.creadoEn` (el mismo dato)       | Solo `fecha`                                                     | Sin redundancia |
| `Materia.dificultad` (¿la inicial o la promedio?)        | `dificultadInicial`; la promedio se calcula                      | Claridad    |
| `fechaNacimiento` como DD/MM/AAAA                        | AAAA-MM-DD como todas las fechas (la API la sigue mostrando DD/MM/AAAA) | Dominio |
| `materiaId` (y `estudianteId`) sin clave foránea en 9 tablas | `REFERENCES` en todas                                        | Integridad  |

Además, la base hace cumplir sola varias reglas: `CHECK` (estrellas 1 a 5, nota 1 a 10, horario
"desde < hasta", una juntada de estudio sin materia, valores permitidos de cada tipo), un **índice
único** para que entre dos personas haya una sola solicitud de amistad (en cualquier sentido), y
borrados en cascada: al abandonar una cursada se borra su reseña; al borrar una invitación o una
solicitud, su aviso todavía sin responder (los `CHECK` y ese índice están en la migración `init`;
las claves foráneas y los borrados en cascada salen del schema). Lo que **no** se guarda porque se
calcula: el estado de cada materia, su dificultad promedio y la facultad de un usuario.

La **API no cambió**: `consultas.ts` vuelve a juntar las tablas (con `include`) y la app recibe el
mismo JSON de antes.

## Seguridad (resumen)

- **Contraseñas:** nunca se guardan; se guarda `scrypt(contraseña, sal)` con una sal al azar por usuario.
- **Editar el perfil** pide siempre la contraseña actual (un 403 si no coincide, que no cierra la sesión).
- **Sesiones:** token al azar de 64 caracteres; en la base solo su SHA-256 y la fecha de vencimiento (30 días). Las vencidas se borran solas (al arrancar, cada hora y al intentar usarlas).
- **Permisos:** cada ruta privada pasa por `requiereSesion`; solo el dueño edita o borra lo suyo (si no, 404).
- **Privacidad:** el servidor no manda notas ni apuntes que el dueño comparte "solo con amigos".
- **Archivos:** se valida que sean JPG/PNG/WEBP o PDF (por sus primeros bytes), máximo 8 MB, con nombre al azar. Un apunte se sube recién cuando el estudiante lo confirma en la app, y la descarga solo acepta nombres como los nuestros (no se puede pedir `../algo`).
- **Pendiente para producción:** HTTPS, límite de intentos de ingreso y archivos servidos con permiso.

## Usarla desde un celular

`localhost` en el celular es el propio celular, pero la app **detecta sola la IP de la PC** (la misma
desde la que Expo sirve la app) y usa esa IP con el puerto 3000: alcanza con tener la PC y el celular
en la misma red Wi-Fi y el puerto 3000 permitido en el firewall. Solo si el backend está en otra
máquina hay que definir `EXPO_PUBLIC_API_URL` en el `.env` de la app (repo `urway_frontend`).
