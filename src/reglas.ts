// =============================================================================
// src/reglas.ts — Las reglas académicas (funciones puras, sin base de datos)
// =============================================================================
//
// QUÉ ES:
//   La copia del lado del servidor de `src/utilidades/materias.ts` de la app:
//     - `recorrerHistorial`: deduce el ESTADO de una materia a partir de lo rendido.
//     - `resolverMateria`: suma lo que viene ANTES de la cursada (¿están las
//       correlativas? ¿arrancó la cursada?) para dar el estado final.
//     - `validarInstancia`: decide si se puede cargar algo rendido.
//     - `motivoNoArrancar`, `motivoNoAbandonar`, `motivoNoResenia`: las reglas de
//       arrancar, abandonar y reseñar una cursada.
//
// POR QUÉ ESTÁ DUPLICADO (en la app y acá):
//   La app las usa para avisar ANTES de mandar ("no podés cargar un final si no
//   terminaste de cursar") y para mostrar qué va a pasar. Pero el servidor no
//   puede confiar en el cliente: cualquiera podría mandar un pedido armado a
//   mano. Por eso vuelve a validar todo antes de guardar.
//
// LOS CINCO ESTADOS DE UNA MATERIA:
//
//   bloqueada ──(se aprueba la CURSADA de todas sus correlativas)──▶ disponible
//   disponible ──(el estudiante toca «Arrancar la cursada»)──▶ cursando
//   cursando ──(«Abandonar cursada»)──▶ disponible        (solo mientras cursa)
//   cursando ──(parcial/TP/exposición aprobado + «terminé de cursar»)──▶ pendienteFinal
//   pendienteFinal ──(final con 4 o más)──▶ aprobada
//   cursando o pendienteFinal ──(desaprobó recuperatorio o final y «recursar»)──▶ cursando
//
//   "Cursada aprobada" = la materia está en pendienteFinal o aprobada. Eso es lo que
//   piden las correlativas: no hace falta haber rendido el final.
//   Una vez que se arrancó la cursada, la materia sigue su camino aunque después se
//   deshaga algo de una correlativa: haber arrancado (la fila de `Cursada`) manda.

export type EstadoMateria = "bloqueada" | "disponible" | "cursando" | "pendienteFinal" | "aprobada";
export type TipoInstancia = "parcial" | "recuperatorio" | "tp" | "exposicion" | "final";
export const TIPOS_INSTANCIA: TipoInstancia[] = ["parcial", "recuperatorio", "tp", "exposicion", "final"];

/** Lo mínimo de una instancia para recorrer el historial. */
export type InstanciaRegla = {
  id: number;
  materiaId: string;
  tipo: string;
  nota: number;
  fecha: string;
  cierraCursada: boolean;
  recursa: boolean;
};

export type Efecto = "cierraCursada" | "aprueba" | "recursa" | null;

export const NOTA_MINIMA = 1;
export const NOTA_APROBACION = 4;
export const NOTA_MAXIMA = 10;

const aprobo = (nota: number) => nota >= NOTA_APROBACION;
const permiteRecursar = (tipo: string) => tipo === "recuperatorio" || tipo === "final";

/** En qué estado tiene que estar la materia para cargar ese tipo. */
export function estadoNecesario(tipo: string): EstadoMateria {
  return tipo === "final" ? "pendienteFinal" : "cursando";
}

/** ¿La cursada está aprobada? (pendiente de final o aprobada). Es lo que piden las correlativas. */
export const cursadaAprobada = (estado: EstadoMateria) =>
  estado === "pendienteFinal" || estado === "aprobada";

/** Cómo quedó una materia después de recorrer su historial. */
export type Recorrido = {
  estado: EstadoMateria;
  /** La nota del final, solo si quedó aprobada. */
  notaFinal: number | undefined;
  /** El día en que se terminó de cursar, solo si está pendiente de final o aprobada. */
  finCursada: string | undefined;
  /** En qué cursada va (1 = la primera; sube cada vez que se recursa). */
  intento: number;
  /** Cada cosa rendida, con en qué cursada cayó y qué provocó. */
  pasos: { instancia: InstanciaRegla; intento: number; efecto: Efecto }[];
};

/**
 * Recorre lo rendido de UNA materia (en orden de carga) y devuelve cómo quedó,
 * suponiendo que la cursada está arrancada. Arranca "cursando".
 */
export function recorrerHistorial(historial: InstanciaRegla[]): Recorrido {
  let estado: EstadoMateria = "cursando";
  let notaFinal: number | undefined;
  let finCursada: string | undefined;
  let intento = 1;
  const pasos: { instancia: InstanciaRegla; intento: number; efecto: Efecto }[] = [];

  for (const instancia of historial) {
    const intentoDeEsta = intento;
    let efecto: Efecto = null;
    const aprobada = aprobo(instancia.nota);

    if (instancia.tipo === "final") {
      if (estado === "pendienteFinal" && aprobada) {
        estado = "aprobada";
        notaFinal = instancia.nota;
        efecto = "aprueba";
      } else if (estado === "pendienteFinal" && instancia.recursa) {
        estado = "cursando";
        finCursada = undefined;
        intento += 1;
        efecto = "recursa";
      }
    } else if (estado === "cursando") {
      if (aprobada && instancia.cierraCursada) {
        estado = "pendienteFinal";
        finCursada = instancia.fecha;
        efecto = "cierraCursada";
      } else if (!aprobada && instancia.recursa) {
        intento += 1;
        efecto = "recursa";
      }
    }
    pasos.push({ instancia, intento: intentoDeEsta, efecto });
  }
  return { estado, notaFinal, finCursada, intento, pasos };
}

