"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import type { DiscountCode } from "~/lib/pricing";
import { parseDiscountCodes } from "~/lib/pricing";

function CodeRow({
  code,
  index,
  onChange,
  onRemove,
}: {
  code: DiscountCode;
  index: number;
  onChange: (c: DiscountCode) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-grey-500)] w-5 text-right">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <label className="block font-mono text-[8px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] mb-1">
            Código
          </label>
          <input
            type="text"
            value={code.code}
            onChange={(e) => onChange({ ...code, code: e.target.value.toUpperCase() })}
            className="w-full border border-[color:var(--color-grey-300)] bg-[color:var(--color-paper)] px-3 py-1.5 font-mono text-[11px] text-[color:var(--color-ink)] focus:border-[color:var(--color-ink)] outline-none uppercase"
            placeholder="PROMO10"
          />
        </div>
        <div>
          <label className="block font-mono text-[8px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] mb-1">
            Descuento (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={code.percent}
            onChange={(e) => onChange({ ...code, percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
            className="w-full border border-[color:var(--color-grey-300)] bg-[color:var(--color-paper)] px-3 py-1.5 font-mono text-[11px] text-[color:var(--color-ink)] focus:border-[color:var(--color-ink)] outline-none"
          />
        </div>
      </div>
      <button
        onClick={onRemove}
        className="font-mono text-[10px] text-[color:var(--color-grey-400)] hover:text-[color:var(--color-safelight)] transition-colors shrink-0"
      >
        [×]
      </button>
    </div>
  );
}

export function PricingPanel({
  collectionId,
  initialPricePerBib,
  initialPackPrice,
  initialDiscountCodes,
}: {
  collectionId: string;
  initialPricePerBib: number;
  initialPackPrice: number | null;
  initialDiscountCodes: DiscountCode[];
}) {
  const [pricePerBib, setPricePerBib] = useState(initialPricePerBib);
  const [packEnabled, setPackEnabled] = useState(initialPackPrice !== null);
  const [packPrice, setPackPrice] = useState(initialPackPrice ?? 0);
  const [codes, setCodes] = useState<DiscountCode[]>(initialDiscountCodes);
  const [saved, setSaved] = useState(false);

  const update = api.collection.update.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleSave = () => {
    update.mutate({
      id: collectionId,
      pricePerBib,
      packPrice: packEnabled ? packPrice : null,
      discountCodes: codes.length > 0 ? codes : null,
    });
  };

  const addCode = () => {
    setCodes((prev) => [...prev, { code: "", percent: 10 }]);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Base price */}
      <div>
        <label className="block font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-2">
          Precio base por foto (ARS)
        </label>
        <input
          type="number"
          min={0}
          value={pricePerBib}
          onChange={(e) => setPricePerBib(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-full border border-[color:var(--color-grey-300)] bg-[color:var(--color-paper)] px-4 py-2.5 font-display italic text-[22px] text-[color:var(--color-ink)] focus:border-[color:var(--color-ink)] outline-none"
        />
      </div>

      <div className="h-px bg-[color:var(--color-grey-300)]" />

      {/* Discount codes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)]">
            Códigos de descuento
          </p>
          <button
            onClick={addCode}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--color-ink)] border border-[color:var(--color-grey-300)] px-3 py-1.5 hover:border-[color:var(--color-ink)] transition-colors"
          >
            + Código
          </button>
        </div>
        {codes.length === 0 ? (
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-grey-400)]">
            Sin códigos configurados
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {codes.map((c, i) => (
              <CodeRow
                key={i}
                code={c}
                index={i}
                onChange={(updated) =>
                  setCodes((prev) => prev.map((x, xi) => (xi === i ? updated : x)))
                }
                onRemove={() => setCodes((prev) => prev.filter((_, xi) => xi !== i))}
              />
            ))}
          </div>
        )}
        {codes.length > 0 && (
          <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-grey-400)]">
            El comprador ingresa el código al momento de pagar para aplicar el descuento
          </p>
        )}
      </div>

      <div className="h-px bg-[color:var(--color-grey-300)]" />

      {/* Pack price */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)]">
            Precio pack (todas las fotos)
          </p>
          <button
            onClick={() => setPackEnabled((v) => !v)}
            className={`font-mono text-[9px] uppercase tracking-[0.14em] px-3 py-1.5 border transition-colors ${
              packEnabled
                ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-paper)]"
                : "border-[color:var(--color-grey-300)] text-[color:var(--color-grey-500)] hover:border-[color:var(--color-ink)]"
            }`}
          >
            {packEnabled ? "Activado" : "Desactivado"}
          </button>
        </div>
        {packEnabled && (
          <>
            <input
              type="number"
              min={0}
              value={packPrice}
              onChange={(e) => setPackPrice(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full border border-[color:var(--color-grey-300)] bg-[color:var(--color-paper)] px-4 py-2.5 font-display italic text-[22px] text-[color:var(--color-ink)] focus:border-[color:var(--color-ink)] outline-none"
            />
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[color:var(--color-grey-400)]">
              Precio fijo para comprar todas las fotos del dorsal elegido
            </p>
          </>
        )}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={update.isPending}
        className={`inline-flex items-center justify-center gap-2 px-5 py-3 border font-mono text-[10px] uppercase tracking-[0.18em] transition-colors disabled:opacity-40 ${
          saved
            ? "border-[#16a34a] text-[#16a34a]"
            : "border-[color:var(--color-ink)] hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-paper)]"
        }`}
      >
        {update.isPending ? "Guardando…" : saved ? "✓ Guardado" : "Guardar precios"}
      </button>
    </div>
  );
}

export { parseDiscountCodes };
