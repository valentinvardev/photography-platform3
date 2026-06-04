"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

function buildWaUrl(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isFetching } = api.purchase.adminCustomers.useQuery({ q: q || undefined, page, limit: 50 });

  return (
    <div>
      <div className="mb-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-2">
          Base de datos
        </p>
        <h1
          className="font-display font-black italic leading-[0.92] tracking-[-0.03em]"
          style={{ fontSize: "clamp(36px, 5vw, 72px)" }}
        >
          Clientes.
        </h1>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Buscar por email, nombre o teléfono…"
          className="flex-1 max-w-md px-4 py-2.5 border border-[color:var(--color-grey-300)] bg-[color:var(--color-paper)] font-mono text-[12px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-grey-400)] focus:outline-none focus:border-[color:var(--color-ink)]"
        />
        {data && (
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-500)]">
            {data.total} cliente{data.total !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Loading indicator */}
      {isFetching && (
        <div className="h-[2px] mb-4 bg-[color:var(--color-grey-300)] overflow-hidden">
          <div className="h-full bg-[color:var(--color-ink)]" style={{ width: "40%", animation: "shimmer 1s ease-in-out infinite" }} />
        </div>
      )}

      {/* Table */}
      <div className="border border-[color:var(--color-grey-300)] overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-[color:var(--color-grey-300)]">
              {["Email", "Nombre", "Teléfono", "Compras", "Aprobadas", "Total ARS", "Última"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && !isFetching && (
              <tr>
                <td colSpan={7} className="py-20 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)]">
                  Sin clientes
                </td>
              </tr>
            )}
            {(data?.items ?? []).map((c, i) => (
              <tr
                key={c.email}
                className={`hover:bg-[color:var(--color-grey-100)] transition-colors ${
                  i < (data?.items.length ?? 0) - 1 ? "border-b border-[color:var(--color-grey-100)]" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <a
                    href={`mailto:${c.email}`}
                    className="font-mono text-[11px] text-[color:var(--color-ink)] hover:underline"
                  >
                    {c.email}
                  </a>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-[color:var(--color-grey-700)]">
                  {[c.name, c.lastName].filter(Boolean).join(" ") || (
                    <span className="text-[color:var(--color-grey-400)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.phone ? (
                    <a
                      href={buildWaUrl(c.phone)}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[color:var(--color-grey-700)] hover:text-[#16a34a]"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                      </svg>
                      {c.phone}
                    </a>
                  ) : (
                    <span className="font-mono text-[11px] text-[color:var(--color-grey-400)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[color:var(--color-ink)] font-bold">
                  {c.totalPurchases}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#16a34a]">
                  {c.approvedPurchases}
                </td>
                <td className="px-4 py-3 font-sans font-bold text-[13px] text-[color:var(--color-ink)]">
                  ${c.totalSpent.toLocaleString("es-AR")}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-grey-500)]">
                  {c.lastPurchaseAt
                    ? new Date(c.lastPurchaseAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-500)]">
            Página {page} de {data.pages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-[color:var(--color-grey-300)] font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-grey-700)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] disabled:opacity-30 disabled:hover:border-[color:var(--color-grey-300)] disabled:hover:text-[color:var(--color-grey-700)] transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page >= data.pages}
              className="px-3 py-1.5 border border-[color:var(--color-grey-300)] font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-grey-700)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] disabled:opacity-30 disabled:hover:border-[color:var(--color-grey-300)] disabled:hover:text-[color:var(--color-grey-700)] transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
