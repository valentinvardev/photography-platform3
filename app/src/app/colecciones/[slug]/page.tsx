import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { api } from "~/trpc/server";
import { FolderBrowser } from "~/app/_components/FolderBrowser";
import { CartProvider } from "~/app/_components/CartContext";
import { NavCartButton } from "~/app/_components/NavCartButton";
import { Footer } from "~/app/_components/design/Footer";
import { CollectionHero } from "~/app/_components/design/CollectionHero";
import { MobileNav } from "~/app/_components/MobileNav";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await api.collection.getBySlug({ slug });
  if (!collection) notFound();

  const bannerSrc = collection.bannerUrl ?? collection.coverUrl;

  const dateStr = collection.eventDate
    ? new Intl.DateTimeFormat("es-AR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(collection.eventDate))
    : null;

  const price = Number(collection.pricePerBib);

  return (
    <CartProvider>
      <main data-cursor="light" className="relative bg-[color:var(--color-paper)] text-[color:var(--color-ink)] min-h-screen">
        {/* Compact, page-specific nav */}
        <nav className="sticky top-0 z-50 bg-[#1A1A1A]/90 backdrop-blur-xl border-b border-[color:var(--color-grey-300)]">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FFE000]" />
          <div className="max-w-[1600px] mx-auto px-8 md:px-14 h-16 flex items-center gap-6">
            <Link
              href="/"
              className="font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/50 hover:text-white transition-colors flex items-center gap-2 shrink-0"
            >
              <span aria-hidden>←</span>
              Eventos
            </Link>
            <span className="font-display font-extrabold italic text-[18px] hidden sm:inline shrink-0 text-[#FFE000]">
              SINCHI®
            </span>
            <span
              className="font-sans font-bold text-[12px] text-white/35 truncate"
              title={collection.title}
            >
              / {collection.title}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <NavCartButton price={price} />
              <MobileNav />
            </div>
          </div>
        </nav>

        {/* Editorial hero */}
        <CollectionHero
          title={collection.title}
          dateStr={dateStr}
          description={collection.description}
          bannerSrc={bannerSrc}
          logoUrl={collection.logoUrl}
          photoCount={collection._count.photos}
          price={price}
          bannerFocalY={collection.bannerFocalY ?? 50}
        />

        {/* Gallery + search */}
        <FolderBrowser collectionId={collection.id} pricePerBib={price} />

        {/* MercadoPago strip */}
        <section className="px-6 md:px-10 py-24 bg-white">
          <div className="max-w-[1600px] mx-auto flex flex-col items-center text-center gap-10">
            <p className="font-sans font-bold uppercase tracking-[0.28em] text-[10px] text-[#1A1A1A]/50">
              Pagos seguros
            </p>
            <Image
              src="/mercadopago.svg"
              alt="MercadoPago"
              width={500}
              height={100}
              className="h-20 w-auto"
            />
            <p className="font-display font-bold italic text-[26px] md:text-[36px] leading-[1.05] tracking-[-0.02em] text-[#1A1A1A]">
              Procesado de forma segura.<br />
              <span className="text-[#666666]">Tarjeta, transferencia o efectivo.</span>
            </p>
          </div>
        </section>

        <Footer />
      </main>
    </CartProvider>
  );
}
