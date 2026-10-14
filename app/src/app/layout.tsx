import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { brand } from "@/lib/brand";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], variable: "--f-display", display: "swap" });
const sans = Inter_Tight({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
// Variable font, no weight list: a fixed weight list breaks the Next 14 font download.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.site),
  title: { default: `${brand.name}: AI agents for tokenized stocks`, template: `%s · ${brand.name}` },
  description: `${brand.tagline}. Create, deploy and earn from AI agents for tokenized stocks, RWAs and on-chain finance. Pay per use in ${brand.token}: 60% to the creator, 30% burned.`,
  openGraph: { siteName: brand.name, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#0a0f0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <div className="backdrop" aria-hidden />
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
