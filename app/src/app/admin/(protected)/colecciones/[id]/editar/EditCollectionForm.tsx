"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { EventCard } from "~/app/_components/EventCard";

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i);

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [day, setDay] = useState(() => value ? String(parseInt(value.split("-")[2] ?? "0")) : "");
  const [month, setMonth] = useState(() => value ? String(parseInt(value.split("-")[1] ?? "0") - 1) : "");
  const [year, setYear] = useState(() => value ? (value.split("-")[0] ?? "") : "");

  const daysInMonth = month !== "" && year !== ""
    ? new Date(parseInt(year), parseInt(month) + 1, 0).getDate()
    : 31;

  const emit = (d: string, m: string, y: string) => {
    if (d && m !== "" && y) {
      const dayNum = parseInt(d);
      const maxDay = new Date(parseInt(y), parseInt(m) + 1, 0).getDate();
      const safeDay = String(Math.min(dayNum, maxDay)).padStart(2, "0");
      onChange(`${y}-${String(parseInt(m) + 1).padStart(2, "0")}-${safeDay}`);
    } else {
      onChange("");
    }
  };

  const sel = "flex-1 appearance-none bg-[color:var(--color-paper)] border border-[color:var(--color-grey-300)] px-3 py-3 font-mono text-[13px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-ink)] transition-colors cursor-pointer";
  return (
    <div className="flex gap-2">
      <select className={sel} value={day} onChange={(e) => { setDay(e.target.value); emit(e.target.value, month, year); }}>
        <option value="">Día</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={String(d)}>{d}</option>)}
      </select>
      <select className={`${sel} flex-[2]`} value={month} onChange={(e) => { setMonth(e.target.value); emit(day, e.target.value, year); }}>
        <option value="">Mes</option>
        {MONTHS.map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
      </select>
      <select className={sel} value={year} onChange={(e) => { setYear(e.target.value); emit(day, month, e.target.value); }}>
        <option value="">Año</option>
        {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}

function ImageUpload({
  label, hint, value, onChange, uploading, onUpload,
}: {
  label: string; hint: string; value: string;
  onChange: (url: string) => void;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="block font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-1.5">{label}</label>
      <p className="font-mono text-[12px] text-[color:var(--color-grey-600)] mb-2">{hint}</p>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative w-16 h-10 overflow-hidden border border-[color:var(--color-grey-300)] flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange("")}
              className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 text-white flex items-center justify-center text-xs leading-none">×</button>
          </div>
        ) : null}
        <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 border border-[color:var(--color-grey-300)] font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)] transition-colors disabled:opacity-50">
          {uploading ? (
            <div className="w-4 h-4 rounded-full border-2 border-[color:var(--color-grey-400)] border-t-[color:var(--color-brand)] animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
          {uploading ? "Subiendo..." : value ? "Cambiar" : "Subir imagen"}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }} />
    </div>
  );
}

/**
 * Drag-to-reframe wrapper that has the EXACT 4:5 aspect of a public EventCard.
 * The user sees the real card and can drag the image to adjust focalY.
 */
