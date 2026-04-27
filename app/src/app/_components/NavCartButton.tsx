"use client";

import { useState } from "react";
import { useCart } from "./CartContext";
import { Sheet } from "~/app/_components/design/Sheet";

export function NavCartButton({ price }: { price: number }) {
  const { items, clear, toggle } = useCart();
  const [open, setOpen] = useState(false);

  const count = items.length;
  const total = items.reduce((sum, i) => sum + i.price, 0);
  const hasItems = count > 0;

  const triggerCheckout = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ivana:open-checkout"));
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`group flex items-center gap-2 px-4 py-2 font-sans font-black uppercase tracking-[0.16em] text-[11px] transition-colors duration-200 ${
          hasItems
            ? "bg-[#FFE000] text-[#1A1A1A] hover:bg-[#D4BB00]"
            : "border border-white/20 text-white/60 hover:border-[#FFE000] hover:text-[#FFE000]"
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
          <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 01-8 0"/>
        </svg>
        Carrito
        {hasItems && (
          <span className="ml-0.5 font-sans font-black text-[11px]">
            ({count})
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} position="right" width="460px" dark>
        <div className="relative flex flex-col h-full">
          {/* Yellow left accent */}
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FFE000]" />

          {/* Header */}
          <div className="flex items-start justify-between pl-9 pr-7 pt-9 pb-6">
            <div>
              <span className="font-sans font-bold uppercase tracking-[0.28em] text-[10px] text-[#FFE000]">
                · Carrito
              </span>
              <p
                className="mt-3 font-display font-black italic leading-[0.95] tracking-[-0.02em] text-white"
                style={{ fontSize: "clamp(36px, 5vw, 56px)" }}
              >
                Tu selección.
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50">
                {String(count).padStart(2, "0")} {count === 1 ? "foto" : "fotos"}
                {total > 0 && (
                  <>
                    {" · "}
                    <span className="text-[#FFE000]">${total.toLocaleString("es-AR")}</span>
                  </>
                )}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/50 hover:text-[#FFE000] transition-colors"
            >
              Cerrar [esc]
            </button>
          </div>

          <div className="h-px bg-white/10 mx-7" />

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-7 py-5">
            {!hasItems ? (
              <div className="border border-dashed border-white/15 py-16 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#FFE000]/60 mb-3">
                  Estado
                </p>
                <p className="font-display italic text-[36px] leading-tight text-white">
                  Vacío.
                </p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40 px-6">
                  Tocá el ícono en cada foto para sumarla
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {items.map((item, i) => (
                  <li key={item.photoId} className="flex items-center gap-4 py-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#FFE000]/70 shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="w-16 h-16 overflow-hidden bg-white/5 shrink-0">
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
                        Número
                      </p>
                      <p className="font-display italic text-[20px] leading-tight text-white truncate">
                        {item.bibNumber ? `#${item.bibNumber}` : "—"}
                      </p>
                    </div>
                    {item.price > 0 && (
                      <span className="font-mono text-[11px] tracking-[0.06em] text-[#FFE000] shrink-0">
                        ${item.price.toLocaleString("es-AR")}
                      </span>
                    )}
                    <button
                      onClick={() => toggle(item)}
                      className="ml-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40 hover:text-[#FFE000] transition-colors shrink-0"
                      aria-label="Quitar"
                    >
                      [×]
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {hasItems && (
            <div className="border-t border-white/10 px-7 py-6 flex flex-col gap-4 shrink-0">
              {total > 0 && (
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#FFE000]/70">
                    Total
                  </span>
                  <span className="font-display italic text-[28px] leading-none text-white">
                    ${total.toLocaleString("es-AR")}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => clear()}
                  className="px-4 py-3 border border-white/20 hover:border-[#FFE000] font-sans font-bold uppercase tracking-[0.16em] text-[10px] text-white/50 hover:text-[#FFE000] transition-colors"
                >
                  Vaciar
                </button>
                <button
                  onClick={triggerCheckout}
                  className="group flex-1 inline-flex items-center justify-between bg-[#FFE000] text-[#1A1A1A] px-5 py-3 hover:bg-[#D4BB00] transition-colors duration-200"
                >
                  <span className="font-sans font-black uppercase tracking-[0.16em] text-[11px]">Continuar</span>
                  <span className="font-sans font-black text-[13px] transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}
