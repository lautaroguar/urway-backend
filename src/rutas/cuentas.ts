// =============================================================================
// src/rutas/cuentas.ts — Registro, ingreso, salida y "mi usuario"
// =============================================================================
//
// | Método | Ruta                  | Qué hace                                   | Respuestas             |
// |--------|-----------------------|--------------------------------------------|------------------------|
// | POST   | /api/auth/registro    | Crea la cuenta (no inicia sesión)          | 201 / 400 / 409        |
// | POST   | /api/auth/ingreso     | Valida correo y contraseña; da un token    | 200 / 400 / 401        |
// | POST   | /api/auth/salida      | Cierra la sesión de ese token              | 204 / 401              |
// | GET    | /api/yo               | Los datos de quien tiene la sesión         | 200 / 401              |
// | PATCH  | /api/yo               | Cambia la privacidad (apuntes / notas)     | 200 / 400 / 401        |
// | PATCH  | /api/yo/perfil        | Edita mis datos y mi foto (pide contraseña)| 200 / 400 / 403 / 413  |

import { Router } from "express";

import { bytesDeBase64, borrarArchivo, guardarArchivo, MAXIMO_BYTES, tipoDeArchivo } from "../archivos";
import { CON_CARRERA, usuarioParaApi } from "../consultas";
import { prisma } from "../prisma";
import {
  cerrarSesion,
  crearSesion,
  hashearContrasenia,
  requiereSesion,
  tokenDe,
  usuarioDe,
  verificarContrasenia,
} from "../seguridad";
import { fechaParaBase, responderError, textoObligatorio } from "../utiles";

export const rutasCuentas = Router();

// Los mismos patrones que valida la app (`utilidades/validaciones.ts`). La fecha de
// nacimiento se valida con `fechaParaBase` (forma DD/MM/AAAA y que el día exista).
const ES_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ES_DNI = /^[1-9]\d{6,7}$/;
const VISIBILIDADES = ["todos", "amigos"];

/** Los correos se comparan sin mayúsculas ni espacios. */
const normalizar = (email: unknown) => String(email ?? "").trim().toLowerCase();

// POST /api/auth/registro
// Crea la cuenta: el usuario (con el HASH de la contraseña) y sus cursadas.
rutasCuentas.post("/auth/registro", async (req, res) => {
  const { nombre, apellido, email, contrasenia, dni, fechaNacimiento, facultad, carrera } =
    req.body ?? {};

  // Primero se valida todo lo que llegó (400 = el problema es del cliente).
  const nombreOk = textoObligatorio(nombre, 40);
  const apellidoOk = textoObligatorio(apellido, 40);
  if (!nombreOk || !apellidoOk) return responderError(res, 400, "Faltan el nombre o el apellido.");
  const correo = normalizar(email);
  if (!ES_EMAIL.test(correo)) return responderError(res, 400, "El correo no tiene un formato válido.");
  if (
    typeof contrasenia !== "string" ||
    contrasenia.length < 8 ||
    contrasenia.length > 64 ||
    !/[A-Za-z]/.test(contrasenia) ||
    !/\d/.test(contrasenia)
  ) {
    return responderError(res, 400, "La contraseña tiene que tener entre 8 y 64 caracteres, con letras y números.");
  }
  if (dni !== undefined && dni !== "" && !ES_DNI.test(String(dni))) {
    return responderError(res, 400, "El DNI tiene 7 u 8 números, sin puntos.");
  }
  // "15/03/2001" → "2001-03-15" (así se guardan todas las fechas en la base).
  const nacimiento = fechaNacimiento ? fechaParaBase(String(fechaNacimiento)) : null;
  if (fechaNacimiento && !nacimiento) {
    return responderError(res, 400, "La fecha de nacimiento va como DD/MM/AAAA y tiene que existir.");
  }
  if (!textoObligatorio(facultad, 40) || !textoObligatorio(carrera, 40)) {
    return responderError(res, 400, "Faltan la facultad o la carrera.");
  }

  try {
    // La carrera tiene que existir Y ser de esa facultad (las dos son tablas).
    const carreraElegida = await prisma.carrera.findUnique({ where: { id: String(carrera) } });
    if (!carreraElegida || carreraElegida.facultadId !== String(facultad)) {
      return responderError(res, 400, "Esa carrera no existe en esa facultad.");
    }
    // 409 = conflicto: ese correo ya tiene cuenta.
    const existente = await prisma.usuario.findUnique({ where: { email: correo } });
    if (existente) return responderError(res, 409, "Ya existe una cuenta con ese correo.");

    const { hash, sal } = await hashearContrasenia(contrasenia);
    // Las materias de su plan que no piden ninguna correlativa (`none: {}` = "sin
    // ninguna fila en Correlativa"): las del 1º cuatrimestre.
    const sinCorrelativas = await prisma.materia.findMany({
      where: { carreraId: carreraElegida.id, correlativas: { none: {} } },
    });
    // `$transaction`: el usuario y sus cursadas se guardan juntos, o nada.
    const usuario = await prisma.$transaction(async (tx) => {
      const creado = await tx.usuario.create({
        data: {
          nombre: nombreOk,
          apellido: apellidoOk,
          email: correo,
          dni: dni ? String(dni) : null,
          fechaNacimiento: nacimiento,
          carreraId: carreraElegida.id,
          hashContrasenia: hash,
          sal,
        },
        include: CON_CARRERA,
      });
      // Una cuenta nueva arranca "en curso" las materias sin correlativas (así la primera
      // pantalla no queda vacía). Las demás no tienen fila: se desbloquean al aprobar
      // sus correlativas y el estudiante las arranca cuando quiera.
      await tx.cursada.createMany({
        data: sinCorrelativas.map((m) => ({ usuarioId: creado.id, materiaId: m.id })),
      });
      return creado;
    });

    // 201 Created: se creó un recurso nuevo. Nunca se devuelve el hash.
    res.status(201).json({ usuario: usuarioParaApi(usuario) });
  } catch {
    responderError(res, 500, "No se pudo crear la cuenta.");
  }
});

