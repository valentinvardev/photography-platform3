import Link from "next/link";

export function Footer() {
  return (
    <footer
      id="contacto"
      data-cursor="dark"
      className="relative bg-[#060606] text-[color:var(--color-ink)] pt-24 pb-10 px-6 md:px-10 overflow-hidden"
    >
      {/* yellow top accent */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#FFE000]" />

      {/* huge SINCHI watermark */}
      <div className="pointer-events-none select-none absolute inset-x-0 bottom-[-3vw] flex justify-center overflow-hidden">
        <span
          className="font-display font-black italic leading-[0.8]"
          style={{ fontSize: "clamp(80px, 20vw, 320px)", color: "rgba(255,224,0,0.04)", letterSpacing: "-0.02em" }}
        >
          SINCHI
        </span>
      </div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-6 max-w-[1600px] mx-auto">

        {/* brand column */}
        <div className="md:col-span-6">
          <div className="flex items-baseline gap-1 mb-6">
            <span className="font-display font-black italic text-[28px] leading-none text-[#FFE000]">SINCHI</span>
            <span className="font-display font-black italic text-[16px] leading-none text-[#FFE000]/50">®</span>
          </div>
          <p className="font-display font-bold italic text-[26px] md:text-[32px] leading-[1.05] text-white">
            Cada esfuerzo<br />
            <span className="text-white/35">merece una foto.</span>
          </p>
          <p className="mt-5 font-sans text-[14px] leading-[1.7] text-white/40 max-w-xs">
            Fotografía de alto rendimiento para eventos de MTB, ruta y trail. Encontrá tus fotos por dorsal o por cara.
          </p>
        </div>

        {/* right columns */}
        <div className="md:col-span-5 md:col-start-8 flex flex-col gap-10">

          {/* contact — fila de iconos */}
          <div>
            <p className="font-sans font-bold uppercase tracking-[0.28em] text-[10px] text-[#FFE000] mb-5">
              Contacto
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="https://wa.me/5493513546716"
                target="_blank"
                rel="noopener"
                className="flex items-center gap-2.5 border border-white/10 px-4 py-2.5 hover:border-[#FFE000] hover:text-[#FFE000] transition-colors duration-200 group"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0 opacity-60 group-hover:opacity-100">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span className="font-sans font-bold text-[12px] uppercase tracking-[0.16em]">WhatsApp</span>
              </a>

              <a
                href="mailto:hola@sinchi.com.ar"
                className="flex items-center gap-2.5 border border-white/10 px-4 py-2.5 hover:border-[#FFE000] hover:text-[#FFE000] transition-colors duration-200 group"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="shrink-0 opacity-60 group-hover:opacity-100">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="M2 7l10 7 10-7"/>
                </svg>
                <span className="font-sans font-bold text-[12px] uppercase tracking-[0.16em]">Email</span>
              </a>

              <a
                href="https://www.instagram.com/sinchi.foto"
                target="_blank"
                rel="noopener"
                className="flex items-center gap-2.5 border border-white/10 px-4 py-2.5 hover:border-[#FFE000] hover:text-[#FFE000] transition-colors duration-200 group"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0 opacity-60 group-hover:opacity-100">
                  <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
                </svg>
                <span className="font-sans font-bold text-[12px] uppercase tracking-[0.16em]">@sinchi.foto</span>
              </a>
            </div>
          </div>

          {/* legal */}
          <div>
            <p className="font-sans font-bold uppercase tracking-[0.28em] text-[10px] text-white/25 mb-4">
              Legal
            </p>
            <div className="flex items-center gap-5">
              <Link href="/terminos" className="font-sans font-bold uppercase tracking-[0.16em] text-[11px] text-white/30 hover:text-white transition-colors">
                Términos
              </Link>
              <Link href="/privacidad" className="font-sans font-bold uppercase tracking-[0.16em] text-[11px] text-white/30 hover:text-white transition-colors">
                Privacidad
              </Link>
              <Link href="/admin" className="font-sans font-bold uppercase tracking-[0.16em] text-[11px] text-white/15 hover:text-white/30 transition-colors">
                Admin
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* bottom strip */}
      <div className="relative z-10 mt-16 pt-6 border-t border-[color:var(--color-grey-300)] flex flex-col md:flex-row items-start md:items-center justify-between gap-3 max-w-[1600px] mx-auto">
        <p className="font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/20">
          © {new Date().getFullYear()} · SINCHI® · Argentina
        </p>
        <p className="font-sans font-bold uppercase tracking-[0.22em] text-[10px] text-white/20">
          Pagos vía MercadoPago
        </p>
      </div>
    </footer>
  );
}
