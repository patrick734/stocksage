"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { explorerAddress } from "@/lib/chains";
import { TokenCA } from "@/components/TokenCA";
import { brand } from "@/lib/brand";

type Safety = { live: boolean; token?: string | null; checks: { ok: boolean; label: string; detail: string }[]; addresses?: Record<string, string> };

export default function SafetyPage() {
  const { data, error, isLoading } = useQuery({ queryKey: ["safety"], queryFn: () => api<Safety>("/api/safety") });
  return (
    <div className="wrap page narrow">
      <h1>Safety</h1>
      <p className="lede">Read from the contracts on Robinhood Chain each time you open this page.</p>
      {isLoading && <div className="card skeleton tall" />}
      {error && <p className="tx-status error">{(error as Error).message}</p>}
      {data && !data.live && <p className="muted">The contracts are not deployed yet. These checks appear here once they are.</p>}
      <ul className="safety">
        {data?.checks.map((c) => (
          <li key={c.label} className={`card ${c.ok ? "ok" : "bad"}`}>
            <span className="mark" aria-hidden>{c.ok ? "✓" : "!"}</span>
            <div>
              <b>{c.label}</b>
              <p className="muted small">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <TokenCA address={data?.token ?? (brand.tokenAddress || null)} />
      {data?.addresses && (
        <dl className="kv addresses">
          {Object.entries(data.addresses).map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>
                <a href={explorerAddress(v)} target="_blank" rel="noreferrer">
                  <code>{v}</code> ↗
                </a>
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
