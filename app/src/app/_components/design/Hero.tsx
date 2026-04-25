"use client";

import { motion } from "motion/react";

export function Hero({ collectionsCount }: { collectionsCount: number }) {
  const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

  return (
    <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden bg-[#0D0D0D]">
      {/* Background image — full bleed */}
      <div className="absolute inset-0">
        <img
          src="/hero.jpg"
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: "40% 50%" }}
        />
        {/* Layered overlays — heavy left, fade up from bottom */}
        {/* Left — heavy, for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D0D]/95 via-[#0D0D0D]/55 to-transparent" style={{ width: "72%" }} />
        {/* Top edge — for nav */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#0D0D0D]/70 to-transparent" />
        {/* Bottom edge — full width */}
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#0D0D0D]/90 to-transparent" />
        {/* Top-right corner vignette */}
        <div className="absolute top-0 right-0 w-2/5 h-2/5" style={{ background: "radial-gradient(ellipse at top right, rgba(13,13,13,0.75) 0%, transparent 70%)" }} />
        {/* Bottom-right corner vignette */}
        <div className="absolute bottom-0 right-0 w-2/5 h-2/5" style={{ background: "radial-gradient(ellipse at bottom right, rgba(13,13,13,0.80) 0%, transparent 70%)" }} />
      </div>

      {/* Yellow left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FFE000]" />

      {/* Top-right — discipline tags */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease, delay: 0.6 }}
        className="absolute top-24 right-8 md:right-14 flex flex-col items-end gap-2 hidden md:flex"
      >
        {["MTB", "Trail", "Ruta"].map((d, i) => (
          <span
            key={d}
            className="font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/30"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            {d}
          </span>
        ))}
      </motion.div>

      {/* Main content — bottom-left anchored */}
      <div className="relative z-10 h-full flex flex-col justify-end pb-14 md:pb-24 px-8 md:px-14">

        {/* Label strip */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease, delay: 0.1 }}
          className="flex items-center gap-4 mb-10"
        >
          <span className="block w-8 h-[2px] bg-[#FFE000]" />
          <span className="font-sans font-bold uppercase tracking-[0.28em] text-[#FFE000] text-[10px]">
            Rikuq Sinchi · Fotografía Deportiva
          </span>
        </motion.div>

        {/* Headline */}
        <div className="overflow-hidden">
          <motion.h1
            className="font-display font-extrabold italic leading-[0.82] tracking-[-0.02em]"
            style={{ fontSize: "clamp(64px, 13vw, 200px)" }}
          >
            <motion.span
              initial={{ y: "110%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.75, ease, delay: 0.2 }}
              className="block text-white"
            >
              MIRADA
            </motion.span>
            <motion.span
              initial={{ y: "110%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.75, ease, delay: 0.32 }}
              className="block text-[#FFE000]"
            >
              PODEROSA.
            </motion.span>
          </motion.h1>
        </div>

        {/* Bottom row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.6 }}
          className="mt-12 flex flex-col md:flex-row md:items-end gap-8 md:gap-20"
        >
          {/* Description + CTA */}
          <div className="max-w-sm">
            <p className="font-sans text-[14px] leading-[1.75] text-white/55">
              El que observa con fuerza. Encontrá tus fotos
              por número de dorsal o reconocimiento facial.
            </p>
            <a
              href="#eventos"
              className="mt-6 inline-flex items-center gap-3 bg-[#FFE000] text-[#1A1A1A] px-7 py-3.5 font-sans font-black uppercase tracking-[0.18em] text-[11px] hover:bg-[#D4BB00] transition-colors duration-200"
            >
              Ver eventos ↗
            </a>
          </div>

          {/* Stats — pushed right on desktop */}
          <div className="flex items-end gap-10 md:ml-auto">
            <div className="text-left">
              <span className="block font-display font-extrabold italic leading-none text-white"
                    style={{ fontSize: "clamp(40px, 5vw, 64px)" }}>
                {String(collectionsCount).padStart(2, "0")}
              </span>
              <span className="block mt-1.5 font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/35">
                Eventos activos
              </span>
            </div>
            <div className="text-left border-l border-white/10 pl-10">
              <span className="block font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/35 mb-1.5">
                Buscá por
              </span>
              <span className="block font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-[#FFE000]/70">
                Dorsal · Cara
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease, delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
      >
        <span className="font-sans font-bold uppercase tracking-[0.22em] text-[9px] text-white/30">
          Deslizá
        </span>
        <div className="w-[1px] h-10 bg-white/20 relative overflow-hidden">
          <motion.div
            className="absolute inset-x-0 top-0 h-full bg-[#FFE000]"
            animate={{ y: ["0%", "100%"] }}
            transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.6 }}
          />
        </div>
      </motion.div>
    </section>
  );
}
