/**
 * Trabajos de reprocesado, en segundo plano.
 *
 * Por qué existe: hacer el trabajo dentro del request HTTP no funciona. Las
 * llamadas a Rekognition tardan segundos, el proxy corta la respuesta a los
 * ~30 s, y el cliente aborta al primer 504 — aunque el servidor haya terminado
 * el lote. Con 740 fotos pendientes eso avanzaba de a dos por click.
 *
 * La subida ya funcionaba bien justamente porque procesa en segundo plano y sin
 * plazo. Acá se hace lo mismo: el POST arranca el trabajo y contesta al
 * instante, y el cliente pregunta cómo va cada par de segundos.
 *
 * El estado vive en memoria del proceso. Si se reinicia, se pierde el progreso
 * mostrado —no el trabajo, que ya está en la base— y se puede volver a arrancar.
 * Asume un solo proceso: con pm2 en modo cluster habría que moverlo a la base.
 */

import { db } from "~/server/db";
import { isVideoMimeType } from "~/lib/video-utils";

export type ReprocessKind = "ocr" | "ocr-retry" | "faces" | "watermark";

export type EstadoTrabajo = {
  kind: ReprocessKind;
  collectionId: string;
  procesadas: number;
  fallidas: number;
  pendientes: number;
  errores: string[];
  corriendo: boolean;
  /** Motivo por el que se cortó, si se cortó mal. */
  error: string | null;
  arrancado: number;
  actualizado: number;
};

const trabajos = new Map<string, EstadoTrabajo>();

const clave = (collectionId: string, kind: ReprocessKind) => `${collectionId}:${kind}`;

/**
 * Qué le falta a cada foto.
 *
 * Para OCR y rostros el filtro es "nunca se intentó", no "no tiene resultado":
 * la mayoría de las fotos no tiene un dorsal visible, y muchas no tienen ningún
 * rostro detectable. Filtrar por resultado las dejaría en la cola para siempre
 * y cada pasada las volvería a pagar.
 */
export function pendingFilter(kind: ReprocessKind) {
  switch (kind) {
    case "ocr":
      return { ocrAttemptedAt: null };
    case "ocr-retry":
      // La excepción deliberada: acá SÍ se reprocesa lo ya intentado. Es una
      // acción aparte, que el admin elige a mano.
      return { bibNumber: null };
    case "faces":
      return { faceAttemptedAt: null };
    case "watermark":
      return { previewKey: null };
  }
}

/** Mensaje corto y útil de un error desconocido. */
export function mensajeDeError(err: unknown): string {
  if (err instanceof Error) {
    const primera = err.message
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    return (primera ?? err.message).slice(0, 300);
  }
  return String(err).slice(0, 300);
}

export function estadoDe(collectionId: string, kind: ReprocessKind): EstadoTrabajo | null {
  return trabajos.get(clave(collectionId, kind)) ?? null;
}

/**
 * ¿Hay un reprocesado en curso, de este tipo?
 *
 * Lo consulta el barrido de marcas de agua, y le importa sólo el de watermark:
 * es el único que compite por lo mismo, porque es el único que baja el original
 * al servidor. Los de dorsal y rostros le pasan a Rekognition la referencia en
 * S3 y no mueven bytes, así que no hay motivo para frenar el barrido mientras
 * uno de esos corre — y frenarlo dejaba las fotos sin marca durante toda una
 * corrida de dorsales.
 */
/**
 * Un trabajo sano actualiza `actualizado` con cada foto (cada pocos segundos).
 * Si lleva este tiempo mudo, el flag quedó colgado —una promesa que nunca se
 * asentó— y no puede seguir contando como "corriendo": el barrido de marcas de
 * agua le cede el paso, y un flag zombi lo dejaba apagado hasta reiniciar pm2.
 */
const TRABAJO_MUDO_MS = 10 * 60_000;

