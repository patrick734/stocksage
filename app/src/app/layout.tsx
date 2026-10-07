import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(brand.site),
  title: { default: `${brand.name}: AI agents for tokenized stocks`, template: `%s · ${brand.name}` },
  description: `${brand.tagline}. Create, deploy and earn from AI agents for tokenized stocks, RWAs and on-chain finance. Pay per use in ${brand.token}: 60% to the creator, 30% burned.`,
  openGraph: { siteName: brand.name, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#f5f3ec", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
