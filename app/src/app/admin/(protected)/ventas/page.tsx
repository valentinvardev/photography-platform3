"use client";

import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { SalesTable } from "~/app/_components/admin/SalesTable";

type Period = "1h" | "24h" | "7d" | "30d" | "90d" | "180d" | "1y" | "all";

const PERIODS: { id: Period; label: string; ms: number | null }[] = [
  { id: "1h",   label: "1 h",  ms: 1 * 60 * 60 * 1000 },
  { id: "24h",  label: "24 h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d",   label: "7 d",  ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d",  label: "30 d", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "90d",  label: "3 m",  ms: 90 * 24 * 60 * 60 * 1000 },
  { id: "180d", label: "6 m",  ms: 180 * 24 * 60 * 60 * 1000 },
  { id: "1y",   label: "1 a",  ms: 365 * 24 * 60 * 60 * 1000 },
  { id: "all",  label: "Todo", ms: null },
];

export default function SalesPage() {
  const [period, setPeriod] = useState<Period>("all");

  // Build explicit input objects — never spread undefined keys into the input,
  // which can produce {} after JSON serialization in tRPC batch mode.
  const statsInput = useMemo<{ since?: string }>(() => {
    const p = PERIODS.find((x) => x.id === period);
    if (!p?.ms) return {};
    return { since: new Date(Date.now() - p.ms).toISOString() };
  }, [period]);

  const listInput = useMemo<{ page: number; limit: number; since?: string }>(() => {
    const p = PERIODS.find((x) => x.id === period);
    const base = { page: 1, limit: 500 } as const;
    if (!p?.ms) return base;
    return { ...base, since: new Date(Date.now() - p.ms).toISOString() };
  }, [period]);

  const { data: stats, isFetching: statsFetching } = api.purchase.adminStats.useQuery(statsInput);
  const { data: sales, isFetching: salesFetching } = api.purchase.adminList.useQuery(listInput);

  const isFetching = statsFetching || salesFetching;

  return (
    <div>
      <div className="mb-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-2">
          Historial de pagos
        </p>
        <h1
          className="font-display font-black italic leading-[0.92] tracking-[-0.03em]"
          style={{ fontSize: "clamp(36px, 5vw, 72px)" }}
        >
          Ventas.
        </h1>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-px mb-8 border border-[color:var(--color-grey-300)] bg-[color:var(--color-grey-300)] w-fit overflow-x-auto">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors whitespace-nowrap ${
              period === p.id
                ? "bg-[color:var(--color-ink)] text-[color:var(--color-paper)]"
                : "bg-[color:var(--color-paper)] text-[color:var(--color-grey-700)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border border-[color:var(--color-grey-300)] bg-[color:var(--color-grey-300)] mb-8">
        {[
          { label: "Total ventas", value: stats?.total ?? "—" },
          { label: "Aprobadas",    value: stats?.approved ?? "—" },
          { label: "Pendientes",   value: stats?.pending ?? "—" },
          { label: "Ingresos ARS", value: stats ? `$${stats.revenue.toLocaleString("es-AR")}` : "—" },
        ].map((c, i) => (
          <div key={i} className="bg-[color:var(--color-paper)] px-5 py-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-3">
              {c.label}
            </p>
            <p className={`font-display font-black italic text-[40px] leading-none text-[color:var(--color-ink)] transition-opacity duration-150 ${isFetching ? "opacity-30" : ""}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Loading indicator */}
      {isFetching && (
        <div className="h-[2px] mb-4 bg-[color:var(--color-grey-300)] overflow-hidden">
          <div className="h-full bg-[color:var(--color-ink)] animate-[shimmer_1s_ease-in-out_infinite]" style={{ width: "40%", animation: "shimmer 1s ease-in-out infinite" }} />
        </div>
      )}

      <SalesTable items={sales?.items ?? []} />
    </div>
  );
}
