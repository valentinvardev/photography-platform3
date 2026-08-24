import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  arrancar,
  detener,
  estadoDe,
  mensajeDeError,
  pendingFilter,
  type ReprocessKind,
} from "~/lib/reprocess-jobs";

/**
 * Arranca y consulta trabajos de reprocesado.
 *
 * El request NUNCA hace el trabajo: lo lanza y contesta al instante. Antes se
 * procesaba acá adentro, y como cada llamada a Rekognition tarda segundos, el
 * proxy cortaba la respuesta y el cliente abortaba — aunque el servidor
 * terminara el lote. Con cientos de fotos pendientes eso avanzaba de a dos por
 * click. La subida siempre anduvo bien justamente porque procesa en segundo
 * plano; acá se hace igual.
 *
 *   POST { collectionId, kind, accion: "arrancar" | "estado" | "detener" }
 */

const KINDS = ["ocr", "ocr-retry", "faces", "watermark"];

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { collectionId, kind, accion } = (await req.json()) as {
      collectionId?: string;
      kind?: ReprocessKind;
      accion?: "arrancar" | "estado" | "detener";
    };

    if (!collectionId || !kind || !KINDS.includes(kind)) {
      return NextResponse.json({ error: "collectionId y kind son requeridos" }, { status: 400 });
    }

    if (accion === "detener") {
      detener(collectionId, kind);
      return NextResponse.json(respuesta(collectionId, kind));
    }

    if (accion === "estado") {
      const actual = estadoDe(collectionId, kind);
      if (actual) return NextResponse.json(respuesta(collectionId, kind));
      // Sin trabajo en curso: al menos decimos cuánto falta.
      const pendientes = await db.photo.count({
        where: { collectionId, ...pendingFilter(kind) },
      });
      return NextResponse.json({
        procesadas: 0,
        fallidas: 0,
        pendientes,
        errores: [],
        corriendo: false,
        error: null,
      });
    }

    const collection = await db.collection.findUnique({
      where: { id: collectionId },
      select: { id: true },
    });
    if (!collection) {
      return NextResponse.json({ error: "Colección no encontrada" }, { status: 404 });
    }

    arrancar(collectionId, kind);
    return NextResponse.json(respuesta(collectionId, kind));
  } catch (err) {
    console.error("[reprocess] error no controlado:", err);
    return NextResponse.json({ error: mensajeDeError(err) }, { status: 500 });
  }
}

function respuesta(collectionId: string, kind: ReprocessKind) {
  const e = estadoDe(collectionId, kind);
  return {
    procesadas: e?.procesadas ?? 0,
    fallidas: e?.fallidas ?? 0,
    pendientes: e?.pendientes ?? 0,
    errores: e?.errores ?? [],
    corriendo: e?.corriendo ?? false,
    error: e?.error ?? null,
  };
}
