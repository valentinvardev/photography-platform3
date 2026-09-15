"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { api } from "~/trpc/react";

/**
 * Etiquetado a mano, una foto por vez.
 *
 * Pensado para las fotos que el OCR no pudo leer: se abre, se escribe el
 * dorsal, Enter guarda y pasa a la siguiente. Las flechas mueven sin guardar.
 * Lo que se escribe queda como borrador por foto, así ir y volver no lo pierde.
 *
 * El guardado es optimista: el número queda puesto al instante y la petición
 * viaja por detrás; si falla, la foto se marca en rojo y Enter la reintenta.
 * Al cerrar se refresca la galería una sola vez, no por cada foto.
 */

type Foto = { id: string; filename: string; bibNumber: string | null; url: string | null };
type EstadoGuardado = "guardando" | "ok" | "error";

export function TagModal({ collectionId, onClose }: { collectionId: string; onClose: () => void }) {
  const [soloSinDorsal, setSoloSinDorsal] = useState(true);
  const { data, isLoading, error } = api.photo.listForTagging.useQuery(
    { collectionId, soloSinDorsal },
    { refetchOnWindowFocus: false, staleTime: Infinity },
  );
  const fotos: Foto[] = useMemo(() => data ?? [], [data]);

  const [idx, setIdx] = useState(0);
  const [borradores, setBorradores] = useState<Map<string, string>>(() => new Map());
  const [guardados, setGuardados] = useState<Map<string, string | null>>(() => new Map());
  const [estados, setEstados] = useState<Map<string, EstadoGuardado>>(() => new Map());
  const [zoom, setZoom] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const puntoZoom = useRef<{ x: number; y: number } | null>(null);

  const setBib = api.photo.setBibNumber.useMutation();

  const total = fotos.length;
  const foto = fotos[idx] ?? null;
  const valorGuardado = foto
    ? (guardados.has(foto.id) ? guardados.get(foto.id) : foto.bibNumber) ?? null
    : null;
  const borrador = foto ? (borradores.get(foto.id) ?? valorGuardado ?? "") : "";
  const estado = foto ? estados.get(foto.id) : undefined;
  const etiquetadas = [...guardados.entries()].filter(
    ([id, v]) => v !== null && estados.get(id) !== "error",
  ).length;

  // Al cambiar la lista (toggle sólo sin dorsal / todas) se vuelve al principio.
  useEffect(() => {
    setIdx(0);
    setZoom(false);
  }, [soloSinDorsal]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [idx, foto?.id]);

  // Las siguientes ya vienen bajando mientras se escribe la actual.
  useEffect(() => {
    for (const f of fotos.slice(idx + 1, idx + 4)) {
      if (f.url) {
        const im = new Image();
        im.src = f.url;
      }
    }
  }, [idx, fotos]);

  const ir = useCallback(
    (delta: number) => {
      setIdx((i) => Math.min(Math.max(total - 1, 0), Math.max(0, i + delta)));
      setZoom(false);
    },
    [total],
  );

  const guardarYSeguir = useCallback(() => {
    if (!foto) return;
    const valor = borrador.trim().replace(/\s+/g, "");
    const actual = valorGuardado ?? "";
    if (valor !== actual) {
      const nuevo = valor || null;
      const id = foto.id;
      setGuardados((prev) => new Map(prev).set(id, nuevo));
      setEstados((prev) => new Map(prev).set(id, "guardando"));
      setBib.mutate(
        { id, bibNumber: nuevo },
        {
          onSuccess: () => setEstados((prev) => new Map(prev).set(id, "ok")),
          onError: () => {
            setGuardados((prev) => {
              const m = new Map(prev);
              m.delete(id);
              return m;
            });
            setEstados((prev) => new Map(prev).set(id, "error"));
            // El borrador se conserva para que Enter lo reintente tal cual.
            setBorradores((prev) => new Map(prev).set(id, valor));
          },
        },
      );
    }
    setBorradores((prev) => {
      const m = new Map(prev);
      m.delete(foto.id);
      return m;
    });
    if (idx < total - 1) ir(1);
  }, [foto, borrador, valorGuardado, idx, total, ir, setBib]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        guardarYSeguir();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        ir(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        ir(1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, guardarYSeguir, ir]);

  // Zoom al tamaño real, centrado donde se hizo clic: una placa de 40 px no se
  // lee con la foto entera en pantalla.
  const alternarZoom = (e: MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    puntoZoom.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    setZoom((z) => !z);
  };
  useEffect(() => {
    if (!zoom || !marcoRef.current || !imgRef.current || !puntoZoom.current) return;
    const marco = marcoRef.current;
    const img = imgRef.current;
    const { x, y } = puntoZoom.current;
    marco.scrollLeft = x * img.naturalWidth - marco.clientWidth / 2;
    marco.scrollTop = y * img.naturalHeight - marco.clientHeight / 2;
  }, [zoom]);

  const chip = (texto: string, color: string) => (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color }}>
      {texto}
    </span>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "rgba(0,0,0,0.96)" }}>
      {/* Cabecera */}
      <div
        className="flex items-center justify-between gap-4 px-5 py-3 flex-shrink-0 flex-wrap"
        style={{ background: "rgba(0,0,0,0.6)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/80">
            Etiquetar a mano
            {total > 0 && (
              <span className="text-white/40">
                {" "}· {idx + 1} / {total}
              </span>
            )}
          </p>
          <p className="font-mono text-[10px] text-white/50 truncate mt-0.5">{foto?.filename ?? ""}</p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setSoloSinDorsal((v) => !v)}
            className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/60 border border-white/20 px-3 py-1.5 hover:border-white hover:text-white transition-colors"
          >
            {soloSinDorsal ? "Sólo sin dorsal" : "Todas"}
          </button>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
            {etiquetadas} etiquetada{etiquetadas !== 1 ? "s" : ""} en esta sesión
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[16px] text-white/50 hover:text-white transition-colors px-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      </div>

      {/* Foto */}
      <div
        ref={marcoRef}
        className={`flex-1 min-h-0 relative ${zoom ? "overflow-auto" : "overflow-hidden flex items-center justify-center"}`}
      >
        {isLoading && (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Cargando fotos…</p>
        )}
        {error && (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f87171]">
            No se pudo cargar la lista: {error.message}
          </p>
        )}
        {!isLoading && !error && total === 0 && (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            {soloSinDorsal ? "No quedan fotos sin dorsal" : "No hay fotos"}
          </p>
        )}
        {foto?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            key={foto.id}
            src={foto.url}
            alt={foto.filename}
            draggable={false}
            onClick={alternarZoom}
            className={zoom ? "cursor-zoom-out" : "cursor-zoom-in max-w-full max-h-full object-contain"}
            style={zoom ? { maxWidth: "none", maxHeight: "none" } : undefined}
          />
        )}
        {total > 1 && !zoom && (
          <>
            <button
              onClick={() => ir(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[20px] text-white/40 hover:text-white transition-colors px-2 py-4"
              aria-label="Anterior"
            >
              ←
            </button>
            <button
              onClick={() => ir(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[20px] text-white/40 hover:text-white transition-colors px-2 py-4"
              aria-label="Siguiente"
            >
              →
            </button>
          </>
        )}
      </div>

      {/* Dorsal */}
      <div
        className="flex items-center justify-center gap-5 px-5 py-4 flex-shrink-0 flex-wrap"
        style={{ background: "rgba(0,0,0,0.7)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">Dorsal</label>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={borrador}
          disabled={!foto}
          onChange={(e) => {
            if (!foto) return;
            const v = e.target.value;
            setBorradores((prev) => new Map(prev).set(foto.id, v));
          }}
          placeholder="—"
          className="w-40 text-center font-mono text-[28px] leading-none px-3 py-2 bg-[#FFE600] text-[#0D0D0D] placeholder:text-[#0D0D0D]/30 border-2 border-[#FFE600] focus:outline-none focus:border-white transition-colors disabled:opacity-30"
        />
        <div className="min-w-[160px]">
          {estado === "guardando" && chip("guardando…", "rgba(255,255,255,0.5)")}
          {estado === "ok" && chip(`✓ guardado${valorGuardado ? ` #${valorGuardado}` : " (sin dorsal)"}`, "#4ade80")}
          {estado === "error" && chip("✗ no se guardó · Enter reintenta", "#f87171")}
          {!estado && valorGuardado && chip(`actual #${valorGuardado.split(",").join(" · #")}`, "#fbbf24")}
          {!estado && !valorGuardado && foto && chip("sin dorsal", "rgba(255,255,255,0.35)")}
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30 w-full text-center mt-1">
          Enter guarda y pasa a la siguiente · ← → mover · clic en la foto amplía · Esc cierra
        </p>
      </div>
    </div>
  );
}
