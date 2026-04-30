"use client";

import { useState } from "react";
import { motion } from "motion/react";

const DESCRIPTION = "Nuestra identidad evoluciona de Rikuq Sinchi a SINCHI® como un proceso de síntesis necesario para reflejar el dinamismo del deporte actual. Si bien conservamos la raíz quichua que nos define como 'mirada poderosa' o el que observa con fuerza, simplificamos el nombre para potenciar su impacto visual y recordación. SINCHI representa hoy una marca más rotunda, enfocada en la excelencia técnica y en la captura del detalle extremo en deportes outdoor.";

export function Hero({ collectionsCount }: { collectionsCount: number }) {
  const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden bg-[#0D0D0D]">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="/hero.jpg"
          alt=""
          className="w-full h-full object-cover object-[calc(70%+3rem)_calc(70%+3rem)] md:object-[40%_50%] scale-125 md:scale-100 origin-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D0D]/95 via-[#0D0D0D]/55 to-transparent" style={{ width: "72%" }} />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#0D0D0D]/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#0D0D0D]/90 to-transparent" />
        <div className="absolute top-0 right-0 w-2/5 h-2/5" style={{ background: "radial-gradient(ellipse at top right, rgba(13,13,13,0.75) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 w-2/5 h-2/5" style={{ background: "radial-gradient(ellipse at bottom right, rgba(13,13,13,0.80) 0%, transparent 70%)" }} />
      </div>

      {/* Yellow left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FFE000]" />

      {/* Main content — single top-to-bottom column, no internal scroll */}
      <div className="relative z-10 h-full flex flex-col overflow-hidden px-8 md:px-14 pt-16 md:pt-20 pb-12">

        {/* Logo — cropped PNG, no margin hacks needed */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.05 }}
          className="shrink-0"
        >
          <img
            src="/sinchi-logo.png"
            alt="SINCHI®"
            className="w-[340px] md:w-[480px] lg:w-[600px] h-auto"
          />
        </motion.div>

        {/* Headline — right below logo */}
        <div className="overflow-hidden mt-2 shrink-0">
          <motion.h1
            className="font-display font-extrabold italic leading-[0.85] tracking-[-0.02em]"
            style={{ fontSize: "clamp(36px, 6vw, 96px)" }}
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

        {/* Slogan — right below headline */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.5 }}
          className="mt-2 shrink-0 font-display italic text-white/60"
          style={{ fontSize: "clamp(15px, 1.6vw, 22px)" }}
        >
          Donde tu esfuerzo se vuelve imagen.
        </motion.p>

        {/* Description — right below slogan */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.6 }}
          className="mt-4 max-w-md shrink-0"
        >
          <div className="relative md:bg-transparent rounded-sm">
            {/* Mobile legibility backdrop */}
            <div className="absolute -inset-x-3 -inset-y-2 md:hidden rounded-sm bg-[#0D0D0D]/50 blur-md" />
            <p className={`relative font-sans text-[14px] leading-[1.7] text-white/80 md:text-white/60 ${expanded ? "" : "line-clamp-2"}`}>
              {DESCRIPTION}
            </p>
            {!expanded && (
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0D0D0D]/40 via-[#0D0D0D]/15 to-transparent pointer-events-none" />
            )}
          </div>
        </motion.div>

        {/* Leer más — pegado justo debajo de la descripción */}
        {!expanded && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            onClick={() => setExpanded(true)}
            className="mt-2 shrink-0 self-start font-sans font-black text-[13px] text-[#FFE000] underline underline-offset-4 hover:no-underline transition-all"
          >
            Leer más →
          </motion.button>
        )}

        {/* Ver eventos — con buena distancia debajo */}
        <motion.a
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.75 }}
          href="#eventos"
          className="mt-10 shrink-0 self-start inline-flex items-center gap-4 bg-[#FFE000] text-[#1A1A1A] px-9 py-5 font-sans font-black uppercase tracking-[0.18em] text-[13px] hover:bg-[#D4BB00] transition-colors duration-200"
        >
          Ver eventos ↗
        </motion.a>

        {/* Stats — pushed to bottom on desktop */}
        <div className="hidden md:flex items-end gap-10 mt-auto">
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
      </div>

      {/* Scroll indicator */}
      <motion.a
        href="#eventos"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 1.1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 cursor-pointer group"
      >
        <span className="font-sans font-bold uppercase tracking-[0.28em] text-[11px] text-white group-hover:text-[#FFE000] transition-colors">
          Deslizá
        </span>
        {/* Animated chevrons */}
        <div className="flex flex-col items-center gap-0.5">
          {[0, 1, 2].map((i) => (
            <motion.svg
              key={i}
              width="22" height="13"
              viewBox="0 0 22 13"
              fill="none"
              animate={{ opacity: [0.2, 1, 0.2], y: [0, 4, 0] }}
              transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity, delay: i * 0.18 }}
            >
              <path d="M1 1l10 10L21 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </motion.svg>
          ))}
        </div>
      </motion.a>
    </section>
  );
}
