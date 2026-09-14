/**
 * Google Cloud Vision, para la prueba de lectura de dorsales.
 *
 * REST directo con API key: sin SDK ni cuenta de servicio, que para una
 * prueba son más piezas que valor. La imagen viaja en el cuerpo del request
 * (base64): Vision no puede leer nuestro bucket de S3, y su modo por URL está
 * documentado como "sin garantía", así que no se usa.
 *
 * Se pide DOCUMENT_TEXT_DETECTION y no TEXT_DETECTION: cuestan lo mismo y sólo
 * la primera devuelve confianza por palabra, que es lo que necesita
 * `extraerDorsales` para comparar contra Rekognition con las mismas reglas.
 */

import type { LineaOcr } from "~/lib/dorsal";

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const TIMEOUT_MS = 60_000;

export function googleVisionDisponible(): boolean {
  return Boolean(process.env.GOOGLE_VISION_API_KEY);
}

type Simbolo = {
  text?: string;
  confidence?: number;
  property?: { detectedBreak?: { type?: string } };
};
type Palabra = { confidence?: number; symbols?: Simbolo[] };
type Parrafo = { words?: Palabra[] };
type Bloque = { paragraphs?: Parrafo[] };
type Pagina = { blocks?: Bloque[] };
export type AnotacionTextoCompleto = { pages?: Pagina[] };

type RespuestaVision = {
  responses?: Array<{
    error?: { code?: number; message?: string };
    fullTextAnnotation?: AnotacionTextoCompleto;
  }>;
};

/**
 * Manda la imagen y devuelve las líneas leídas, en el mismo formato que las de
 * Rekognition. Lanza si la API no está configurada o contesta con error: en la
 * prueba un fallo tiene que verse, no disfrazarse de "sin dorsal".
 */
export async function detectarTextoGoogle(
  bytes: Uint8Array,
  subject: string,
): Promise<LineaOcr[]> {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) throw new Error("GOOGLE_VISION_API_KEY no está configurada en el .env");

  const cuerpo = JSON.stringify({
    requests: [
      {
        image: { content: Buffer.from(bytes).toString("base64") },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  });

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.log(
      `[gvision] ${JSON.stringify({ subject, result: "error", error: (err as Error).name, ms: Date.now() - t0 })}`,
    );
    throw err;
  }

  console.log(
    `[gvision] ${JSON.stringify({ subject, result: res.ok ? "ok" : "error", status: res.status, ms: Date.now() - t0 })}`,
  );

  if (!res.ok) {
    const detalle = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Google Vision HTTP ${res.status}: ${detalle}`);
  }

  const json = (await res.json()) as RespuestaVision;
  const respuesta = json.responses?.[0];
  if (respuesta?.error) {
    throw new Error(`Google Vision: ${respuesta.error.message ?? "error sin detalle"}`);
  }
  return lineasDeVision(respuesta?.fullTextAnnotation);
}

/**
 * Vision no devuelve "líneas": devuelve palabras hechas de símbolos, y cada
 * símbolo puede traer una marca de corte (espacio, fin de línea). Acá se
 * rearman las líneas siguiendo esas marcas, que es lo que Rekognition ya
 * entrega hecho.
 *
 * La confianza de la línea es el promedio de sus símbolos, en 0 a 100.
 */
export function lineasDeVision(anotacion: AnotacionTextoCompleto | undefined): LineaOcr[] {
  const lineas: LineaOcr[] = [];
  let texto = "";
  let confianzas: number[] = [];

  const cerrar = () => {
    const limpio = texto.trim();
    if (limpio) {
      const media = confianzas.length
        ? confianzas.reduce((a, b) => a + b, 0) / confianzas.length
        : 0;
      lineas.push({ texto: limpio, confianza: Math.round(media * 1000) / 10 });
    }
    texto = "";
    confianzas = [];
  };

  for (const pagina of anotacion?.pages ?? []) {
    for (const bloque of pagina.blocks ?? []) {
      for (const parrafo of bloque.paragraphs ?? []) {
        for (const palabra of parrafo.words ?? []) {
          let corteAlFinal = false;
          for (const simbolo of palabra.symbols ?? []) {
            texto += simbolo.text ?? "";
            confianzas.push(simbolo.confidence ?? palabra.confidence ?? 0);
            const corte = simbolo.property?.detectedBreak?.type;
            if (corte === "SPACE" || corte === "SURE_SPACE") {
              texto += " ";
              corteAlFinal = true;
            } else if (corte === "EOL_SURE_SPACE" || corte === "LINE_BREAK") {
              cerrar();
              corteAlFinal = true;
            } else if (corte === "HYPHEN") {
              texto += "-";
              corteAlFinal = true;
            }
          }
          if (!corteAlFinal) texto += " ";
        }
        cerrar();
      }
    }
  }
  cerrar();
  return lineas;
}
