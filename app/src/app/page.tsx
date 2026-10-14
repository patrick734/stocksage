"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentAvatar, AgentCard } from "@/components/AgentCard";
import { TokenCA } from "@/components/TokenCA";
import { useMarket, type Agent } from "@/lib/api";
import { brand } from "@/lib/brand";
import { eth, tokens } from "@/lib/money";

const DEMO = [
  { who: "user", text: "Why did the NVDA token move 4% today?" },
  {
    who: "assistant",
    text: "Two things lined up. A chip-export headline hit at 14:10 UTC, and a large buy went through the Robinhood Chain pool a few minutes later. The first is confirmed; whether the second was a reaction to it is my read, not a fact.",
  },
  { who: "user", text: "What would change your view?" },
];

export default function Home() {
  const { data } = useMarket();
  const agents = data?.agents.filter((a) => a.active && !a.blocked) ?? [];
  const featured = [...agents].sort((a, b) => Number(b.seed) - Number(a.seed) || b.usesSold - a.usesSold).slice(0, 6);
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <i className="live-dot" /> Live on Robinhood Chain · paid in {brand.token}
            </span>
            <h1>
              Ask the agents who <em>read</em> the market.
            </h1>
            <p className="lede">
              AI analysts for tokenized stocks, real-world assets and on-chain flows. Talk to one by the question, or build your own, set its price and earn 60% of
              every use.
            </p>
            <div className="hero-cta">
              <Link href="/agent/1" className="btn btn-primary big">
                Talk to Sage, free <span aria-hidden>→</span>
              </Link>
              <Link href="/marketplace" className="btn big">
                Browse agents
              </Link>
              <Link href="/create" className="btn btn-ghost big">
                Create an agent
              </Link>
            </div>
          </div>
          <Terminal />
        </div>
      </section>

      <Ticker agents={agents} />

      <section className="wrap" aria-label="Market totals">
        <div className="board">
        <Stat label="Agents live" value={data ? String(agents.length) : "…"} />
        <Stat label="Uses sold" value={data ? data.totals.uses.toLocaleString() : "…"} />
        <Stat label={`${brand.token} burned`} value={data ? tokens(data.totals.burned) : "…"} accent="gold" />
        <Stat label="To creators" value="60%" accent="sage" />
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <div>
            <span className="kicker">The desk</span>
            <h2>Featured agents</h2>
          </div>
          <Link href="/marketplace" className="link-arrow">
            All agents →
          </Link>
        </div>
        <div className="grid">
          {featured.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
          {!data && Array.from({ length: 3 }, (_, i) => <div key={i} className="card agent-card skeleton" />)}
        </div>
        {data && !data.live && <p className="muted small note">Preview: the contracts are not deployed yet, so these are the agents StockSage launches with.</p>}
      </section>

      <section className="wrap section economy">
        <div className="economy-copy">
          <span className="kicker">The economy</span>
          <h2>
            Every answer pays a creator and <em>burns</em> {brand.token}.
          </h2>
          <ol className="steps">
            <li>
              <b>Creators deploy agents.</b> A purpose, a personality and instructions, hashed on-chain. A small {brand.token} fee, mostly burned.
            </li>
            <li>
              <b>Users pay per use.</b> The creator sets a price in ETH; you pay it in {brand.token}. One use is one reply.
            </li>
            <li>
              <b>Split in the same transaction.</b> Straight from your wallet to the creator, the burn address and the treasury. Nothing sits in the contract.
            </li>
          </ol>
        </div>
        <div className="card splits">
          <Split
            title="Every purchase"
            parts={[
              ["Creator", 60, "sage"],
              ["Burned", 30, "gold"],
              ["Treasury", 10, "dim"],
            ]}
          />
          <Split
            title="Deploying an agent"
            parts={[
              ["Burned", 80, "gold"],
              ["Treasury", 20, "dim"],
            ]}
          />
          <p className="muted small">Launch values. The owner can change them; the live values are on the <Link href="/safety">safety page</Link>, read from the contracts.</p>
        </div>
      </section>

      <section className="wrap section trust">
        <div>
          <span className="kicker">Verifiable on-chain</span>
          <h2>What the contracts guarantee</h2>
          <Link href="/safety" className="link-arrow">
            See the live checks →
          </Link>
        </div>
        <ul className="checks">
          <li>Payments go straight from the buyer to the creator, the burn address and the treasury. The market never holds funds.</li>
          <li>No withdraw function: nobody can move a creator&apos;s earnings or anyone&apos;s tokens.</li>
          <li>Each agent&apos;s configuration is hashed on-chain, so you can check the agent you pay for is the one its creator deployed.</li>
          <li className="warn">One owner wallet sets the {brand.token} rate, the fees and the treasury, and can pause. The maximum cost you sign protects every purchase.</li>
        </ul>
      </section>

      <section className="wrap section cta-band">
        <div className="card cta-card">
          <div>
            <h2>
              Have an edge? <em>Package it.</em>
            </h2>
            <p className="muted">Turn your market process into an agent. You set the price; 60% of every use lands in your wallet.</p>
          </div>
          <div className="cta-side">
            <Link href="/create" className="btn btn-primary big">
              Create an agent →
            </Link>
            <TokenCA address={data?.token ?? (brand.tokenAddress || null)} />
          </div>
        </div>
      </section>
    </>
  );
}

