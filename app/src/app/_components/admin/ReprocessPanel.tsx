"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

type Kind = "ocr" | "ocr-retry" | "faces" | "watermark";
type Estado = "idle" | "confirmando" | "corriendo" | "listo" | "error";

const ACCIONES: {
  kind: Kind;
  titulo: string;
  descripcion: string;
  /** Si dispara trabajo que no se puede deshacer, se pide confirmación. */
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
    kind: "ocr-retry",
    titulo: "Reintentar dorsales no detectados",
    descripcion:
      "Vuelve a pasar por las fotos que quedaron sin dorsal, aunque ya se hayan intentado.",
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
  bloqueado,
  onArrancar,
  onTerminar,
}: {
  collectionId: string;
  accion: (typeof ACCIONES)[number];
  pendientes: number;
  /** Otra acción está corriendo. Ver `corriendo` en ReprocessPanel. */
  bloqueado: boolean;
  onArrancar: () => void;
  onTerminar: () => void;
}) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [hechas, setHechas] = useState(0);
  const [fallidas, setFallidas] = useState(0);
  const [restantes, setRestantes] = useState(pendientes);
  const [motivo, setMotivo] = useState<string | null>(null);

  type Respuesta = {
    procesadas: number;
    fallidas: number;
    pendientes: number;
    errores: string[];
    corriendo: boolean;
    error: string | null;
  };

  const pedir = async (que: "arrancar" | "estado" | "detener"): Promise<Respuesta> => {
    const res = await fetch("/api/reprocess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId, kind: accion.kind, accion: que }),
    });
    const data = (await res.json().catch(() => null)) as
      | (Partial<Respuesta> & { error?: string })
      | null;
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    if (!data) throw new Error("respuesta ilegible del servidor");
    return {
      procesadas: data.procesadas ?? 0,
      fallidas: data.fallidas ?? 0,
      pendientes: data.pendientes ?? 0,
      errores: data.errores ?? [],
      corriendo: data.corriendo ?? false,
      error: data.error ?? null,
    };
  };

  const correr = async () => {
    onArrancar();
    setEstado("corriendo");
    setHechas(0);
    setFallidas(0);
    setMotivo(null);

    // El request sólo lanza el trabajo y vuelve enseguida. Después se pregunta
    // cómo va: así ninguna llamada queda abierta el tiempo suficiente como para
    // que la corte el proxy, que es lo que rompía todo antes.
    const aplicar = (r: Respuesta) => {
      setHechas(r.procesadas);
      setFallidas(r.fallidas);
      setRestantes(r.pendientes);
      if (r.errores.length) setMotivo(r.errores[0]!);
      else if (r.error) setMotivo(r.error);
    };

    try {
      aplicar(await pedir("arrancar"));

      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await pedir("estado");
        aplicar(r);
        if (!r.corriendo) {
          if (r.error) throw new Error(r.error);
          break;
        }
      }
      setEstado("listo");
      onTerminar();
    } catch (err) {
      console.error("[reprocess]", err);
      setMotivo(err instanceof Error ? err.message : String(err));
      setEstado("error");
      onTerminar();
    }
  };

  /** El polling de `correr` ve `corriendo: false` en la vuelta siguiente y cierra solo. */
  const detenerTrabajo = async () => {
    try {
      await pedir("detener");
    } catch (err) {
      console.error("[reprocess] detener", err);
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
          <>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-safelight)]">
              Falló · {hechas} alcanzaron a procesarse
            </p>
            {motivo && (
              <p className="mt-1 font-mono text-[10px] leading-[1.5] text-[color:var(--color-grey-600)] break-words max-w-[520px]">
                {motivo}
              </p>
            )}
          </>
        )}
        {estado === "listo" && motivo && (
          <p className="mt-1 font-mono text-[10px] leading-[1.5] text-[color:var(--color-grey-600)] break-words max-w-[520px]">
            {motivo}
          </p>
        )}
        {estado === "confirmando" && (
          <p className="mt-2 font-sans text-[12px] leading-[1.5] text-[color:var(--color-ink)]">
            Se van a procesar {pendientes.toLocaleString("es-AR")} fotos. No se
            puede deshacer.
          </p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {nada ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-grey-400)]">
            nada pendiente
          </span>
        ) : estado === "corriendo" ? (
          <>
            <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-grey-500)]">
              <span className="w-3 h-3 border border-[color:var(--color-grey-300)] border-t-[color:var(--color-ink)] rounded-full animate-spin" />
              procesando
            </span>
            <button
              onClick={() => void detenerTrabajo()}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-grey-500)] border border-[color:var(--color-grey-300)] px-3 py-2 hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] transition-colors"
            >
              Detener
            </button>
          </>
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
            disabled={bloqueado}
            title={bloqueado ? "Esperá a que termine la acción en curso" : undefined}
            className="font-mono text-[10px] uppercase tracking-[0.14em] border border-[color:var(--color-grey-300)] px-4 py-2 hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] text-[color:var(--color-grey-700)] transition-colors whitespace-nowrap disabled:opacity-30 disabled:pointer-events-none"
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

  // Una acción por vez. Corriendo las tres a la vez son nueve descargas y nueve
  // llamadas a AWS peleando por el mismo enlace: cada request tarda el triple y
  // termina cortado por el proxy aunque el trabajo se haya hecho.
  const [corriendo, setCorriendo] = useState<Kind | null>(null);

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
            bloqueado={corriendo !== null && corriendo !== a.kind}
            onArrancar={() => setCorriendo(a.kind)}
            onTerminar={() => {
              setCorriendo(null);
              void refetch();
            }}
          />
        ))}
      </div>
    </div>
  );
}
