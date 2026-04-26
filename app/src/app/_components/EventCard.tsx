"use client";

import Link from "next/link";
export type EventCardCol = {
  title: string;
  description?: string | null;
  slug?: string;
  coverUrl?: string | null;
  bannerUrl?: string | null;
  bannerFocalY?: number | null;
  logoUrl?: string | null;
  eventDate?: Date | string | null;
  _count?: { photos: number };
};

export function EventCard({
  col,
  index = 0,
  preview,
}: {
  col: EventCardCol;
  index?: number;
  preview?: boolean;
}) {
  const dateStr = col.eventDate
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(col.eventDate))
    : null;

  const focalY = col.bannerFocalY ?? 0.5;
  const objectPosition = `center ${Math.round(focalY * 100)}%`;
  const cover = col.bannerUrl ?? col.coverUrl;
  const num = String(index + 1).padStart(2, "0");

  const card = (
    <article className="group relative block">

      {/* image frame */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[color:var(--color-grey-900)] viewfinder-corners">
        {cover ? (
          <img
            src={cover}
            alt={col.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
            style={{ objectPosition }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)]">
              sin cubierta
            </span>
          </div>
        )}

        {/* hover overlay — develop strip */}
        <div className="absolute inset-0 bg-[color:var(--color-ink)] opacity-0 group-hover:opacity-20 transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]" />

        {/* sliding caption strip from bottom */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] bg-[#FFE000] text-[#1A1A1A] px-4 py-3 flex items-center gap-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 13V4.5a1.5 1.5 0 013 0V12"/>
            <path d="M11 11.5a1.5 1.5 0 013 0V13"/>
            <path d="M14 12.5a1.5 1.5 0 013 0V14"/>
            <path d="M17 13.5a1.5 1.5 0 013 0V16a6 6 0 01-6 6h-2a6 6 0 01-4.243-1.757l-2.914-2.914a1.5 1.5 0 012.121-2.121L8 17"/>
          </svg>
          <span className="font-sans font-black text-[11px] uppercase tracking-[0.18em]">
            Explorar
          </span>
        </div>
      </div>

      {/* title + inline cta */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="font-display italic text-[28px] leading-[1.05] tracking-[-0.02em] text-[color:var(--color-ink)] group-hover:translate-x-1 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
          {col.title || "Sin nombre"}
        </h3>
        {!preview && col.slug && (
          <span className="shrink-0 bg-[#FFE000] text-[#1A1A1A] px-3 py-1.5 font-sans font-black text-[10px] uppercase tracking-[0.18em] flex items-center gap-1.5 group-hover:bg-[#D4BB00] transition-colors duration-200">
            Ver evento
            <span className="transition-transform duration-500 group-hover:translate-x-0.5">→</span>
          </span>
        )}
      </div>
    </article>
  );

  if (preview || !col.slug) return card;

  return (
    <Link href={`/colecciones/${col.slug}`} className="block">
      {card}
    </Link>
  );
}
