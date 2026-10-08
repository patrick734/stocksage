"use client";

import Link from "next/link";
import { AgentCard } from "@/components/AgentCard";
import { TokenCA } from "@/components/TokenCA";
import { useMarket } from "@/lib/api";
import { brand } from "@/lib/brand";
import { tokens } from "@/lib/money";

export default function Home() {
  const { data } = useMarket();
  const agents = data?.agents.filter((a) => a.active && !a.blocked) ?? [];
  const featured = [...agents].sort((a, b) => Number(b.seed) - Number(a.seed) || b.usesSold - a.usesSold).slice(0, 6);
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <span className="eyebrow">Built for Robinhood Chain · Powered by {brand.token}</span>
          <h1>AI agents for tokenized stocks, paid per use.</h1>
          <p className="lede">
            Ask an agent about a stock, a tokenized fund or a move on-chain. Build your own agent, set its price, and earn every time someone uses it.
          </p>
          <div className="hero-cta">
            <Link href="/agent/1" className="btn btn-primary big">
              Talk to Sage, free
            </Link>
            <Link href="/marketplace" className="btn big">
              Explore agents
            </Link>
            <Link href="/create" className="btn big">
              Create an agent
            </Link>
          </div>
          <TokenCA address={data?.token ?? (brand.tokenAddress || null)} />
        </div>
      </section>

      <section className="wrap stats">
        <Stat label="Agents" value={data ? String(data.agents.length) : "…"} />
        <Stat label="Uses sold" value={data ? data.totals.uses.toLocaleString() : "…"} />
        <Stat label={`${brand.token} burned`} value={data ? tokens(data.totals.burned) : "…"} />
        <Stat label="Creator share" value="60%" />
      </section>

      <section className="wrap section">
        <h2>How the economy works</h2>
        <div className="steps">
          <Step n="01" title="Creators deploy agents">
            Write an agent&apos;s purpose, personality and instructions, then deploy it on-chain for a small {brand.token} fee. 80% of that fee is burned.
          </Step>
          <Step n="02" title="Users pay per use">
            Find an agent in the marketplace and buy uses in {brand.token}, at a price the creator sets in ETH. One use is one reply.
          </Step>
          <Step n="03" title="Creators earn, supply burns">
            Every payment is split on-chain in the same transaction: 60% to the creator, 30% burned for good, 10% to the treasury.
          </Step>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Featured agents</h2>
          <Link href="/marketplace">All agents →</Link>
        </div>
        <div className="grid">
          {featured.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
          {!data && Array.from({ length: 3 }, (_, i) => <div key={i} className="card agent-card skeleton" />)}
        </div>
        {data && !data.live && <p className="muted small">Preview: the contracts are not deployed yet, so these are the agents StockSage launches with.</p>}
      </section>

      <section className="wrap section trust">
        <h2>Rules in code, not promises</h2>
        <ul className="checks">
          <li>The wallet that deployed StockSage holds no power: every change waits 48 hours in a public timelock.</li>
          <li>The 60 / 30 / 10 split is a constant in the contract. No one can change it or move anyone&apos;s earnings.</li>
          <li>Each agent&apos;s configuration is hashed on-chain, so anyone can check the agent you pay for is the one its creator deployed.</li>
        </ul>
        <Link href="/safety">See the live checks →</Link>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <b className="num">{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card step">
      <span className="step-n">{n}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
