"use client";

import { motion } from "motion/react";

type Props = {
  title: string;
  dateStr: string | null;
  description: string | null;
  bannerSrc: string | null;
  logoUrl: string | null;
  photoCount: number;
  price: number;
  bannerFocalY?: number;
};

export function CollectionHero({
  title,
  dateStr,
  description,
  bannerSrc,
  logoUrl,
  photoCount,
  price,
  bannerFocalY = 50,
}: Props) {
  const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

  return (
    <section className="relative overflow-hidden bg-[#0D0D0D]" style={{ minHeight: "min(56vh, 480px)" }}>
      {/* Banner image */}
      {bannerSrc && (
        <div className="absolute inset-0">
          <img
            src={bannerSrc}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: `50% ${bannerFocalY}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D0D]/95 via-[#0D0D0D]/70 to-[#0D0D0D]/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D]/80 via-transparent to-transparent" />
        </div>
      )}

      {/* Yellow left bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FFE000]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end h-full px-8 md:px-14 pt-28 pb-10">

        {/* Logo + discipline tag */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease, delay: 0.05 }}
          className="flex items-center gap-4 mb-8"
        >
          {logoUrl && (
            <img src={logoUrl} alt="" className="w-10 h-10 object-cover shrink-0" />
          )}
          <div className="flex items-center gap-3">
            <span className="block w-6 h-[2px] bg-[#FFE000]" />
            <span className="font-sans font-bold uppercase tracking-[0.28em] text-[#FFE000] text-[10px]">
              Evento · SINCHI®
            </span>
          </div>
        </motion.div>

        {/* Title */}
        <div className="overflow-hidden">
          <motion.h1
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            transition={{ duration: 0.75, ease, delay: 0.15 }}
            className="font-display font-extrabold italic leading-[0.85] tracking-[-0.02em] text-white"
            style={{ fontSize: "clamp(44px, 9vw, 140px)" }}
          >
            {title}
          </motion.h1>
        </div>

        {/* Description */}
        {description && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease, delay: 0.35 }}
            className="mt-4 font-sans text-[14px] leading-[1.65] text-white/50 max-w-md"
          >
            {description}
          </motion.p>
        )}

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.45 }}
          className="mt-8 flex flex-wrap items-end gap-x-8 gap-y-4"
        >
          {dateStr && (
            <div>
              <span className="block font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/35 mb-1">Fecha</span>
              <span className="block font-sans font-bold text-[14px] text-white/80">{dateStr}</span>
            </div>
          )}
          <div>
            <span className="block font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/35 mb-1">Fotos</span>
            <span className="block font-display font-extrabold italic text-[28px] leading-none text-white">
              {String(photoCount).padStart(3, "0")}
            </span>
          </div>
          {price > 0 && (
            <div>
              <span className="block font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/35 mb-1">Por foto</span>
              <span className="block font-display font-extrabold italic text-[28px] leading-none text-[#FFE000]">
                ${price.toLocaleString("es-AR")}
              </span>
            </div>
          )}

          <a
            href="#search"
            className="ml-auto inline-flex items-center gap-3 bg-[#FFE000] text-[#1A1A1A] px-6 py-3 font-sans font-black uppercase tracking-[0.18em] text-[11px] hover:bg-[#D4BB00] transition-colors duration-200 shrink-0"
          >
            Buscar mis fotos ↓
          </a>
        </motion.div>
      </div>
    </section>
  );
}
