import "~/styles/globals.css";

import { type Metadata } from "next";
import { Kanit, Space_Mono, Barlow } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import { Grain } from "~/app/_components/design/Grain";

export const metadata: Metadata = {
  title: "SINCHI® — Fotografía Deportiva",
  description: "Mirada poderosa. Fotografía de montaña para MTB, ruta y trail. Encontrá tus fotos por número de dorsal.",
  icons: [{ rel: "icon", url: "/sinchi-icon.png" }],
};

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-barlow",
  display: "swap",
});

const kanit = Kanit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-kanit",
  display: "swap",
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-mono",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${kanit.variable} ${mono.variable} ${barlow.variable}`}>
      <body className="bg-[color:var(--color-black)] text-[color:var(--color-white)] antialiased overflow-x-hidden">
        <TRPCReactProvider>
          {children}
        </TRPCReactProvider>
        <Grain />
      </body>
    </html>
  );
}