function CardFocalEditor({
  bannerUrl, focalY, onChange,
}: {
  bannerUrl: string; focalY: number; onChange: (y: number) => void;
}) {
  const dragRef = useRef({ active: false, startY: 0, startFocal: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startY: e.clientY,
      startFocal: focalY,
      height: rect.height,
    };
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const delta = e.clientY - dragRef.current.startY;
    const frac = delta / dragRef.current.height;
    // Drag image down → reveal top → focal decreases
    onChange(clamp(dragRef.current.startFocal - frac));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current.active = false;
    setIsDragging(false);
  };

  return (
    <div>
      <div
        className={`relative aspect-[4/5] overflow-hidden bg-[color:var(--color-grey-900)] select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bannerUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ objectPosition: `center ${Math.round(focalY * 100)}%` }}
        />
        {!isDragging && (
          <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
            <div className="px-3 py-1.5 bg-black/60 text-white font-mono text-[10px] uppercase tracking-[0.18em] flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              Click + arrastrar para reencuadrar
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mt-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-grey-700)] shrink-0">
          Posición vertical
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(focalY * 100)}
          onChange={(e) => onChange(clamp(Number(e.target.value) / 100))}
          className="flex-1 accent-[color:var(--color-brand)] cursor-pointer"
        />
        <span className="font-mono text-[11px] text-[color:var(--color-ink)] tabular-nums w-8 text-right">
          {Math.round(focalY * 100)}%
        </span>
        <button
          type="button"
          onClick={() => onChange(0.5)}
          className="px-2 py-1 border border-[color:var(--color-grey-300)] font-mono text-[10px] uppercase tracking-[0.1em] hover:border-[color:var(--color-ink)] transition-colors"
        >
          Centro
        </button>
      </div>
    </div>
  );
}

const inputClass = "w-full px-4 py-3 bg-transparent border border-[color:var(--color-grey-300)] text-[color:var(--color-ink)] placeholder-[color:var(--color-grey-600)] font-mono text-[13px] focus:outline-none focus:border-[color:var(--color-ink)] transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-2">{label}</label>
      {children}
    </div>
  );
}

export type EditCollectionInitial = {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  eventDate: string | null;
  pricePerBib: number | null;
  isPublished: boolean;
  bannerUrl: string | null;
  logoUrl: string | null;
  bannerFocalY: number | null;
};

export function EditCollectionForm({ initial }: { initial: EditCollectionInitial }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: initial.title,
    description: initial.description ?? "",
    slug: initial.slug,
    eventDate: initial.eventDate ? initial.eventDate.slice(0, 10) : "",
    pricePerBib: initial.pricePerBib != null ? String(initial.pricePerBib) : "",
    isPublished: initial.isPublished,
    bannerUrl: initial.bannerUrl ?? "",
    logoUrl: initial.logoUrl ?? "",
    bannerFocalY: initial.bannerFocalY ?? 0.5,
  });
  const [keys, setKeys] = useState({ bannerKey: "", logoKey: "" });
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const update = api.collection.update.useMutation({
    onSuccess: () => { window.location.href = `/admin/colecciones/${initial.id}`; },
  });

  const uploadImageWithKey = async (file: File, type: "banner" | "logo") => {
    const setter = type === "banner" ? setUploadingBanner : setUploadingLogo;
    setter(true);
    try {
      const path = `_collections/${type}/${Date.now()}-${file.name}`;
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, contentType: file.type }),
      });
      if (!signRes.ok) return;
      const { signedUrl } = await signRes.json() as { signedUrl: string; publicUrl: string };
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) return;

      const previewUrl = URL.createObjectURL(file);
      setForm((f) => ({ ...f, [type === "banner" ? "bannerUrl" : "logoUrl"]: previewUrl }));
      setKeys((k) => ({ ...k, [type === "banner" ? "bannerKey" : "logoKey"]: path }));
    } finally {
      setter(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const price = parseFloat(form.pricePerBib);
    update.mutate({
      id: initial.id,
      title: form.title,
      description: form.description,
      slug: form.slug,
      eventDate: form.eventDate || null,
      pricePerBib: isNaN(price) ? undefined : price,
      isPublished: form.isPublished,
      bannerFocalY: form.bannerFocalY,
      ...(keys.bannerKey ? { bannerUrl: keys.bannerKey } : {}),
      ...(keys.logoKey ? { logoUrl: keys.logoKey } : {}),
      ...(form.bannerUrl === "" ? { bannerUrl: null } : {}),
      ...(form.logoUrl === "" ? { logoUrl: null } : {}),
    });
  };

  const previewCol = {
    title: form.title || "Nombre del evento",
    description: form.description || null,
    slug: form.slug,
    eventDate: form.eventDate ? new Date(form.eventDate) : null,
    coverUrl: null,
    bannerUrl: form.bannerUrl || null,
    logoUrl: form.logoUrl || null,
    bannerFocalY: form.bannerFocalY,
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 items-start">
      <div className="max-w-xl w-full">
        <button onClick={() => router.back()} type="button"
          className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] hover:text-[color:var(--color-ink)] mb-8 transition-colors">
          ← Volver al evento
        </button>

        <h1 className="font-display font-black italic leading-[0.95] tracking-[-0.03em] mb-2" style={{ fontSize: "clamp(32px,4vw,52px)" }}>
          Editar<br /><span className="text-[color:var(--color-grey-700)]">evento.</span>
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] mb-10">
          Cambios en información, precio y portada — la previsualización es idéntica a la tarjeta del público.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field label="Nombre del evento *">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required className={inputClass} />
          </Field>

          <Field label="Fecha del evento">
            <DatePicker value={form.eventDate} onChange={(v) => setForm((f) => ({ ...f, eventDate: v }))} />
          </Field>

          <Field label="Precio por dorsal (ARS)">
            <input type="number" min="0" step="100" value={form.pricePerBib}
              onChange={(e) => setForm((f) => ({ ...f, pricePerBib: e.target.value }))}
              className={inputClass} />
          </Field>

          <Field label="Descripción">
            <textarea value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3} className={inputClass} />
          </Field>

          <Field label="URL (slug) *">
            <input value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
              required className={inputClass} />
            <p className="text-gray-400 text-xs mt-1.5">URL pública: /colecciones/{form.slug || "..."}</p>
          </Field>

          <div className="border-t border-[color:var(--color-grey-300)] pt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-5">Imágenes del evento</p>
            <div className="flex flex-col gap-5">
              <ImageUpload
                label="Portada (banner)"
                hint="Imagen que se muestra como tarjeta del evento. Mínimo 800×1000px."
                value={form.bannerUrl}
                onChange={(url) => { setForm((f) => ({ ...f, bannerUrl: url })); if (!url) setKeys((k) => ({ ...k, bannerKey: "" })); }}
                uploading={uploadingBanner}
                onUpload={(file) => uploadImageWithKey(file, "banner")}
              />
              {form.bannerUrl && (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] mb-3">
                    Encuadre de la portada
                  </p>
                  <CardFocalEditor
                    bannerUrl={form.bannerUrl}
                    focalY={form.bannerFocalY}
                    onChange={(y) => setForm((f) => ({ ...f, bannerFocalY: y }))}
                  />
                </div>
              )}
              <ImageUpload
                label="Logo del evento (círculo central)"
                hint="Imagen cuadrada o circular, mínimo 200×200px."
                value={form.logoUrl}
                onChange={(url) => { setForm((f) => ({ ...f, logoUrl: url })); if (!url) setKeys((k) => ({ ...k, logoKey: "" })); }}
                uploading={uploadingLogo}
                onUpload={(file) => uploadImageWithKey(file, "logo")}
              />
            </div>
          </div>

          <label className="flex items-center gap-4 cursor-pointer p-4 border border-[color:var(--color-grey-300)] hover:border-[color:var(--color-ink)] transition-colors">
            <div className="relative shrink-0">
              <input type="checkbox" checked={form.isPublished}
                onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
                className="sr-only" />
              <div className="w-10 h-5 transition-colors"
                style={{ background: form.isPublished ? "var(--color-brand)" : "var(--color-grey-300)" }}>
                <div className="absolute top-0.5 w-4 h-4 shadow transition-all"
                  style={{ left: form.isPublished ? "22px" : "2px", background: form.isPublished ? "var(--color-ink)" : "var(--color-paper)" }} />
              </div>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink)]">Publicado</p>
              <p className="font-mono text-[12px] text-[color:var(--color-grey-700)] mt-0.5">Visible en el sitio público</p>
            </div>
          </label>

          {update.isError && (
            <div className="border-l-2 border-[color:var(--color-safelight)] pl-4 py-2">
              <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[color:var(--color-safelight)]">Error</p>
              <p className="font-mono text-[12px] text-[color:var(--color-ink)] mt-0.5">{update.error?.message ?? "Algo falló."}</p>
            </div>
          )}

          <div className="flex gap-4 pt-2 flex-wrap">
            <button type="submit" disabled={update.isPending || !form.title || !form.slug}
              className="group inline-flex items-center justify-between gap-8 border border-[color:var(--color-ink)] px-6 py-4 hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-paper)] transition-colors disabled:opacity-40 disabled:cursor-wait font-mono text-[11px] uppercase tracking-[0.22em]">
              <span>{update.isPending ? "Guardando…" : "Guardar cambios"}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            <button type="button" onClick={() => router.back()}
              className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] hover:text-[color:var(--color-ink)] transition-colors border border-[color:var(--color-grey-300)] hover:border-[color:var(--color-ink)]">
              Cancelar
            </button>
          </div>
        </form>
      </div>

      <div className="hidden xl:block" style={{ position: "sticky", top: "2rem", alignSelf: "start" }}>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-4">Vista previa · igual que en la landing</p>
        <div className="max-w-xs">
          <EventCard col={previewCol} preview />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-grey-500)] mt-3">Se actualiza mientras editás</p>
      </div>
    </div>
  );
}
