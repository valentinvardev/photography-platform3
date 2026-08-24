"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

type Kind = "ocr" | "faces" | "watermark";
type Estado = "idle" | "confirmando" | "corriendo" | "listo" | "error";

/** Costo por imagen en Rekognition (primer millón/mes). */
const USD_POR_IMAGEN = 0.001;

const ACCIONES: {
  kind: Kind;
  titulo: string;
  descripcion: string;
  /** Si le cuesta plata al usuario, se pide confirmación con el costo estimado. */
  facturado: boolean;
}[] = [
  {
    kind: "watermark",
    titulo: "Regenerar marca de agua",
    descripcion: "Fotos que quedaron sin preview con marca de agua.",
    facturado: false,
  },
  {
    kind: "ocr",
    titulo: "Reconocer dorsales",
    descripcion: "Sólo fotos donde el OCR nunca se ejecutó.",
    facturado: true,
  },
  {
    kind: "faces",
    titulo: "Indexar rostros",
    descripcion: "Sólo fotos sin ningún rostro indexado.",
    facturado: true,
  },
];

function Fila({
  collectionId,
  accion,
  pendientes,
  onTerminar,
}: {
  collectionId: string;
  accion: (typeof ACCIONES)[number];
  pendientes: number;
  onTerminar: () => void;
}) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [hechas, setHechas] = useState(0);
  const [fallidas, setFallidas] = useState(0);
  const [restantes, setRestantes] = useState(pendientes);

  const correr = async () => {
    setEstado("corriendo");
    setHechas(0);
    setFallidas(0);

    let acumuladas = 0;
    let acumFallidas = 0;

    // El servidor procesa un lote por request y devuelve cuánto falta.
    // Se repite hasta vaciar la cola, mostrando avance en cada vuelta.
    try {
      for (;;) {
        const res = await fetch("/api/reprocess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionId, kind: accion.kind }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = (await res.json()) as {
          processed: number;
          pending: number;
          failed: number;
        };

        acumuladas += data.processed;
        acumFallidas += data.failed;
        setHechas(acumuladas);
        setFallidas(acumFallidas);
        setRestantes(data.pending);

        // Nada procesado y todavía queda cola = no avanza. Cortamos para no
        // quedar en un loop infinito golpeando el servidor.
        if (data.pending === 0 || data.processed === 0) break;
      }
      setEstado("listo");
      onTerminar();
    } catch (err) {
      console.error("[reprocess]", err);
      setEstado("error");
    }
  };

  const nada = pendientes === 0 && estado === "idle";

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-[color:var(--color-grey-300)] last:border-b-0">
      <div className="min-w-0">
        <p className="font-sans font-bold text-[12px] uppercase tracking-[0.12em] text-[color:var(--color-ink)]">
          {accion.titulo}
        </p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-grey-500)]">
          {accion.descripcion}
        </p>

        {estado === "corriendo" && (
          <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-[color:var(--color-ink)]">
            {hechas} procesadas · {restantes} pendientes
            {fallidas > 0 && ` · ${fallidas} con error`}
          </p>
        )}
        {estado === "listo" && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#16a34a]">
            ✓ {hechas} procesadas
            {fallidas > 0 && ` · ${fallidas} con error`}
            {restantes > 0 && ` · ${restantes} no se pudieron`}
          </p>
        )}
        {estado === "error" && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-safelight)]">
            Falló · {hechas} alcanzaron a procesarse
          </p>
        )}
        {estado === "confirmando" && (
          <p className="mt-2 font-sans text-[12px] leading-[1.5] text-[color:var(--color-ink)]">
            Son {pendientes.toLocaleString("es-AR")} llamadas a Rekognition,
            aproximadamente{" "}
            <strong>USD {(pendientes * USD_POR_IMAGEN).toFixed(2)}</strong>. No
            se puede deshacer.
          </p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {nada ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-grey-400)]">
            nada pendiente
          </span>
        ) : estado === "corriendo" ? (
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-grey-500)]">
            <span className="w-3 h-3 border border-[color:var(--color-grey-300)] border-t-[color:var(--color-ink)] rounded-full animate-spin" />
            procesando
          </span>
        ) : estado === "confirmando" ? (
          <>
            <button
              onClick={() => setEstado("idle")}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-grey-500)] px-3 py-2 hover:text-[color:var(--color-ink)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => void correr()}
              className="font-mono text-[10px] uppercase tracking-[0.14em] border border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-paper)] px-4 py-2 hover:opacity-80 transition-opacity"
            >
              Sí, procesar
            </button>
          </>
        ) : (
          <button
            onClick={() => (accion.facturado ? setEstado("confirmando") : void correr())}
            className="font-mono text-[10px] uppercase tracking-[0.14em] border border-[color:var(--color-grey-300)] px-4 py-2 hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] text-[color:var(--color-grey-700)] transition-colors whitespace-nowrap"
          >
            {pendientes.toLocaleString("es-AR")} pendiente{pendientes !== 1 ? "s" : ""}
          </button>
        )}
      </div>
    </div>
  );
}

export function ReprocessPanel({ collectionId }: { collectionId: string }) {
  const { data, refetch } = api.photo.pendingWork.useQuery(
    { collectionId },
    { refetchOnWindowFocus: false },
  );

  if (!data) {
    return (
      <div className="h-24 animate-pulse bg-[color:var(--color-grey-300)]/40" />
    );
  }

  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-1">
        Reprocesar pendientes
      </p>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-grey-400)] mb-3">
        {data.total.toLocaleString("es-AR")} fotos en la colección · sólo se
        procesa lo que falta
      </p>
      <div>
        {ACCIONES.map((a) => (
          <Fila
            key={a.kind}
            collectionId={collectionId}
            accion={a}
            pendientes={data[a.kind]}
            onTerminar={() => void refetch()}
          />
        ))}
      </div>
    </div>
  );
}
