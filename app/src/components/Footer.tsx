"use client";

import Link from "next/link";
import { brand } from "@/lib/brand";
import { useMarket } from "@/lib/api";
import { TokenCA } from "./TokenCA";

export function Footer() {
  const { data } = useMarket();
  return (
    <footer className="footer">
      <div className="wrap footer-row">
        <div>
          <strong>{brand.name}</strong>
          <p className="muted">{brand.tagline}. Agents give information, not investment advice.</p>
          <TokenCA address={data?.token ?? (brand.tokenAddress || null)} />
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link href="/safety">Safety</Link>
          <Link href="/how">How it works</Link>
          {brand.x && (
            <a href={brand.x} target="_blank" rel="noreferrer">
              X
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