// POST /api/auth/ingreso
// Si el correo y la contraseña coinciden, abre una sesión y devuelve el token.
rutasCuentas.post("/auth/ingreso", async (req, res) => {
  const correo = normalizar(req.body?.email);
  const contrasenia = req.body?.contrasenia;
  if (!correo || typeof contrasenia !== "string" || contrasenia.length === 0) {
    return responderError(res, 400, "Ingresá tu correo y tu contraseña.");
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email: correo }, include: CON_CARRERA });
    // El mismo mensaje si no existe el correo o si la contraseña no coincide: así
    // no se puede averiguar qué correos tienen cuenta.
    const valida =
      usuario !== null &&
      (await verificarContrasenia(contrasenia, usuario.hashContrasenia, usuario.sal));
    if (!usuario || !valida) {
      return responderError(res, 401, "El correo o la contraseña no son correctos.");
    }
    const token = await crearSesion(usuario.id);
    res.json({ token, usuario: usuarioParaApi(usuario) });
  } catch {
    responderError(res, 500, "No se pudo iniciar sesión.");
  }
});

// POST /api/auth/salida
// Borra la sesión del token que vino en el header.
rutasCuentas.post("/auth/salida", requiereSesion, async (req, res) => {
  try {
    await cerrarSesion(tokenDe(req) ?? "");
    res.status(204).end(); // 204 No Content: salió bien y no hay nada que devolver
  } catch {
    responderError(res, 500, "No se pudo cerrar la sesión.");
  }
});

// GET /api/yo
// Los datos de quien tiene la sesión (la app lo pide al abrir, con el token guardado).
rutasCuentas.get("/yo", requiereSesion, async (_req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioDe(res) }, include: CON_CARRERA });
    if (!usuario) return responderError(res, 401, "Tu cuenta ya no existe.");
    res.json(usuarioParaApi(usuario));
  } catch {
    responderError(res, 500, "No se pudieron leer tus datos.");
  }
});

// PATCH /api/yo
// Cambia solo lo que llega: la privacidad de los apuntes y/o de las notas.
rutasCuentas.patch("/yo", requiereSesion, async (req, res) => {
  const privacidad = req.body?.privacidad ?? {};
  const datos: { verApuntes?: string; verNotas?: string } = {};
  if (privacidad.apuntes !== undefined) {
    if (!VISIBILIDADES.includes(privacidad.apuntes)) {
      return responderError(res, 400, "La privacidad es 'todos' o 'amigos'.");
    }
    datos.verApuntes = privacidad.apuntes;
  }
  if (privacidad.notas !== undefined) {
    if (!VISIBILIDADES.includes(privacidad.notas)) {
      return responderError(res, 400, "La privacidad es 'todos' o 'amigos'.");
    }
    datos.verNotas = privacidad.notas;
  }
  if (Object.keys(datos).length === 0) return responderError(res, 400, "No hay campos para actualizar.");

  try {
    const usuario = await prisma.usuario.update({
      where: { id: usuarioDe(res) },
      data: datos,
      include: CON_CARRERA,
    });
    res.json(usuarioParaApi(usuario));
  } catch {
    responderError(res, 500, "No se pudo guardar la privacidad.");
  }
});

