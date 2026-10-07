"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { brand } from "@/lib/brand";
import { ConnectButton } from "./ConnectButton";
import { Logo } from "./Logo";

const NAV = [
  ["/marketplace", "Marketplace"],
  ["/create", "Create agent"],
  ["/dashboard", "Dashboard"],
  ["/activity", "Activity"],
  ["/how", "How it works"],
] as const;

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="header">
      <div className="wrap header-row">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <Logo />
          <span>{brand.name}</span>
        </Link>
        <nav className={`nav ${open ? "open" : ""}`} aria-label="Main">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={path.startsWith(href) ? "active" : ""} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-end">
          <ConnectButton />
          <button className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
