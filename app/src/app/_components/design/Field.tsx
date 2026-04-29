"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

type Variant = "ink" | "paper";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  variant?: Variant;
};

export const Field = forwardRef<HTMLInputElement, Props>(function Field(
  { label, hint, variant = "ink", className = "", ...rest },
  ref,
) {
  const isInk = variant === "ink";
  return (
    <label className="block group">
      {label && (
        <span className="block font-sans font-bold text-[12px] uppercase tracking-[0.14em] text-[color:var(--color-ink)] mb-2">
          {label}
        </span>
      )}
      <input
        ref={ref}
        className={`w-full bg-transparent border-0 border-b-2 ${
          isInk
            ? "border-[color:var(--color-grey-400)] focus:border-[color:var(--color-ink)] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-grey-400)]"
            : "border-[color:var(--color-grey-600)] focus:border-[color:var(--color-paper)] text-[color:var(--color-paper)] placeholder:text-[color:var(--color-grey-500)]"
        } font-sans font-semibold text-[18px] leading-[1.3] py-2.5 outline-none transition-colors ${className}`}
        {...rest}
      />
      {hint && (
        <span className="block font-sans font-semibold text-[12px] text-[color:var(--color-ink)]/60 mt-2">
          {hint}
        </span>
      )}
    </label>
  );
});
