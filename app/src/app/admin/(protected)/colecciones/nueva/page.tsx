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

// ── DatePicker ────────────────────────────────────────────────────────────────

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Local state for each part — emit only when all three are set
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

  const handleDay = (d: string) => { setDay(d); emit(d, month, year); };
  const handleMonth = (m: string) => {
    setMonth(m);
    // Clamp day if needed when month changes
    if (day && year && m !== "") {
      const maxDay = new Date(parseInt(year), parseInt(m) + 1, 0).getDate();
      const clamped = String(Math.min(parseInt(day), maxDay));
      setDay(clamped);
      emit(clamped, m, year);
    } else {
      emit(day, m, year);
    }
  };
  const handleYear = (y: string) => { setYear(y); emit(day, month, y); };

  const sel = "flex-1 appearance-none bg-[color:var(--color-paper)] border border-[color:var(--color-grey-300)] px-3 py-3 font-mono text-[13px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-ink)] transition-colors cursor-pointer";
  return (
    <div className="flex gap-2">
      <select className={sel} value={day} onChange={(e) => handleDay(e.target.value)}>
        <option value="">Día</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={String(d)}>{d}</option>)}
      </select>
      <select className={`${sel} flex-[2]`} value={month} onChange={(e) => handleMonth(e.target.value)}>
        <option value="">Mes</option>
        {MONTHS.map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
      </select>
      <select className={sel} value={year} onChange={(e) => handleYear(e.target.value)}>
        <option value="">Año</option>
        {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}

// ── Image uploader (banner or logo) ──────────────────────────────────────────

function ImageUpload({
  label,
  hint,
  value,
  onChange,
  uploading,
  onUpload,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    void onUpload(file);
  };

  return (
    <div>
      <label className="block font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-1.5">{label}</label>
      <p className="font-mono text-[12px] text-[color:var(--color-grey-600)] mb-2">{hint}</p>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative w-16 h-10 overflow-hidden border border-[color:var(--color-grey-300)] flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 text-white flex items-center justify-center text-xs leading-none"
            >×</button>
          </div>
        ) : null}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 border border-[color:var(--color-grey-300)] font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)] transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <div className="w-4 h-4 rounded-full border-2 border-[color:var(--color-grey-400)] border-t-[color:var(--color-brand)] animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
          {uploading ? "Subiendo..." : value ? "Cambiar" : "Subir imagen"}
        </button>
        {value && (
          <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--color-brand)] flex items-center gap-1">
            ✓ Subida
          </span>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ── Draggable banner preview ──────────────────────────────────────────────────

function BannerDragger({
  bannerUrl,
  focalY,
  onChange,
}: {
  bannerUrl: string;
  focalY: number;
  onChange: (y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startFocal = useRef(0);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startFocal.current = focalY;
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    dragging.current = true;
    startY.current = e.touches[0]!.clientY;
    startFocal.current = focalY;
  };

  // Global move/up via useEffect so cleanup is guaranteed
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const delta = e.clientY - startY.current;
      const frac = delta / containerRef.current.clientHeight;
      onChange(clamp(startFocal.current + frac));
    };
    const onUp = () => { dragging.current = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const delta = e.touches[0]!.clientY - startY.current;
      const frac = delta / containerRef.current.clientHeight;
      onChange(clamp(startFocal.current + frac));
    };
    const onTouchEnd = () => { dragging.current = false; };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onChange]);

  return (
    <div
      ref={containerRef}
      className="relative h-44 overflow-hidden cursor-ns-resize select-none"
      style={{ background: "var(--color-grey-200)" }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bannerUrl}
        alt=""
        draggable={false}
        className="w-full h-full object-cover pointer-events-none"
        style={{ objectPosition: `center ${Math.round(focalY * 100)}%` }}
      />
      {/* Drag hint overlay */}
      <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-black/50 text-white text-xs font-medium">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Arrastrá para reencuadrar
        </div>
      </div>
      {/* Focal line indicator */}
      <div
        className="absolute left-0 right-0 h-px bg-white/60 pointer-events-none"
        style={{ top: `${focalY * 100}%` }}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const inputClass = "w-full px-4 py-3 bg-transparent border border-[color:var(--color-grey-300)] text-[color:var(--color-ink)] placeholder-[color:var(--color-grey-600)] font-mono text-[13px] focus:outline-none focus:border-[color:var(--color-ink)] transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-2">{label}</label>
      {children}
    </div>
  );
}

