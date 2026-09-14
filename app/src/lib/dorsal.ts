/**
 * Qué es un dorsal, a partir de lo que devuelve un OCR.
 *
 * Es independiente del motor. Rekognition y Google Vision entregan lo mismo
 * —líneas de texto con una confianza— y el criterio de cuál de esas líneas es
 * la placa es nuestro, no de ellos. Tenerlo aparte permite compararlos en
 * igualdad de condiciones: motor contra motor, no motor contra filtro.
 *
 * Medido sobre DOWNHILL 4TO ROUND PAN DE AZUCAR (486 fotos, 2026-09-14): el
 * filtro anterior sacaba dorsal en el 58 %; con estas reglas, sobre las mismas
 * detecciones crudas, el 77 %. Lo que se perdía:
 *
 * - Dorsales de UN dígito ("1", "4", "8"): la regex pedía 2 a 5. En descenso
 *   son los primeros de la general. 31 fotos.
 * - Letra pegada al número ("120H", "24H", "150th", "B62"): el sticker de
 *   categoría al lado de la placa, o una confusión del OCR. 27 fotos.
 * - Confianza entre 25 y 50 ("248"@37, "195"@33): placas legibles con barro o
 *   en ángulo. Gran parte de 49 fotos.
 */

export type LineaOcr = {
  texto: string;
  /** 0 a 100. */
  confianza: number;
};

/** Una línea que ES una placa se acepta con poca confianza: ya tiene la forma. */
export const CONFIANZA_MIN_PLACA = 25;
/** Un número suelto adentro de una frase ("FR 541") necesita más. */
export const CONFIANZA_MIN_SUELTO = 50;

/**
 * Letras que el OCR confunde con dígitos cuando van al principio de la placa.
 * "B62" es casi siempre "862". Una letra que no está acá ("F 541") no se
 * convierte: se descarta como placa pura y queda para la regla de número suelto.
 */
const LETRA_A_DIGITO: Record<string, string> = {
  O: "0",
  D: "0",
  Q: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  B: "8",
  G: "6",
};

/** Marcas que aparecen en la ropa y parecen números: no son placas. */
const NO_ES_PLACA = /[%:]|\bKM\b|\.COM/;

/**
 * Si la línea entera tiene forma de placa, devuelve el número normalizado
 * (sin ceros a la izquierda, sin el sticker de categoría). Si no, null.
 */
export function placaDeLinea(texto: string): string | null {
  const t = texto
    .trim()
    .toUpperCase()
    .replace(/^[#Nº°.\-\s]+/, "");
  if (!t || NO_ES_PLACA.test(t)) return null;

  // letra opcional + 1 a 4 dígitos + hasta 2 letras de sufijo (120H, 150TH)
  const m = /^([A-Z]?)(\d{1,4})([A-Z]{0,2})$/.exec(t);
  if (!m) return null;

  const letra = m[1]!;
  const prefijo = letra ? LETRA_A_DIGITO[letra] : "";
  if (prefijo === undefined) return null;

  const numero = (prefijo + m[2]!).replace(/^0+(?=\d)/, "");
  if (numero === "0" || numero.length > 4) return null;
  return numero;
}

/**
 * Dorsales candidatos, del más probable al menos. Vacío si no hay ninguno.
 *
 * Dos fuentes, con pesos muy distintos:
 * - una línea que es una placa entera (10 puntos + confianza);
 * - un número de 2 a 4 dígitos adentro de una frase (1 punto + confianza).
 * Así una placa leída con 30 de confianza le gana siempre a un "541" sacado
 * de "FR 541" con 90: la forma vale más que la seguridad del motor.
 */
export function extraerDorsales(lineas: LineaOcr[]): string[] {
  const puntaje = new Map<string, number>();
  const anotar = (valor: string, puntos: number) => {
    if ((puntaje.get(valor) ?? -1) < puntos) puntaje.set(valor, puntos);
  };

  // El logo de antiparras 100% aparece en muchas fotos de descenso. Cuando el
  // OCR lo lee completo, un "100" suelto en la misma foto es el mismo logo
  // leído a medias, no un dorsal.
  const hayLogo100 = lineas.some((l) => /100\s*%/.test(l.texto));

  for (const linea of lineas) {
    const placa = placaDeLinea(linea.texto);
    if (placa !== null) {
      if (linea.confianza < CONFIANZA_MIN_PLACA) continue;
      if (hayLogo100 && placa === "100") continue;
      anotar(placa, 10 + linea.confianza / 50 + (placa.length >= 2 ? 1 : 0));
      continue;
    }

    if (linea.confianza < CONFIANZA_MIN_SUELTO) continue;
    if (NO_ES_PLACA.test(linea.texto.toUpperCase())) continue;
    for (const suelto of linea.texto.match(/\b\d{2,4}\b/g) ?? []) {
      const numero = suelto.replace(/^0+(?=\d)/, "");
      if (hayLogo100 && numero === "100") continue;
      anotar(numero, 1 + linea.confianza / 50);
    }
  }

  return [...puntaje.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}
