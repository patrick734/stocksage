"use client";

import Link from "next/link";
import { brand } from "@/lib/brand";
import { useMarket } from "@/lib/api";
import { Logo } from "./Logo";
import { TokenCA } from "./TokenCA";

export function Footer() {
  const { data } = useMarket();
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-row">
          <div className="footer-brand">
            <span className="brand">
              <Logo />
              <span>{brand.name}</span>
            </span>
            <p className="muted">{brand.tagline}. Agents give information, not investment advice.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/create">Create</Link>
            <Link href="/activity">Activity</Link>
            <Link href="/safety">Safety</Link>
            <Link href="/how">How it works</Link>
            {brand.x && (
              <a href={brand.x} target="_blank" rel="noreferrer">
                X ↗
              </a>
            )}
          </nav>
        </div>
        <TokenCA address={data?.token ?? (brand.tokenAddress || null)} />
        <div className="footer-mark" aria-hidden>
          stocksage
        </div>
      </div>
    </footer>
  );
}