// PATCH /api/yo/perfil
// Body: { contrasenia (la ACTUAL, obligatoria), nombre?, apellido?, dni?, fechaNacimiento?,
//         foto? (base64), quitarFoto? }
// Cambia solo lo que llega. Para guardar CUALQUIER cambio hay que escribir la contraseña:
// así, si alguien se encuentra el teléfono con la sesión abierta, no puede cambiarle
// los datos ni la foto a la cuenta.
rutasCuentas.patch("/yo/perfil", requiereSesion, async (req, res) => {
  const usuarioId = usuarioDe(res);
  const { contrasenia, nombre, apellido, dni, fechaNacimiento, foto, quitarFoto } = req.body ?? {};
  // El nombre del archivo de la foto nueva, si se llega a guardar una. Está afuera del
  // `try` para que el `catch` pueda borrarlo si después algo falla (si no, quedaría
  // un archivo suelto en `uploads/` que ninguna fila nombra).
  let fotoNueva: string | null = null;

  try {
    const actual = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!actual) return responderError(res, 401, "Tu cuenta ya no existe.");

    // 403 (y no 401): el token es válido, lo que está mal es la contraseña escrita. Un
    // 401 haría que la app creyera que la sesión venció y cerrara la sesión.
    if (
      typeof contrasenia !== "string" ||
      !(await verificarContrasenia(contrasenia, actual.hashContrasenia, actual.sal))
    ) {
      return responderError(res, 403, "La contraseña no es correcta.");
    }

    // Se arma lo que cambia, validando cada dato con las mismas reglas del registro.
    const datos: { nombre?: string; apellido?: string; dni?: string | null; fechaNacimiento?: string | null; foto?: string | null } = {};
    if (nombre !== undefined) {
      const ok = textoObligatorio(nombre, 40);
      if (!ok) return responderError(res, 400, "El nombre no puede estar vacío (hasta 40 letras).");
      datos.nombre = ok;
    }
    if (apellido !== undefined) {
      const ok = textoObligatorio(apellido, 40);
      if (!ok) return responderError(res, 400, "El apellido no puede estar vacío (hasta 40 letras).");
      datos.apellido = ok;
    }
    if (dni !== undefined) {
      if (dni !== "" && !ES_DNI.test(String(dni))) {
        return responderError(res, 400, "El DNI tiene 7 u 8 números, sin puntos.");
      }
      datos.dni = dni === "" ? null : String(dni);
    }
    if (fechaNacimiento !== undefined) {
      // "" = la borra; si no, "15/03/2001" se guarda como "2001-03-15".
      const nacimiento = fechaNacimiento === "" ? null : fechaParaBase(String(fechaNacimiento));
      if (fechaNacimiento !== "" && !nacimiento) {
        return responderError(res, 400, "La fecha de nacimiento va como DD/MM/AAAA y tiene que existir.");
      }
      datos.fechaNacimiento = nacimiento;
    }

    // La foto: se revisa lo que llegó ANTES de escribir nada en el disco.
    if (foto !== undefined && foto !== null && foto !== "") {
      const bytes = bytesDeBase64(String(foto));
      if (bytes.length > MAXIMO_BYTES) return responderError(res, 413, "La foto es demasiado grande (máximo 8 MB).");
      const tipo = tipoDeArchivo(bytes);
      if (!tipo || tipo === "pdf") {
        return responderError(res, 400, "La foto de perfil tiene que ser una imagen JPG, PNG o WEBP.");
      }
      fotoNueva = await guardarArchivo(bytes, tipo);
      datos.foto = fotoNueva;
    } else if (quitarFoto === true) {
      datos.foto = null;
    }

    if (Object.keys(datos).length === 0) return responderError(res, 400, "No hay cambios para guardar.");

    const usuario = await prisma.usuario.update({
      where: { id: usuarioId },
      data: datos,
      include: CON_CARRERA,
    });
    // Ya guardado, la foto vieja sobra: se borra su archivo.
    if (datos.foto !== undefined) await borrarArchivo(actual.foto);
    res.json(usuarioParaApi(usuario));
  } catch {
    await borrarArchivo(fotoNueva).catch(() => {}); // no dejar la foto nueva suelta
    responderError(res, 500, "No se pudo guardar tu perfil.");
  }
});