function Terminal() {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setShown((n) => (n >= DEMO.length + 1 ? 1 : n + 1)), 2800);
    return () => clearInterval(t);
  }, []);
  const msgs = DEMO.slice(0, Math.min(shown, DEMO.length));
  const thinking = shown < DEMO.length && DEMO[shown].who === "assistant";
  return (
    <div className="terminal" aria-label="Example conversation">
      <div className="term-bar">
        <span className="dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="term-title">stocksage / sage</span>
        <span className="live-pill">
          <i className="live-dot" /> online
        </span>
      </div>
      <div className="term-agent">
        <AgentAvatar agent={{ id: 1, name: "Sage" }} size={38} />
        <div>
          <b>Sage</b>
          <span>Market Intelligence · free</span>
        </div>
      </div>
      <div className="term-body">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.who}`}>
            {m.text}
          </div>
        ))}
        {thinking && (
          <div className="bubble assistant">
            <span className="typing-dots" aria-label="Sage is thinking">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>
      <div className="term-input">
        <span>Ask about a stock, a fund or a move on-chain…</span>
        <span className="send" aria-hidden>
          ↑
        </span>
      </div>
    </div>
  );
}

function Ticker({ agents }: { agents: Agent[] }) {
  if (!agents.length) return <div className="ticker" aria-hidden />;
  // Enough copies to fill wide screens; the track scrolls by half its width, so the loop is seamless.
  const copies = agents.length < 4 ? 8 : 4;
  return (
    <div className="ticker" aria-label="Agents">
      <div className="ticker-track">
        {Array.from({ length: copies }, (_, c) =>
          agents.map((a) => {
            const free = BigInt(a.pricePerUseWei) === 0n;
            return (
              <span key={`${c}-${a.id}`} className="tick" aria-hidden={c > 0 || undefined}>
                <b>{a.name.toUpperCase()}</b>
                <span>{a.config?.category ?? "Agent"}</span>
                <span className={free ? "up" : ""}>{free ? "FREE" : `${eth(a.pricePerUseWei)} ETH`}</span>
                <span className="dim">{a.usesSold.toLocaleString()} uses</span>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "gold" | "sage" }) {
  return (
    <div className={`stat ${accent ?? ""}`}>
      <b className="num">{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Split({ title, parts }: { title: string; parts: [string, number, string][] }) {
  return (
    <div className="split">
      <div className="split-title">{title}</div>
      <div className="split-bar">
        {parts.map(([label, pct, tone]) => (
          <span key={label} className={`seg-${tone}`} style={{ width: `${pct}%` }} />
        ))}
      </div>
      <div className="split-legend">
        {parts.map(([label, pct, tone]) => (
          <span key={label}>
            <i className={`seg-${tone}`} />
            {label} <b className="num">{pct}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}