export function hayTrabajoCorriendo(kind?: ReprocessKind): boolean {
  const ahora = Date.now();
  for (const t of trabajos.values()) {
    if (!t.corriendo) continue;
    if (kind && t.kind !== kind) continue;
    if (ahora - t.actualizado > TRABAJO_MUDO_MS) {
      console.warn(
        `[reprocess:${t.kind}] trabajo mudo hace ${Math.round((ahora - t.actualizado) / 60000)} min — se lo da por muerto`,
      );
      t.corriendo = false;
      t.error = t.error ?? "trabajo dado por muerto por inactividad";
      continue;
    }
    return true;
  }
  return false;
}

/** Cuántas fotos por vuelta se traen de la base. */
const LOTE = 25;

/**
 * Arranca el trabajo si no está corriendo ya. Devuelve el estado al instante:
 * el procesamiento sigue por su cuenta después de que este request contestó.
 */
export function arrancar(collectionId: string, kind: ReprocessKind): EstadoTrabajo {
  const k = clave(collectionId, kind);
  const existente = trabajos.get(k);
  if (existente?.corriendo) return existente;

  const estado: EstadoTrabajo = {
    kind,
    collectionId,
    procesadas: 0,
    fallidas: 0,
    pendientes: existente?.pendientes ?? 0,
    errores: [],
    corriendo: true,
    error: null,
    arrancado: Date.now(),
    actualizado: Date.now(),
  };
  trabajos.set(k, estado);
  console.log(`[reprocess:${kind}] arrancar() pedido para ${collectionId}`);

  void correr(estado).catch((err) => {
    estado.error = mensajeDeError(err);
    estado.corriendo = false;
    estado.actualizado = Date.now();
    console.error(`[reprocess:${kind}] el trabajo murió:`, err);
  });

  return estado;
}

/** Pide que el trabajo se detenga en la vuelta siguiente. */
export function detener(collectionId: string, kind: ReprocessKind): void {
  const e = trabajos.get(clave(collectionId, kind));
  if (!e) return;
  // Se loguea porque, sin esto, un trabajo detenido a mano y uno cortado por un
  // bug se ven exactamente igual desde afuera.
  console.log(
    `[reprocess:${kind}] detener() pedido para ${collectionId} ` +
      `(iba en procesadas=${e.procesadas})`,
  );
  e.corriendo = false;
}

