"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";

const ITEMS = [
  { label: "Eventos", href: "/#eventos" },
  { label: "Contacto", href: "/#contacto" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const portal = mounted ? createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay — above grain layer (9998) */}
          <motion.div
            key="m-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(10,10,10,0.7)", backdropFilter: "blur(4px)" }}
          />

          {/* Drawer */}
          <motion.aside
            key="m-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 10001, width: "min(88vw, 400px)" }}
            className="bg-[#111111] text-white flex flex-col border-l border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.9)]"
          >
            {/* Yellow top bar */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#FFE000]" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 h-16 shrink-0 mt-[3px]">
              <div className="flex items-baseline gap-1">
                <span className="font-display font-extrabold italic text-[20px] leading-none text-[#FFE000]">SINCHI</span>
                <span className="font-display font-extrabold italic text-[12px] leading-none text-[#FFE000]/50">®</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="font-sans font-bold uppercase tracking-[0.2em] text-[10px] text-white/40 hover:text-white transition-colors"
                aria-label="Cerrar menú"
              >
                Cerrar ×
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-6 pt-4">
              <ul className="border-t border-white/10">
                {ITEMS.map((item, i) => (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="group flex items-center justify-between w-full py-5 border-b border-white/10 hover:border-[#FFE000]/40 transition-colors"
                    >
                      <span className="font-display font-extrabold italic text-[32px] leading-none text-white group-hover:text-[#FFE000] transition-colors duration-200">
                        {item.label}
                      </span>
                      <span className="text-white/20 group-hover:text-[#FFE000]/60 transition-colors text-[18px]">→</span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </nav>

            {/* CTA */}
            <div className="px-6 pb-10 pt-6 shrink-0">
              <Link
                href="/#eventos"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between bg-[#FFE000] text-[#1A1A1A] px-5 py-4 hover:bg-[#D4BB00] transition-colors duration-200 group"
              >
                <span className="font-sans font-black text-[11px] uppercase tracking-[0.2em]">Buscar mis fotos</span>
                <span className="font-sans font-black text-[14px] transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <p className="mt-5 font-sans font-bold uppercase tracking-[0.2em] text-[10px] text-white/20">
                © {new Date().getFullYear()} SINCHI® · Argentina
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  ) : null;

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex flex-col items-center justify-center gap-[5px] text-white"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
      >
        <span
          className={`block h-[2px] w-5 bg-current transition-all duration-300 origin-center ${
            open ? "translate-y-[3.5px] rotate-45 bg-[#FFE000]" : ""
          }`}
        />
        <span
          className={`block h-[2px] w-5 bg-current transition-all duration-300 origin-center ${
            open ? "-translate-y-[3.5px] -rotate-45 bg-[#FFE000]" : ""
          }`}
        />
      </button>

      {portal}
    </>
  );
}
