"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

type Photo = { id: string; filename: string; url: string; mimeType?: string | null };

type Props = {
  photos: Photo[];
  buyerName: string | null;
  collectionTitle: string;
  bibNumber: string | null;
};

type Phase = "hero" | "saving" | "done";

function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!("share" in navigator) || !("canShare" in navigator)) return false;
  try {
    const f = new File([""], "t.jpg", { type: "image/jpeg" });
    return (navigator as Navigator & { canShare: (d: ShareData) => boolean }).canShare({ files: [f] });
  } catch {
    return false;
  }
}

export function IosDelivery({ photos, buyerName, collectionTitle, bibNumber }: Props) {
  const [phase, setPhase] = useState<Phase>("hero");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [useLongPress, setUseLongPress] = useState(false);

  const currentPhoto = photos[currentIdx];
  const isLast = currentIdx === photos.length - 1;

  const advance = () => {
    if (isLast) {
      setPhase("done");
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  const handleSave = async () => {
    if (!currentPhoto || isLoading) return;

    if (!canShareFiles()) {
      setUseLongPress(true);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(currentPhoto.url);
      const blob = await res.blob();
      const mimeType = blob.type || (currentPhoto.mimeType ?? "image/jpeg");
      const file = new File([blob], currentPhoto.filename, { type: mimeType });
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ files: [file] });

      setSavedCount((c) => c + 1);
      setJustSaved(true);
      setTimeout(() => {
        setJustSaved(false);
        advance();
      }, 1200);
    } catch {
      // AbortError: user cancelled — just reset silently
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    advance();
  };

  // ── Hero ────────────────────────────────────────────────────
  if (phase === "hero") {
    return (
      <main className="min-h-screen bg-[color:var(--color-paper)] text-[color:var(--color-ink)] flex flex-col">
        <div className="px-6 h-16 flex items-center">
          <span className="font-display font-black italic text-[20px] text-[#FFE600]">SINCHI®</span>
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#FFE600] mb-5">
              {collectionTitle}
            </p>
            <h1
              className="font-display font-black italic leading-[0.9] tracking-[-0.02em]"
              style={{ fontSize: "clamp(48px, 14vw, 72px)" }}
            >
              Gracias<br />por tu<br />compra.
            </h1>

            {buyerName && buyerName !== "public@system" && (
              <p className="mt-5 font-sans text-[17px] text-[color:var(--color-ink)]/50">
                {buyerName}
              </p>
            )}

            <div className="mt-8 flex items-center gap-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-ink)]/40 mb-1">
                  Fotos
                </p>
                <p className="font-display italic text-[30px] leading-tight">
                  {photos.length}
                </p>
              </div>
              {bibNumber && (
                <>
                  <div className="w-px h-10 bg-[color:var(--color-ink)]/15" />
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-ink)]/40 mb-1">
                      Dorsal
                    </p>
                    <p className="font-display italic text-[30px] leading-tight">
                      #{bibNumber}
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mt-12"
          >
            <button
              onClick={() => setPhase("saving")}
              className="w-full flex items-center justify-between px-6 py-5 bg-[#FFE600] text-[#0A0A0A] active:opacity-85 transition-opacity"
            >
              <span className="font-display font-black italic text-[22px]">
                Descargar todo
              </span>
              <span className="font-mono text-[20px]">↓</span>
            </button>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ink)]/35 text-center">
              Te guiamos foto por foto
            </p>
          </motion.div>
        </div>
      </main>
    );
  }

  // ── Done ────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <main className="min-h-screen bg-[color:var(--color-paper)] text-[color:var(--color-ink)] flex flex-col">
        <div className="px-6 h-16 flex items-center">
          <span className="font-display font-black italic text-[20px] text-[#FFE600]">SINCHI®</span>
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 pb-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-20 h-20 rounded-full border-2 border-[#FFE600] flex items-center justify-center mb-8"
          >
            <svg
              className="w-10 h-10 text-[#FFE600]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
          >
            <h1
              className="font-display font-black italic leading-[0.9] tracking-[-0.02em] mb-5"
              style={{ fontSize: "clamp(52px, 15vw, 80px)" }}
            >
              ¡Listo!
            </h1>
            <p className="font-sans text-[18px] text-[color:var(--color-ink)]/70 leading-relaxed">
              {savedCount === photos.length
                ? `Tus ${photos.length} fotos están guardadas en tu galería.`
                : `${savedCount} de ${photos.length} fotos guardadas en tu galería.`}
            </p>
            <p className="mt-3 font-sans text-[15px] text-[color:var(--color-ink)]/40">
              Abrí la app Fotos para verlas.
            </p>
          </motion.div>
        </div>
      </main>
    );
  }

  // ── Saving ──────────────────────────────────────────────────
  if (!currentPhoto) return null;

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white flex flex-col overflow-hidden">
      {/* Yellow left accent */}
      <div className="fixed left-0 top-0 bottom-0 w-[3px] bg-[#FFE600] z-10 pointer-events-none" />

      {/* Header */}
      <div className="pl-8 pr-6 h-14 flex items-center justify-between shrink-0">
        <span className="font-display font-black italic text-[18px] text-[#FFE600]">SINCHI®</span>
        <span className="font-mono text-[12px] text-white/40">
          {currentIdx + 1} / {photos.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/10 shrink-0 mx-6 mb-3 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#FFE600] rounded-full"
          animate={{ width: `${(currentIdx / photos.length) * 100}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Photo area */}
      <div className="flex-1 flex items-center justify-center px-6 py-2 relative">
        <AnimatePresence mode="wait">
          <motion.img
            key={currentPhoto.url}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: justSaved ? 0.35 : 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            src={currentPhoto.url}
            alt=""
            className="max-w-full object-contain rounded-sm select-none"
            style={{ maxHeight: "calc(100vh - 290px)" }}
            draggable={false}
          />
        </AnimatePresence>

        {/* Checkmark overlay */}
        <AnimatePresence>
          {justSaved && (
            <motion.div
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 380, damping: 24 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="w-24 h-24 rounded-full bg-[#FFE600] flex items-center justify-center shadow-[0_0_60px_rgba(255,230,0,0.4)]">
                <svg
                  className="w-12 h-12 text-[#0A0A0A]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 px-6 pb-10 pt-3">
        <AnimatePresence mode="wait">
          {justSaved ? (
            <motion.div
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-3 py-6"
            >
              <svg
                className="w-4 h-4 text-[#FFE600]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#FFE600]">
                Guardada · {isLast ? "terminando…" : "siguiente foto…"}
              </span>
            </motion.div>
          ) : useLongPress ? (
            <motion.div
              key="longpress"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="border border-[#FFE600]/30 bg-[#FFE600]/5 px-5 py-4 mb-4">
                <p className="font-sans text-[15px] text-white/80 leading-snug text-center">
                  Mantené el dedo apretado sobre la foto y tocá{" "}
                  <span className="text-[#FFE600] font-medium">&ldquo;Guardar foto&rdquo;</span>
                </p>
              </div>
              <button
                onClick={handleSkip}
                className="w-full flex items-center justify-between px-6 py-4 border border-white/20 text-white/60 active:bg-white/5 transition-colors"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.22em]">Siguiente foto</span>
                <span className="font-mono text-[13px]">→</span>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="normal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <p className="font-sans text-[15px] text-white/45 text-center mb-5 leading-snug">
                Tocá el botón para guardar<br />esta foto en tu galería
              </p>
              <button
                onClick={() => void handleSave()}
                disabled={isLoading}
                className="w-full flex items-center justify-between px-6 py-5 bg-[#FFE600] text-[#0A0A0A] active:opacity-80 transition-opacity disabled:opacity-50"
              >
                <span className="font-display font-black italic text-[20px]">
                  {isLoading ? "Preparando…" : "Guardar esta foto"}
                </span>
                {isLoading ? (
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
                  </svg>
                ) : (
                  <span className="font-mono text-[18px]">↓</span>
                )}
              </button>
              <button
                onClick={handleSkip}
                className="w-full mt-3 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/25 active:text-white/50 transition-colors"
              >
                Saltar esta foto →
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