/**
 * El estado FINAL de una materia para un estudiante:
 *   - Si ya arrancó la cursada (`iniciada`: tiene fila en `Cursada`), manda su historial.
 *   - Si no, está "disponible" (tiene todas las correlativas) o "bloqueada" (le falta
 *     alguna). El historial que quede (de una cursada anterior que se recursó) se
 *     conserva, y `intento` dice cuál es la cursada que va a empezar.
 */
export function resolverMateria(
  iniciada: boolean,
  correlativasCumplidas: boolean,
  historial: InstanciaRegla[]
): Recorrido {
  const recorrido = recorrerHistorial(historial);
  if (iniciada) return recorrido;
  return {
    ...recorrido,
    estado: correlativasCumplidas ? "disponible" : "bloqueada",
    notaFinal: undefined,
    finCursada: undefined,
  };
}

// -----------------------------------------------------------------------------
// Arrancar, abandonar y reseñar la cursada
// -----------------------------------------------------------------------------

/** ¿Se puede arrancar la cursada? Devuelve el motivo por el que NO, o `null`. */
export function motivoNoArrancar(estado: EstadoMateria): string | null {
  if (estado === "bloqueada") return "Todavía no podés cursarla: te faltan correlativas.";
  if (estado === "disponible") return null;
  return "Ya arrancaste la cursada de esta materia.";
}

/**
 * ¿Se puede abandonar la cursada? Solo mientras se está cursando: una cursada ya
 * aprobada (pendiente de final o aprobada) no se abandona.
 */
export function motivoNoAbandonar(estado: EstadoMateria): string | null {
  if (estado === "cursando") return null;
  if (estado === "pendienteFinal" || estado === "aprobada") {
    return "No se puede abandonar una cursada que ya aprobaste.";
  }
  return "No estás cursando esta materia.";
}

/** ¿Se puede dejar una reseña? Solo quien arrancó la cursada (la cursa o ya la cursó). */
export function motivoNoResenia(estado: EstadoMateria): string | null {
  if (estado === "bloqueada" || estado === "disponible") {
    return "Para dejar una reseña tenés que estar cursando la materia.";
  }
  return null;
}

// -----------------------------------------------------------------------------
// Cargar lo rendido
// -----------------------------------------------------------------------------

/** Lo que manda la app para cargar algo rendido (ya convertido). */
export type BorradorInstancia = {
  tipo: string;
  nota: number;
  fecha: string;
  cierraCursada: boolean;
  recursa: boolean;
};

/**
 * ¿Se puede cargar? Devuelve el motivo por el que NO (texto) o `null` si se puede.
 * `ultimaFecha` es la fecha de lo último cargado de esa materia; `hoy`, "AAAA-MM-DD".
 */
export function validarInstancia(
  estado: EstadoMateria,
  ultimaFecha: string | undefined,
  borrador: BorradorInstancia,
  hoy: string
): string | null {
  if (!TIPOS_INSTANCIA.includes(borrador.tipo as TipoInstancia)) {
    return "El tipo tiene que ser parcial, recuperatorio, tp, exposicion o final.";
  }
  if (estado === "bloqueada") return "Esta materia está bloqueada: todavía no la podés cursar.";
  if (estado === "disponible") return "Primero tenés que arrancar la cursada de esta materia.";
  if (estado === "aprobada") return "Ya aprobaste esta materia: no hay nada más para cargar.";
  if (estado !== estadoNecesario(borrador.tipo)) {
    return borrador.tipo === "final"
      ? "Para cargar el final primero tenés que terminar la cursada."
      : "La cursada de esta materia ya terminó: lo que te queda es el final.";
  }
  if (!Number.isInteger(borrador.nota) || borrador.nota < NOTA_MINIMA || borrador.nota > NOTA_MAXIMA) {
    return `La nota va de ${NOTA_MINIMA} a ${NOTA_MAXIMA}, sin decimales.`;
  }
  if (borrador.fecha > hoy) return "La fecha no puede ser futura: cargá lo que ya rendiste.";
  if (ultimaFecha && borrador.fecha < ultimaFecha) {
    return "La fecha no puede ser anterior a lo último que cargaste de esta materia.";
  }
  const aprobada = aprobo(borrador.nota);
  if (borrador.cierraCursada && (borrador.tipo === "final" || !aprobada)) {
    return "Con menos de 4 no se aprueba la cursada.";
  }
  if (borrador.recursa && (!permiteRecursar(borrador.tipo) || aprobada)) {
    return "Solo se recursa después de desaprobar un recuperatorio o un final.";
  }
  return null;
}
