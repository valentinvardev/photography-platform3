"use client";

import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "~/trpc/react";
import { BibCheckoutModal } from "~/app/_components/FolderModal";
import { useCart } from "~/app/_components/CartContext";
import { Lightbox } from "~/app/_components/design/Lightbox";

// ─── Photo tile ───────────────────────────────────────────────────────────────
// URL is passed from parent batch query — no per-tile API call.
// memo'd so it only re-renders when its own props change (e.g. inCart flips).

function isTileVideo(mimeType: string | null | undefined, filename?: string): boolean {
  if (mimeType) return mimeType.startsWith("video/");
  if (!filename) return false;
  return /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(filename);
}

const PhotoTile = memo(function PhotoTile({
  photoId,
  bibNumber,
  index,
  price,
  inCart,
  isFuzzy,
  url,
  mimeType,
  filename,
  onOpenLightbox,
  onToggleCart,
}: {
  photoId: string;
  bibNumber: string | null;
  index: number;
  price: number;
  inCart: boolean;
  isFuzzy?: boolean;
  url: string | null;
  mimeType?: string | null;
  filename?: string;
  onOpenLightbox: (photoId: string, bibNumber: string | null, url: string) => void;
  onToggleCart: (photoId: string, bibNumber: string | null, url: string, price: number) => void;
}) {
  const isVideo = isTileVideo(mimeType, filename);
  return (
    <div
      className="group relative cursor-pointer"
      onClick={() => url && onOpenLightbox(photoId, bibNumber, url)}
    >
      {/* Photo */}
      <div
        className="relative overflow-hidden bg-[color:var(--color-grey-300)]"
        style={{ aspectRatio: "4/3" }}
      >
        {/* Bib / fuzzy badges */}
        {(bibNumber ?? isFuzzy) && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
            {bibNumber && (
              <span className="font-sans font-black text-[10px] uppercase tracking-[0.1em] bg-[#1A1A1A]/80 text-white px-2 py-0.5">
                #{bibNumber}
              </span>
            )}
            {isFuzzy && (
              <span className="font-sans font-black text-[10px] uppercase tracking-[0.1em] bg-[#FFE000] text-[#1A1A1A] px-2 py-0.5">
                Similar
              </span>
            )}
          </div>
        )}
        {/* Viewfinder corners */}
        <span className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-l border-t border-[color:var(--color-paper)] z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="pointer-events-none absolute top-0 right-0 w-3 h-3 border-r border-t border-[color:var(--color-paper)] z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="pointer-events-none absolute bottom-0 left-0 w-3 h-3 border-l border-b border-[color:var(--color-paper)] z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-r border-b border-[color:var(--color-paper)] z-10 opacity-0 group-hover:opacity-100 transition-opacity" />

        {!url ? (
          <div className="w-full h-full animate-pulse bg-[color:var(--color-grey-300)]" />
        ) : isVideo ? (
          <video
            src={url}
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(e) => void (e.currentTarget as HTMLVideoElement).play()}
            onMouseLeave={(e) => {
              const v = e.currentTarget as HTMLVideoElement;
              v.pause();
              v.currentTime = 0;
            }}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <img
            src={url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        )}

        {/* Price badge — always visible */}
        {price > 0 && (
          <div className="pointer-events-none absolute bottom-0 left-0 z-10 bg-[#1A1A1A]/80 px-2.5 py-1.5">
            <span className="font-sans font-black text-[11px] text-[#FFE000] tracking-[0.04em]">
              ${price.toLocaleString("es-AR")}
            </span>
          </div>
        )}

        {/* Cart button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!url) return;
            onToggleCart(photoId, bibNumber, url, price);
          }}
          disabled={!url}
          className={`absolute bottom-2 right-2 z-20 flex items-center gap-1.5 px-3 py-2 font-sans font-black uppercase tracking-[0.16em] text-[10px] transition-all duration-200 disabled:opacity-40 ${
            inCart
              ? "bg-white text-[#1A1A1A]"
              : "bg-[#FFE000] text-[#1A1A1A] hover:bg-[#D4BB00]"
          }`}
        >
          {inCart ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              En carrito
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              Agregar
            </>
          )}
        </button>
      </div>
    </div>
  );
});

// ─── Floating cart bar ────────────────────────────────────────────────────────

const CartBar = memo(function CartBar({
  count,
  total,
  onCheckout,
  onClear,
}: {
  count: number;
  total: number;
  onCheckout: () => void;
  onClear: () => void;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[min(560px,calc(100vw-32px))]"
        >
          <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 bg-[#1A1A1A] border border-[#FFE000]/30 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFE000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
              <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="font-sans font-black text-[13px] text-white truncate">
                {count} {count === 1 ? "foto" : "fotos"}{total > 0 ? ` · $${total.toLocaleString("es-AR")}` : ""}
              </p>
            </div>
            <button
              onClick={onClear}
              className="font-sans font-bold uppercase tracking-[0.16em] text-[10px] text-white/40 hover:text-white transition-colors px-2 shrink-0"
              aria-label="Vaciar"
            >
              ×
            </button>
            <button
              onClick={onCheckout}
              className="group inline-flex items-center gap-2 bg-[#FFE000] text-[#1A1A1A] px-5 py-2.5 font-sans font-black uppercase tracking-[0.16em] text-[11px] hover:bg-[#D4BB00] transition-colors duration-200 shrink-0"
            >
              Comprar
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// ─── Section label ────────────────────────────────────────────────────────────

const SectionLabel = memo(function SectionLabel({ label }: { index?: string; label: string }) {
  return (
    <div className="flex items-end justify-between mb-6 mt-2 gap-6">
      <div>
        <h3
          className="font-display font-black italic leading-[0.95] tracking-[-0.02em] text-[color:var(--color-ink)]"
          style={{ fontSize: "clamp(28px, 4vw, 48px)" }}
        >
          {label}
        </h3>
      </div>
      <div className="hidden md:block flex-1 h-px bg-[color:var(--color-grey-300)] mb-3" />
    </div>
  );
});

// ─── Analytics ───────────────────────────────────────────────────────────────

function trackEvent(type: string, collectionId: string) {
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, collectionId }),
  }).catch(() => null);
}

// ─── Main FolderBrowser ───────────────────────────────────────────────────────

export function FolderBrowser({
  collectionId,
  pricePerBib,
}: {
  collectionId: string;
  pricePerBib: number;
}) {
  const PAGE_SIZE = 20;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [galleryPage, setGalleryPage] = useState(0);
  const [galleryFilter, setGalleryFilter] = useState<"all" | "bib" | "no-bib">("all");
  const [faceActive, setFaceActive] = useState(false);
  const [faceStatus, setFaceStatus] = useState<
    "idle" | "uploading" | "done" | "no-face" | "error"
  >("idle");
  const [faceBibs, setFaceBibs] = useState<{ bib: string; photoIds: string[] }[] | null>(null);
  const [modal, setModal] = useState<{ bib: string; photoIds: string[]; allPhotoIds: string[]; totalPhotosInSearch: number } | null>(null);
  const [lightbox, setLightbox] = useState<{
    url: string;
    mimeType: string | null;
    filename: string | null;
    bibNumber: string | null;
    photoIds: string[];
    photoUrls: string[];
    currentIndex: number;
  } | null>(null);

  const { items: cartItems, inCart: isInCart, toggle: toggleCart, clear: clearCart } = useCart();
  const fileRef = useRef<HTMLInputElement>(null);

  // Stable ref for cartItems so the checkout listener never needs to re-subscribe
  const cartItemsRef = useRef(cartItems);
  useEffect(() => { cartItemsRef.current = cartItems; }, [cartItems]);

  // Stable cart-set ref for add-vs-remove detection without deps churn
  const cartSetRef = useRef(new Set<string>());
  useEffect(() => {
    cartSetRef.current = new Set(cartItems.map((i) => i.photoId));
  }, [cartItems]);

  // Track page visit on mount
  useEffect(() => { trackEvent("VISIT", collectionId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track bib searches
  useEffect(() => {
    if (debouncedSearch.length > 0) trackEvent("SEARCH_BIB", collectionId);
  }, [debouncedSearch, collectionId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);

  const { data: allPhotos, isLoading: galleryLoading } = api.photo.listAll.useQuery({
    collectionId,
  });

  const hasSearch = debouncedSearch.length > 0;
  const { data: searchData, isLoading: searchLoading } = api.photo.searchByBib.useQuery(
    { collectionId, bib: debouncedSearch },
    { enabled: hasSearch },
  );

  // Memoize derived search arrays to avoid recreating them every render
  const exactPhotos = useMemo(
    () => searchData?.exact.flatMap((g) => g.photos.map((p) => ({ ...p, isFuzzy: false as const }))) ?? [],
    [searchData],
  );
  const fuzzyPhotos = useMemo(
    () => searchData?.fuzzy.flatMap((g) => g.photos.map((p) => ({ ...p, isFuzzy: true as const }))) ?? [],
    [searchData],
  );
  const allSearchPhotos = useMemo(() => [...exactPhotos, ...fuzzyPhotos], [exactPhotos, fuzzyPhotos]);
  const noResults = hasSearch && !searchLoading && allSearchPhotos.length === 0;

  const showingFace = faceActive && faceStatus === "done" && faceBibs !== null;

  // Memoize price map — recomputes only when allPhotos or pricePerBib changes
  const priceMap = useMemo(
    () =>
      new Map<string, number>(
        (allPhotos ?? []).map((p) => [p.id, p.price ?? pricePerBib]),
      ),
    [allPhotos, pricePerBib],
  );

  // Memoize visible photos list — drives both the grid and the batch URL query
  const visiblePhotos = useMemo(() => {
    if (hasSearch) {
      return allSearchPhotos.map((p) => ({
        id: p.id,
        bibNumber: p.bibNumber,
        price: p.price ?? pricePerBib,
        isFuzzy: p.isFuzzy,
      }));
    }
    if (showingFace) {
      return (faceBibs ?? []).flatMap((g) =>
        g.photoIds.map((id) => ({
          id,
          bibNumber: g.bib,
          price: priceMap.get(id) ?? pricePerBib,
          isFuzzy: false as const,
        })),
      );
    }
    const base = allPhotos ?? [];
    const filtered =
      galleryFilter === "bib" ? base.filter((p) => p.bibNumber) :
      galleryFilter === "no-bib" ? base.filter((p) => !p.bibNumber) :
      base;
    const start = galleryPage * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE).map((p) => ({
      id: p.id,
      bibNumber: p.bibNumber,
      price: priceMap.get(p.id) ?? pricePerBib,
      isFuzzy: false as const,
    }));
  }, [hasSearch, allSearchPhotos, showingFace, faceBibs, allPhotos, priceMap, pricePerBib, galleryPage, PAGE_SIZE, galleryFilter]);

  // Single batch URL query — converts N per-tile queries into 1 request
  const visibleIds = useMemo(() => visiblePhotos.map((p) => p.id), [visiblePhotos]);
  const { data: urlData } = api.photo.getPreviewUrls.useQuery(
    { ids: visibleIds },
    { enabled: visibleIds.length > 0, staleTime: 50 * 60 * 1000 }, // signed URLs live for 1hr
  );
  const urlMap = useMemo(
    () => new Map(urlData?.map((u) => [u.id, u.url]) ?? []),
    [urlData],
  );
  const mimeTypeMap = useMemo(
    () => new Map(urlData?.map((u) => [u.id, { mimeType: u.mimeType ?? null, filename: u.filename }]) ?? []),
    [urlData],
  );

  // Stable refs for lightbox handler (avoids stale closure without dep churn)
  const allPhotosRef = useRef(allPhotos);
  useEffect(() => { allPhotosRef.current = allPhotos; }, [allPhotos]);
  const visiblePhotosRef = useRef(visiblePhotos);
  useEffect(() => { visiblePhotosRef.current = visiblePhotos; }, [visiblePhotos]);
  const mimeTypeMapRef = useRef(mimeTypeMap);
  useEffect(() => { mimeTypeMapRef.current = mimeTypeMap; }, [mimeTypeMap]);

  // Stable handlers — same reference across renders, so memo'd tiles don't re-render
  const handleOpenLightbox = useCallback((photoId: string, bibNumber: string | null, url: string) => {
    const ap = allPhotosRef.current;
    const vp = visiblePhotosRef.current;
    const sameBibIds =
      bibNumber && ap
        ? ap.filter((ph) => ph.bibNumber === bibNumber).map((ph) => ph.id)
        : [photoId];
    const idx = vp.findIndex((v) => v.id === photoId);
    const meta = mimeTypeMapRef.current.get(photoId);
    setLightbox({
      url,
      mimeType: meta?.mimeType ?? null,
      filename: meta?.filename ?? null,
      bibNumber,
      photoIds: sameBibIds,
      photoUrls: [url],
      currentIndex: idx >= 0 ? idx : 0,
    });
  }, []);

  const handleToggleCart = useCallback(
    (photoId: string, bibNumber: string | null, url: string, price: number) => {
      const adding = !cartSetRef.current.has(photoId);
      toggleCart({ photoId, bibNumber, url, price });
      if (adding) trackEvent("CART_ADD", collectionId);
    },
    [toggleCart, collectionId],
  );

  const cartCheckout = useCallback(() => {
    const items = cartItemsRef.current;
    if (items.length === 0) return;
    const allBibs = [...new Set(items.map((i) => i.bibNumber).filter(Boolean))];
    const bib = allBibs.length === 1 ? (allBibs[0] ?? "") : "";
    const allVisible = visiblePhotosRef.current.map((p) => p.id);
    setModal({ bib, photoIds: items.map((i) => i.photoId), allPhotoIds: allVisible, totalPhotosInSearch: allVisible.length });
  }, []);

  // Checkout event listener — stable, never re-subscribes on cart changes
  useEffect(() => {
    const handler = () => cartCheckout();
    window.addEventListener("ivana:open-checkout", handler);
    return () => window.removeEventListener("ivana:open-checkout", handler);
  }, [cartCheckout]);

  const handleFaceUpload = async (file: File) => {
    setFaceStatus("uploading");
    try {
      let base64 = "";
      try {
        base64 = await new Promise<string>((res, rej) => {
          const img = new Image();
          const objectUrl = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const MAX = 1200;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext("2d");
            if (!ctx) { rej(new Error("canvas-ctx")); return; }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
            const b64 = dataUrl.split(",")[1];
            if (!b64) { rej(new Error("canvas-encode")); return; }
            res(b64);
          };
          img.onerror = (e) => { URL.revokeObjectURL(objectUrl); rej(e); };
          img.src = objectUrl;
        });
      } catch (canvasErr) {
        console.warn("[face-search] canvas compress failed:", canvasErr);
        base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => {
            const b64 = (r.result as string).split(",")[1];
            b64 ? res(b64) : rej(new Error("read-encode"));
          };
          r.onerror = rej;
          r.readAsDataURL(file);
        });
      }

      const resp = await fetch("/api/face-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, collectionId }),
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const json = (await resp.json()) as {
        groups: { bib: string; photoIds: string[] }[];
        noFaceDetected?: boolean;
      };
      if (json.noFaceDetected) {
        setFaceStatus("no-face");
        return;
      }
      setFaceBibs(json.groups);
      setFaceStatus("done");
      setFaceActive(true);
      trackEvent("SEARCH_FACE", collectionId);
    } catch (err) {
      console.error("[face-search] upload error:", err);
      setFaceStatus("error");
    }
  };

  const GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10";

  return (
    <section id="search" className="max-w-[1600px] mx-auto px-6 md:px-10 py-16 pb-32">
      {/* ── Search panel ───────────────────────────────────── */}
      {/* ── Search panel ───────────────────────────────────── */}
      <div className="mb-20">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-[color:var(--color-grey-300)]">
          <span className="block w-6 h-[2px] bg-[#FFE000]" />
          <span className="font-sans font-bold uppercase tracking-[0.28em] text-[#FFE000] text-[10px]">
            Buscá tus fotos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start">
          {/* Dorsal input */}
          <div>
            <label className="block font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-[#FFE000]/70 mb-4">
              Número de dorsal
            </label>
            <div className="flex items-end gap-3 border-b-2 border-[#FFE000]/35 pb-3 focus-within:border-[#FFE000] transition-colors duration-200 h-[76px] md:h-[96px]">
              <input
                type="text"
                inputMode="numeric"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="1042"
                className="flex-1 h-full bg-transparent border-0 outline-none font-display font-extrabold italic text-[56px] md:text-[80px] leading-none tracking-[-0.02em] text-white placeholder:text-[#FFE000]/20"
              />
              <button
                onClick={() => setSearch("")}
                className={`font-sans font-bold uppercase tracking-[0.22em] text-[11px] text-white/30 hover:text-white transition-all shrink-0 mb-2 ${search ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                ×
              </button>
            </div>
            <p className="mt-3 font-sans text-[13px] text-white/35 leading-[1.5]">
              Las vistas previas incluyen marca de agua.
            </p>
          </div>

          {/* Face search */}
          <div className="flex flex-col justify-between gap-6">
            <div>
              <label className="block font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/35 mb-4">
                Búsqueda por selfie
              </label>
              <p className="font-sans text-[14px] leading-[1.65] text-white/45">
                Subí una foto tuya y encontramos tus capturas por reconocimiento facial.
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFaceUpload(f);
              }}
            />

            <button
              onClick={() => {
                if (faceStatus === "uploading") return;
                if (faceStatus === "done" || faceStatus === "error" || faceStatus === "no-face") {
                  setFaceStatus("idle");
                  setFaceBibs(null);
                  if (fileRef.current) fileRef.current.value = "";
                }
                fileRef.current?.click();
              }}
              disabled={faceStatus === "uploading"}
              className="group inline-flex items-center gap-3 bg-[#FFE000] text-[#1A1A1A] px-6 py-3.5 font-sans font-black uppercase tracking-[0.18em] text-[11px] hover:bg-[#D4BB00] transition-colors duration-200 disabled:opacity-50 self-start"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M2 9V5a2 2 0 012-2h4"/>
                <path d="M16 3h4a2 2 0 012 2v4"/>
                <path d="M22 15v4a2 2 0 01-2 2h-4"/>
                <path d="M8 21H4a2 2 0 01-2-2v-4"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {faceStatus === "uploading" ? "Analizando…" : "Subir selfie"}
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>

            {/* Status feedback */}
            {faceStatus === "done" && (
              <p className="font-sans font-bold uppercase tracking-[0.22em] text-[11px] text-white/50">
                {faceBibs?.length
                  ? `${faceBibs.length} coincidencia${faceBibs.length !== 1 ? "s" : ""}`
                  : "Sin coincidencias"}{" "}
                ·{" "}
                <button
                  onClick={() => { setFaceStatus("idle"); setFaceBibs(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-[#FFE000] hover:underline"
                >
                  otra foto
                </button>
              </p>
            )}
            {faceStatus === "no-face" && (
              <p className="font-sans font-bold uppercase tracking-[0.22em] text-[11px] text-[#FFE000]">
                No detectamos rostro ·{" "}
                <button onClick={() => { setFaceStatus("idle"); if (fileRef.current) fileRef.current.value = ""; }} className="underline underline-offset-4">
                  intentar otra
                </button>
              </p>
            )}
            {faceStatus === "error" && (
              <p className="font-sans font-bold uppercase tracking-[0.22em] text-[11px] text-[#FFE000]">
                Error al procesar ·{" "}
                <button onClick={() => { setFaceStatus("idle"); if (fileRef.current) fileRef.current.value = ""; }} className="underline underline-offset-4">
                  reintentar
                </button>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Face results ───────────────────────────────────── */}
      {showingFace && faceBibs && faceBibs.length > 0 && (
        <div className="mb-20">
          <SectionLabel label="Reconocimiento facial." />
          <div className={GRID}>
            {faceBibs.flatMap((g, gi) =>
              g.photoIds.map((id, pi) => (
                <PhotoTile
                  key={id}
                  photoId={id}
                  bibNumber={g.bib}
                  index={gi * 100 + pi}
                  price={priceMap.get(id) ?? pricePerBib}
                  inCart={isInCart(id)}
                  url={urlMap.get(id) ?? null}
                  mimeType={mimeTypeMap.get(id)?.mimeType}
                  filename={mimeTypeMap.get(id)?.filename}
                  onOpenLightbox={handleOpenLightbox}
                  onToggleCart={handleToggleCart}
                />
              )),
            )}
          </div>
        </div>
      )}

      {/* ── Bib search results ─────────────────────────────── */}
      {hasSearch && (
        <div className="mb-20">
          {searchLoading && (
            <div className={GRID}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-[color:var(--color-grey-300)] animate-pulse"
                  style={{ aspectRatio: "4/3" }}
                />
              ))}
            </div>
          )}
          {noResults && (
            <div className="border border-dashed border-[color:var(--color-grey-300)] py-24 text-center">
              <p className="eyebrow mb-3">Sin resultados</p>
              <p className="font-display italic text-[44px] leading-tight text-[color:var(--color-ink)]">
                #{debouncedSearch} no apareció.
              </p>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)]">
                Verificá el número o usá la búsqueda por selfie
              </p>
            </div>
          )}
          {!searchLoading && allSearchPhotos.length > 0 && (
            <>
              <SectionLabel label={`Dorsal #${debouncedSearch}.`} />
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)] mb-8">
                {exactPhotos.length} {exactPhotos.length === 1 ? "foto" : "fotos"}
                {fuzzyPhotos.length > 0 &&
                  ` · ${fuzzyPhotos.length} similar${fuzzyPhotos.length !== 1 ? "es" : ""}`}
              </p>
              <div className={GRID}>
                {allSearchPhotos.map((p, i) => (
                  <PhotoTile
                    key={p.id}
                    photoId={p.id}
                    bibNumber={p.bibNumber}
                    index={i}
                    price={p.price ?? pricePerBib}
                    inCart={isInCart(p.id)}
                    isFuzzy={p.isFuzzy}
                    url={urlMap.get(p.id) ?? null}
                    mimeType={mimeTypeMap.get(p.id)?.mimeType}
                    filename={mimeTypeMap.get(p.id)?.filename}
                    onOpenLightbox={handleOpenLightbox}
                    onToggleCart={handleToggleCart}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Full gallery ───────────────────────────────────── */}
      {!hasSearch && !showingFace && (
        <>
          {galleryLoading ? (
            <div className={GRID}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-[color:var(--color-grey-300)] animate-pulse"
                  style={{ aspectRatio: "4/3" }}
                />
              ))}
            </div>
          ) : allPhotos && allPhotos.length > 0 ? (
            <>
              <SectionLabel label="Fotos del evento." />
              <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)]">
                  {String(allPhotos.length).padStart(3, "0")} fotografías · clic para previsualizar
                </p>
                <div className="flex items-center gap-px">
                  {(["all", "bib", "no-bib"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => { setGalleryFilter(f); setGalleryPage(0); }}
                      className={`px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] border transition-colors ${
                        galleryFilter === f
                          ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-paper)]"
                          : "border-[color:var(--color-grey-300)] text-[color:var(--color-grey-500)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)]"
                      }`}
                    >
                      {f === "all" ? "Todas" : f === "bib" ? "Con dorsal" : "Sin dorsal"}
                    </button>
                  ))}
                </div>
              </div>
              <div className={GRID}>
                {visiblePhotos.map((p, i) => (
                  <PhotoTile
                    key={p.id}
                    photoId={p.id}
                    bibNumber={p.bibNumber}
                    index={galleryPage * PAGE_SIZE + i}
                    price={p.price}
                    inCart={isInCart(p.id)}
                    url={urlMap.get(p.id) ?? null}
                    mimeType={mimeTypeMap.get(p.id)?.mimeType}
                    filename={mimeTypeMap.get(p.id)?.filename}
                    onOpenLightbox={handleOpenLightbox}
                    onToggleCart={handleToggleCart}
                  />
                ))}
              </div>
              {allPhotos.length > PAGE_SIZE && (
                <div className="mt-12 flex items-center justify-between border-t border-[color:var(--color-grey-300)] pt-6">
                  <button
                    onClick={() => { setGalleryPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    disabled={galleryPage === 0}
                    className="group inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-ink)] disabled:text-[color:var(--color-grey-400)] disabled:pointer-events-none transition-colors"
                  >
                    <span className="transition-transform group-hover:-translate-x-1">←</span>
                    <span>Anterior</span>
                  </button>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)]">
                    {galleryPage + 1} / {Math.ceil(allPhotos.length / PAGE_SIZE)}
                  </p>
                  <button
                    onClick={() => { setGalleryPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    disabled={(galleryPage + 1) * PAGE_SIZE >= allPhotos.length}
                    className="group inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-ink)] disabled:text-[color:var(--color-grey-400)] disabled:pointer-events-none transition-colors"
                  >
                    <span>Siguiente</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="border border-dashed border-[color:var(--color-grey-300)] py-24 text-center">
              <p className="eyebrow mb-3">Estado</p>
              <p className="font-display italic text-[44px] leading-tight">Próximamente.</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-grey-500)]">
                Las fotografías aparecerán acá
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Lightbox ───────────────────────────────────────── */}
      <Lightbox
        open={lightbox !== null}
        url={lightbox?.url ?? null}
        mimeType={lightbox?.mimeType ?? null}
        filename={lightbox?.filename ?? null}
        onClose={() => setLightbox(null)}
        caption={
          lightbox && (
            <div className="flex items-center justify-between gap-4 max-w-[1600px] mx-auto">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-paper)]/60">
                  {lightbox.bibNumber ? "Dorsal" : "Sin dorsal"}
                </p>
                <p className="font-display italic text-[24px] text-[color:var(--color-paper)]">
                  {lightbox.bibNumber ? `#${lightbox.bibNumber}` : "—"}
                </p>
              </div>
              <button
                onClick={() => {
                  setModal({
                    bib: lightbox.bibNumber ?? "",
                    photoIds: lightbox.photoIds,
                    allPhotoIds: lightbox.photoIds,
                    totalPhotosInSearch: lightbox.photoIds.length,
                  });
                  setLightbox(null);
                }}
                className="group inline-flex items-center gap-3 border border-[color:var(--color-paper)] bg-[color:var(--color-paper)] text-[color:var(--color-ink)] px-5 py-3 hover:bg-transparent hover:text-[color:var(--color-paper)] transition-colors"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.22em]">Comprar foto</span>
                <span className="font-mono text-[10px] tracking-[0.22em] transition-transform group-hover:translate-x-1">→</span>
              </button>
            </div>
          )
        }
      />

      {/* ── Floating cart bar ──────────────────────────────── */}
      <CartBar
        count={cartItems.length}
        total={cartItems.reduce((sum, i) => sum + i.price, 0)}
        onCheckout={cartCheckout}
        onClear={clearCart}
      />

      {/* ── Checkout modal ─────────────────────────────────── */}
      {modal && (
        <BibCheckoutModal
          bib={modal.bib}
          photoIds={modal.photoIds}
          allPhotoIds={modal.allPhotoIds}
          totalPhotosInSearch={modal.totalPhotosInSearch}
          collectionId={collectionId}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}
