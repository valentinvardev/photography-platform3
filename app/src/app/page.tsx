import Image from "next/image";
import Link from "next/link";
import { api } from "~/trpc/server";
import { EventCard } from "~/app/_components/EventCard";
import { Nav } from "~/app/_components/design/Nav";
import { Footer } from "~/app/_components/design/Footer";
import { Hero } from "~/app/_components/design/Hero";
import { Reveal } from "~/app/_components/design/Reveal";

export default async function HomePage() {
  const rawCollections = await api.collection.list();
  const collections = rawCollections.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    slug: c.slug,
    coverUrl: c.coverUrl,
    bannerUrl: c.bannerUrl,
    bannerFocalY: c.bannerFocalY,
    logoUrl: c.logoUrl,
    eventDate: c.eventDate,
    _count: c._count,
  }));

  return (
    <main className="relative bg-[color:var(--color-paper)] text-[color:var(--color-ink)]">
      <Nav />
      <Hero collectionsCount={collections.length} />

      {/* ════════ EVENTOS ════════ */}
      <section id="eventos" data-cursor="light" className="px-6 md:px-10 pt-16 pb-32">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-16 md:mb-20 pb-8 border-b border-[color:var(--color-grey-300)]">
            <Reveal as="h2" delay={0.05}>
              <span
                className="font-display font-extrabold italic leading-[0.88] tracking-[-0.02em] block text-white"
                style={{ fontSize: "clamp(40px, 7vw, 100px)" }}
              >
                Eventos activos.
              </span>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="font-sans font-bold uppercase tracking-[0.22em] text-[11px] text-white/30 md:text-right">
                {String(collections.length).padStart(2, "0")} disponibles
              </p>
            </Reveal>
          </div>

          {collections.length === 0 ? (
            <div className="border border-dashed border-[color:var(--color-grey-300)] py-32 px-8 text-center">
              <p className="font-sans font-bold uppercase tracking-[0.28em] text-[10px] text-[#FFE000] mb-4">Próximamente</p>
              <p className="font-display font-extrabold italic text-[44px] leading-tight text-white">
                Cargando eventos.
              </p>
              <p className="mt-3 font-sans text-[13px] text-white/40">
                Los próximos eventos aparecerán aquí
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-16">
              {collections.map((col, i) => (
                <Reveal key={col.id} variant="lift" delay={i * 0.06}>
                  <EventCard col={col} index={i} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ════════ SPONSORS ════════ */}
      <section className="px-6 md:px-10 py-14 border-t border-[color:var(--color-grey-300)]">
        <div className="max-w-[1600px] mx-auto">
          <p className="font-sans font-bold uppercase tracking-[0.28em] text-[11px] text-[color:var(--color-ink)]/40 mb-10 text-center">
            Sponsors
          </p>
          <div className="flex items-center justify-center gap-16 md:gap-28 flex-wrap">
            {/* Sponsor 1 */}
            <div className="w-36 md:w-48 h-16 border border-dashed border-[color:var(--color-grey-300)] flex items-center justify-center">
              <span className="font-sans font-bold text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-400)]">
                Logo sponsor
              </span>
            </div>
            {/* Sponsor 2 */}
            <div className="w-36 md:w-48 h-16 border border-dashed border-[color:var(--color-grey-300)] flex items-center justify-center">
              <span className="font-sans font-bold text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-grey-400)]">
                Logo sponsor
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ YELLOW CTA FULL BLEED ════════ */}
      <section
        data-cursor="dark"
        className="relative px-6 md:px-10 py-32 md:py-40 bg-[#FFE000] text-[#1A1A1A] overflow-hidden"
      >
        {/* Subtle diagonal lines */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-[1px] bg-[#1A1A1A]/08"
              style={{ left: `${15 + i * 18}%`, transform: "skewX(-12deg)" }}
            />
          ))}
        </div>

        <div className="relative max-w-[1600px] mx-auto">
          <Reveal as="p" className="font-sans font-bold uppercase tracking-[0.28em] text-[10px] text-[#1A1A1A]/50 mb-8">
            Cómo funciona
          </Reveal>

          <Reveal>
            <h2
              className="font-display font-extrabold italic leading-[0.85] tracking-[-0.03em] text-[#1A1A1A]"
              style={{ fontSize: "clamp(52px, 10vw, 160px)" }}
            >
              Tu carrera.<br />
              <span className="text-white">Tu imagen.</span>
            </h2>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 max-w-3xl">
            {[
              { n: "01", title: "Elegí tu evento", body: "Encontrá la carrera o competencia en la que participaste." },
              { n: "02", title: "Ingresá tu dorsal", body: "O subí una selfie para que te encontremos por reconocimiento facial." },
              { n: "03", title: "Descargá tus fotos", body: "Elegís las que te gustan y pagás solo esas." },
            ].map((s) => (
              <Reveal key={s.n} delay={Number(s.n) * 0.07}>
                <div>
                  <span className="block font-display font-extrabold italic text-[48px] leading-none text-white mb-3">{s.n}</span>
                  <p className="font-sans font-black uppercase tracking-[0.16em] text-[12px] text-[#1A1A1A] mb-2">{s.title}</p>
                  <p className="font-sans font-medium text-[14px] leading-[1.65] text-[#1A1A1A]">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.25}>
            <div className="mt-14 flex flex-wrap items-center gap-5">
              <Link
                href="#eventos"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#1A1A1A] text-[#FFE000] font-sans font-black text-[11px] uppercase tracking-[0.22em] hover:bg-[#0D0D0D] transition-colors duration-200"
              >
                Ver eventos ↗
              </Link>
              <Link
                href="#contacto"
                className="font-sans font-bold text-[11px] uppercase tracking-[0.22em] text-[#1A1A1A]/50 hover:text-[#1A1A1A] transition-colors"
              >
                ¿Organizás un evento? →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════ MERCADOPAGO STRIP ════════ */}
      <section data-cursor="dark" className="px-6 md:px-10 py-20 bg-white">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
          <div>
            <p className="font-sans font-bold uppercase tracking-[0.28em] text-[10px] text-[#1A1A1A]/40 mb-3">
              Pagos
            </p>
            <p className="font-display font-extrabold italic text-[28px] md:text-[38px] leading-[1.0] tracking-[-0.02em] text-[#1A1A1A]">
              Pagá seguro.<br />
              <span className="text-[#666666]">Descargá al instante.</span>
            </p>
            <p className="mt-4 font-sans text-[14px] leading-[1.65] text-[#666666] max-w-sm">
              Procesamos tu pago con MercadoPago. Tarjeta de crédito, débito o transferencia. Sin datos guardados, sin sorpresas.
            </p>
          </div>
          <Reveal>
            <Image
              src="/mercadopago.svg"
              alt="MercadoPago"
              width={560}
              height={112}
              className="h-24 w-auto shrink-0"
            />
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
