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
          className="w-full h-full object-cover object-[70%_70%] md:object-[40%_50%]"
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

        {/* Logo — clipped container hides transparent top of the PNG */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.05 }}
          className="shrink-0 overflow-hidden"
          style={{ maxHeight: "clamp(120px, 22vw, 380px)" }}
        >
          <img
            src="/sinchi-logo.png"
            alt="SINCHI®"
            className="h-56 md:h-[22rem] lg:h-[50rem] w-auto object-bottom object-left -mt-[15%] md:-mt-[24%] lg:mt-0"
          />
        </motion.div>

        {/* Headline — tight gap after logo */}
        <div className="overflow-hidden -mt-4 md:-mt-8 shrink-0">
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
          <div className="relative">
            <p className={`font-sans text-[14px] leading-[1.7] text-white/60 ${expanded ? "" : "line-clamp-2"}`}>
              {DESCRIPTION}
            </p>
            {!expanded && (
              <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#0D0D0D]/80 to-transparent pointer-events-none" />
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease, delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-3"
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
