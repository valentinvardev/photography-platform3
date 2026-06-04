"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { ConfirmModal } from "./ConfirmModal";
import { SalePhotosModal } from "./SalePhotosModal";

type Sale = {
  id: string;
  buyerEmail: string;
  buyerName: string | null;
  buyerLastName?: string | null;
  buyerPhone?: string | null;
  bibNumber: string | null;
  status: string;
  amountPaid: unknown;
  createdAt: Date;
  downloadToken: string | null;
  collection: { title: string };
};

function buildWaUrl(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}`;
}

export function SalesTable({ items }: { items: Sale[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmSale, setConfirmSale] = useState<Sale | null>(null);
  const [emailSentId, setEmailSentId] = useState<string | null>(null);
  const [photosSale, setPhotosSale] = useState<Sale | null>(null);

  const approve = api.purchase.manualApprove.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const resendEmail = api.settings.resendPurchaseEmail.useMutation({
    onSuccess: (_, { purchaseId }) => {
      setEmailSentId(purchaseId);
      setTimeout(() => setEmailSentId(null), 2500);
    },
  });

  const copyDownloadLink = (token: string, id: string) => {
    const url = `${window.location.origin}/descarga/${token}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (items.length === 0) {
    return (
      <div className="border border-[color:var(--color-grey-300)] py-20 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)]">
          Sin ventas aún
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-grey-400)] mt-2">
          Las ventas aparecerán aquí cuando se realice una compra
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[color:var(--color-grey-300)] overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-[color:var(--color-grey-300)]">
            {["Email comprador", "Dorsal", "Colección", "Estado", "Monto", "Fecha", "Acciones"].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((sale, i) => (
            <tr
              key={sale.id}
              className={`hover:bg-[color:var(--color-grey-100)] transition-colors ${
                i < items.length - 1 ? "border-b border-[color:var(--color-grey-100)]" : ""
              }`}
            >
              <td className="px-4 py-3">
                <p className="font-mono text-[10px] text-[color:var(--color-ink)]">{sale.buyerEmail}</p>
                {(sale.buyerName ?? sale.buyerLastName) && (
                  <p className="font-mono text-[9px] text-[color:var(--color-grey-400)] mt-0.5">
                    {[sale.buyerName, sale.buyerLastName].filter(Boolean).join(" ")}
                  </p>
                )}
                {sale.buyerPhone && (
                  <a
                    href={buildWaUrl(sale.buyerPhone)}
                    target="_blank"
                    rel="noopener"
                    className={`inline-flex items-center gap-1 mt-1 font-mono text-[10px] hover:underline ${
                      sale.status === "PENDING"
                        ? "text-[#92400e] font-bold"
                        : "text-[color:var(--color-grey-500)]"
                    }`}
                    title="Abrir WhatsApp"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                    </svg>
                    {sale.buyerPhone}
                  </a>
                )}
              </td>

              <td className="px-4 py-3 font-mono text-[12px] font-bold text-[color:var(--color-ink)]">
                {sale.bibNumber ? `#${sale.bibNumber}` : (
                  <span className="font-normal text-[color:var(--color-grey-400)]">—</span>
                )}
              </td>

              <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-grey-500)]">
                {sale.collection.title}
              </td>

              <td className="px-4 py-3">
                <StatusBadge status={sale.status} />
              </td>

              <td className="px-4 py-3 font-sans font-bold text-[14px] text-[color:var(--color-ink)]">
                ${Number(sale.amountPaid).toLocaleString("es-AR")}
              </td>

              <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-grey-500)]">
                {new Date(sale.createdAt).toLocaleDateString("es-AR", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              </td>

              <td className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setPhotosSale(sale)}
                    className="px-2.5 py-1 border border-[color:var(--color-grey-300)] font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-grey-600)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] transition-colors"
                  >
                    ◫ Fotos
                  </button>
                  {sale.status !== "APPROVED" && (
                    <button
                      onClick={() => setConfirmSale(sale)}
                      disabled={approve.isPending}
                      className="px-2.5 py-1 border border-[#16a34a] font-mono text-[9px] uppercase tracking-[0.12em] text-[#16a34a] hover:bg-[#16a34a] hover:text-white transition-colors disabled:opacity-40"
                    >
                      Aprobar
                    </button>
                  )}
                  {sale.status === "APPROVED" && sale.downloadToken && (
                    <>
                      <button
                        onClick={() => copyDownloadLink(sale.downloadToken!, sale.id)}
                        className="px-2.5 py-1 border border-[color:var(--color-grey-300)] font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-grey-600)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] transition-colors"
                      >
                        {copiedId === sale.id ? "Copiado" : "↗ Link"}
                      </button>
                      <button
                        onClick={() => resendEmail.mutate({ purchaseId: sale.id })}
                        disabled={resendEmail.isPending}
                        className="px-2.5 py-1 border border-[color:var(--color-grey-300)] font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-grey-600)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)] transition-colors disabled:opacity-40"
                      >
                        {emailSentId === sale.id ? "✓ Enviado" : "Email"}
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirmSale && (
        <ConfirmModal
          title="Aprobar compra manualmente"
          message={`¿Aprobar la compra de ${confirmSale.buyerEmail} para el dorsal #${confirmSale.bibNumber ?? "—"}?`}
          confirmLabel="Aprobar"
          variant="success"
          onConfirm={() => { approve.mutate({ id: confirmSale.id }); setConfirmSale(null); }}
          onCancel={() => setConfirmSale(null)}
        />
      )}

      {photosSale && (
        <SalePhotosModal
          purchaseId={photosSale.id}
          buyerEmail={photosSale.buyerEmail}
          onClose={() => setPhotosSale(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    APPROVED: { color: "#16a34a", label: "Aprobada"    },
    PENDING:  { color: "#92400e", label: "Pendiente"   },
    REJECTED: { color: "var(--color-safelight)", label: "Rechazada"  },
    REFUNDED: { color: "#2563eb", label: "Reembolsada" },
  };
  const s = map[status] ?? { color: "var(--color-grey-500)", label: status };
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