export default function NewCollectionPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    slug: "",
    eventDate: "",
    pricePerBib: "",
    isPublished: false,
    bannerUrl: "",
    logoUrl: "",
    bannerFocalY: 0.5,
  });
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const create = api.collection.create.useMutation({
    onSuccess: (col) => router.push(`/admin/colecciones/${col.id}`),
  });

  const handleTitleChange = (title: string) => {
    setForm((f) => ({
      ...f,
      title,
      slug: title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, ""),
    }));
  };

  const [keys, setKeys] = useState({ bannerKey: "", logoKey: "" });

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
      const { signedUrl, publicUrl } = await signRes.json() as { signedUrl: string; publicUrl: string };
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
    create.mutate({
      title: form.title,
      description: form.description || undefined,
      slug: form.slug,
      eventDate: form.eventDate || undefined,
      pricePerBib: isNaN(price) ? undefined : price,
      isPublished: form.isPublished,
      bannerUrl: keys.bannerKey || undefined,
      logoUrl: keys.logoKey || undefined,
      bannerFocalY: form.bannerFocalY,
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

      {/* ── Form ── */}
      <div className="max-w-xl w-full">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] hover:text-[color:var(--color-ink)] mb-8 transition-colors">
          ← Volver a eventos
        </button>

        <h1 className="font-display font-black italic leading-[0.95] tracking-[-0.03em] mb-2" style={{ fontSize: "clamp(32px,4vw,52px)" }}>
          Nuevo<br /><span className="text-[color:var(--color-grey-700)]">evento.</span>
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-700)] mb-10">Completá los datos — la previsualización se actualiza en tiempo real.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field label="Nombre del evento *">
            <input value={form.title} onChange={(e) => handleTitleChange(e.target.value)}
              required placeholder="ej. Maratón Rosario 2025" className={inputClass} />
          </Field>

          <Field label="Fecha del evento">
            <DatePicker value={form.eventDate} onChange={(v) => setForm((f) => ({ ...f, eventDate: v }))} />
          </Field>

          <Field label="Precio por dorsal (ARS)">
            <input type="number" min="0" step="100" value={form.pricePerBib}
              onChange={(e) => setForm((f) => ({ ...f, pricePerBib: e.target.value }))}
              placeholder="ej. 5000" className={inputClass} />
          </Field>

          <Field label="Descripción">
            <textarea value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="Descripción breve del evento..." className={inputClass} />
          </Field>

          <Field label="URL (slug) *">
            <input value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
              required placeholder="maraton-rosario-2025" className={inputClass} />
            <p className="text-gray-400 text-xs mt-1.5">URL pública: /colecciones/{form.slug || "..."}</p>
          </Field>

          {/* ── Images ── */}
          <div className="border-t border-[color:var(--color-grey-300)] pt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-5">Imágenes del evento</p>
            <div className="flex flex-col gap-5">
              <ImageUpload
                label="Banner (fondo de la tarjeta)"
                hint="Imagen horizontal, mínimo 800×400px."
                value={form.bannerUrl}
                onChange={(url) => { setForm((f) => ({ ...f, bannerUrl: url })); if (!url) setKeys((k) => ({ ...k, bannerKey: "" })); }}
                uploading={uploadingBanner}
                onUpload={(file) => uploadImageWithKey(file, "banner")}
              />
              {form.bannerUrl && (
                <BannerDragger
                  bannerUrl={form.bannerUrl}
                  focalY={form.bannerFocalY}
                  onChange={(y) => setForm((f) => ({ ...f, bannerFocalY: y }))}
                />
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
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink)]">Publicar inmediatamente</p>
              <p className="font-mono text-[12px] text-[color:var(--color-grey-700)] mt-0.5">El evento será visible en el sitio público</p>
            </div>
          </label>

          {create.isError && (
            <div className="border-l-2 border-[color:var(--color-safelight)] pl-4 py-2">
              <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-[color:var(--color-safelight)]">Error</p>
              <p className="font-mono text-[12px] text-[color:var(--color-ink)] mt-0.5">Revisá que el slug no esté en uso.</p>
            </div>
          )}

          <div className="flex gap-4 pt-2 flex-wrap">
            <button type="submit"
              disabled={create.isPending || !form.title || !form.slug}
              className="group inline-flex items-center justify-between gap-8 border border-[color:var(--color-ink)] px-6 py-4 hover:bg-[color:var(--color-ink)] hover:text-[color:var(--color-paper)] transition-colors disabled:opacity-40 disabled:cursor-wait font-mono text-[11px] uppercase tracking-[0.22em]">
              <span>{create.isPending ? "Creando…" : "Crear evento"}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            <button type="button" onClick={() => router.back()}
              className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] hover:text-[color:var(--color-ink)] transition-colors border border-[color:var(--color-grey-300)] hover:border-[color:var(--color-ink)]">
              Cancelar
            </button>
          </div>
        </form>
      </div>

      {/* ── Live preview ── */}
      <div className="hidden xl:block" style={{ position: "sticky", top: "2rem", alignSelf: "start" }}>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-grey-700)] mb-4">Vista previa · igual que en el sitio</p>
        <div className="max-w-xs">
          <EventCard col={previewCol} preview />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-grey-500)] mt-3">Se actualiza mientras escribís</p>
      </div>
    </div>
  );
}
