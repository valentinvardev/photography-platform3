"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "~/trpc/react";

type Props = {
  purchaseId: string;
  buyerEmail: string;
  onClose: () => void;
};

export function SalePhotosModal({ purchaseId, buyerEmail, onClose }: Props) {
  const { data: photos, isLoading } = api.purchase.adminGetPhotos.useQuery({ purchaseId });
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const close = useCallback(() => {
    if (lightboxIdx !== null) setLightboxIdx(null);
    else onClose();
  }, [lightboxIdx, onClose]);

  const next = useCallback(() => {
    if (!photos || lightboxIdx === null) return;
    setLightboxIdx((lightboxIdx + 1) % photos.length);
  }, [photos, lightboxIdx]);

  const prev = useCallback(() => {
    if (!photos || lightboxIdx === null) return;
    setLightboxIdx((lightboxIdx - 1 + photos.length) % photos.length);
  }, [photos, lightboxIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handler);
    };
  }, [close, next, prev]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink)]/85 backdrop-blur-sm flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            Fotos vendidas
          </p>
          <p className="font-mono text-[12px] text-white mt-0.5">
            {buyerEmail}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors"
          aria-label="Cerrar"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <p className="text-center font-mono text-[11px] uppercase tracking-[0.22em] text-white/40 py-20">
            Cargando…
          </p>
        )}
        {!isLoading && (!photos || photos.length === 0) && (
          <p className="text-center font-mono text-[11px] uppercase tracking-[0.22em] text-white/40 py-20">
            Sin fotos
          </p>
        )}
        {photos && photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-w-[1400px] mx-auto">
            {photos.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setLightboxIdx(idx)}
                className="relative aspect-[3/2] overflow-hidden bg-white/5 group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.filename}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {photos && lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxIdx(null); }}
        >
          <button
            onClick={() => setLightboxIdx(null)}
            className="absolute top-5 right-5 text-white/70 hover:text-white p-2"
            aria-label="Cerrar"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3"
            aria-label="Anterior"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M15 18L9 12l6-6" />
            </svg>
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3"
            aria-label="Siguiente"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightboxIdx]!.url}
            alt={photos[lightboxIdx]!.filename}
            className="max-w-[92vw] max-h-[88vh] object-contain"
          />
          <p className="absolute bottom-5 left-0 right-0 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
            {lightboxIdx + 1} / {photos.length}
          </p>
        </div>
      )}
    </div>
  );
}