async function correr(estado: EstadoTrabajo): Promise<void> {
  const { collectionId, kind } = estado;
  const where = { collectionId, ...pendingFilter(kind) };

  const { runOcr, runFaceIndex, runWatermark } = await import(
    "~/lib/photo-processing"
  );
  const { runVideoWatermark } = await import("~/lib/video-processing");

  estado.pendientes = await db.photo.count({ where });

  const anotar = (photoId: string, motivo: string) => {
    estado.fallidas++;
    if (estado.errores.length < 5) estado.errores.push(`${photoId.slice(-6)}: ${motivo}`);
  };

  console.log(
    `[reprocess:${kind}] ARRANCANDO ${collectionId} — pendientes iniciales=${estado.pendientes}`,
  );

  // Cursor sobre `order`, más un registro de lo ya intentado.
  //
  // El cursor solo no alcanza: `order` NO es único —la lambda lo calcula con un
  // count() que bajo concurrencia repite valores— así que avanzar con `gt`
  // saltearía fotos que comparten número. Se usa `gte` y se descartan en
  // memoria las ya intentadas: así no se saltea ninguna ni se repite ninguna.
  //
  // Hace falta porque hay fotos que nunca salen del filtro: una sin dorsal
  // visible sigue con bibNumber null por más veces que se la procese, y una que
  // falla sigue pendiente. Sin esto el lote traería las mismas para siempre.
  let desdeOrden = 0;
  const yaIntentadas = new Set<string>();

  for (;;) {
    if (!estado.corriendo) {
      console.log(
        `[reprocess:${kind}] cortado por pedido (procesadas=${estado.procesadas})`,
      );
      break;
    }

    const crudo = await db.photo.findMany({
      where: { ...where, order: { gte: desdeOrden } },
      select: { id: true, mimeType: true, filename: true, order: true, storageKey: true, previewKey: true },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      take: LOTE,
    });

    if (crudo.length === 0) {
      console.log(`[reprocess:${kind}] sin más fotos desde order=${desdeOrden}`);
      break;
    }

    const lote = crudo.filter((p) => !yaIntentadas.has(p.id));
    if (lote.length === 0) {
      // Todo el lote ya se intentó: hay que correr el cursor o giramos en vano.
      desdeOrden = (crudo[crudo.length - 1]?.order ?? desdeOrden) + 1;
      console.log(`[reprocess:${kind}] lote ya visto, cursor → ${desdeOrden}`);
      continue;
    }

    console.log(
      `[reprocess:${kind}] lote de ${lote.length} desde order=${desdeOrden}`,
    );

    // El watermark quedó siendo el más pesado en red, no en CPU: es la única
    // etapa que todavía baja el original al servidor (sharp necesita los bytes),
    // mientras que OCR e indexado ahora los lee AWS de S3. El encode son ~150 ms
    // contra segundos de descarga, así que conviene más paralelismo, no menos.
    const concurrency = kind === "watermark" ? 6 : 3;
    let next = 0;

    const worker = async () => {
      while (next < lote.length && estado.corriendo) {
        const photo = lote[next++]!;
        // Se marca antes de procesar: si falla, no se reintenta en esta corrida
        // — sería volver a pagar el mismo error.
        yaIntentadas.add(photo.id);
        if (photo.order > desdeOrden) desdeOrden = photo.order;

        const isVideo =
          isVideoMimeType(photo.mimeType) ||
          /\.(mp4|mov|webm|mkv|m4v)$/i.test(photo.filename);

        try {
          if (kind === "watermark") {
            // runWatermark no lanza cuando no puede: devuelve previewKey null.
            const { previewKey } = isVideo
              ? await runVideoWatermark(photo.id)
              : await runWatermark(photo.id, { foto: photo });
            if (!previewKey) {
              anotar(photo.id, "no se pudo generar el preview (ver logs)");
              continue;
            }
          } else if (isVideo) {
            // Los videos no van a Rekognition: no hay nada que reconocer y se
            // pagaría igual.
            continue;
          } else {
            // Sin precargar bytes: runOcr y runFaceIndex le pasan a Rekognition
            // la referencia en S3 y AWS lee el archivo por su cuenta. Bajarlo
            // acá para volver a subirlo eran dos transferencias de ~4,4 MB por
            // foto. Sólo se descarga si la foto quedó en Supabase, y de eso se
            // encargan ellas mismas.
            if (kind === "ocr" || kind === "ocr-retry") await runOcr(photo.id);
            else await runFaceIndex(photo.id, collectionId);
          }
          estado.procesadas++;
        } catch (err) {
          anotar(photo.id, mensajeDeError(err));
          console.error(`[reprocess:${kind}] photoId=${photo.id} falló:`, err);
        } finally {
          estado.actualizado = Date.now();
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, lote.length) }, worker),
    );

    // Si los workers salieron sin agotar el lote, alguien apagó `corriendo` en
    // el medio. Dejarlo visible: antes esto terminaba en silencio.
    if (next < lote.length) {
      console.warn(
        `[reprocess:${kind}] los workers pararon en ${next}/${lote.length} ` +
          `(corriendo=${estado.corriendo})`,
      );
    }

    estado.pendientes = await db.photo.count({ where });
    estado.actualizado = Date.now();
    console.log(
      `[reprocess:${kind}] ${collectionId} procesadas=${estado.procesadas} ` +
        `fallidas=${estado.fallidas} pendientes=${estado.pendientes}`,
    );
  }

  estado.corriendo = false;
  estado.actualizado = Date.now();
  console.log(
    `[reprocess:${kind}] ${collectionId} TERMINADO — procesadas=${estado.procesadas} ` +
      `fallidas=${estado.fallidas} pendientes=${estado.pendientes}`,
  );
}
