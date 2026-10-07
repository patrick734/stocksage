"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentAvatar, PriceLabel } from "@/components/AgentCard";
import { BuyUses } from "@/components/BuyUses";
import { Chat } from "@/components/Chat";
import { useAgent, useQuotas, useSession } from "@/lib/api";
import { hashBytes } from "@/lib/agentConfig";
import { explorerAddress } from "@/lib/chains";
import { shortAddress } from "@/lib/format";
import { eth, tokens } from "@/lib/money";
import { brand } from "@/lib/brand";

export default function AgentPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { agent, market, isLoading, refetch } = useAgent(id);
  const session = useSession();
  const quotas = useQuotas(session.signedIn);

  // A freshly deployed agent can take a few seconds to appear in the list: keep looking for up to 30 seconds.
  const [waited, setWaited] = useState(0);
  const pending = !agent && Boolean(market) && waited < 15;
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => (refetch(), setWaited((w) => w + 1)), 2000);
    return () => clearTimeout(t);
  }, [pending, waited, refetch]);

  if (isLoading || pending) return <div className="wrap page"><div className="card skeleton tall" /></div>;
  if (!agent || !market) return <div className="wrap page"><h1>Agent not found</h1><Link href="/marketplace">Back to the marketplace</Link></div>;
  const c = agent.config;

  return (
    <div className="wrap page agent-page">
      <section className="agent-profile">
        <div className="agent-title">
          <AgentAvatar agent={agent} size={64} />
          <div>
            <h1>{agent.name}</h1>
            <span className="chip">{c?.category ?? "Agent"}</span>
            {agent.seed && <span className="chip chip-sage">Official</span>}
            {c?.webSearch && <span className="chip">Web search</span>}
          </div>
        </div>
        {!agent.active && <p className="tx-status error">Its creator has switched this agent off.</p>}
        {agent.blocked && <p className="tx-status error">This agent has been taken off sale by the guardian.</p>}
        <p className="lede">{c?.description}</p>
        {c?.specialization && (
          <p>
            <b>Specialization.</b> {c.specialization}
          </p>
        )}
        {c?.personality && (
          <p>
            <b>Personality.</b> {c.personality}
          </p>
        )}
        <dl className="kv">
          <dt>Price</dt>
          <dd>
            <PriceLabel agent={agent} />
          </dd>
          <dt>Uses sold</dt>
          <dd>{agent.usesSold.toLocaleString()}</dd>
          <dt>Creator earned</dt>
          <dd>
            {tokens(agent.creatorEarned)} {brand.token}
          </dd>
          <dt>Burned by this agent</dt>
          <dd>
            {tokens(agent.burned)} {brand.token}
          </dd>
          <dt>Creator</dt>
          <dd>{agent.creator ? <a href={explorerAddress(agent.creator)} target="_blank" rel="noreferrer">{agent.seed ? "StockSage treasury" : shortAddress(agent.creator)} ↗</a> : "StockSage"}</dd>
          <dt>Version</dt>
          <dd>v{agent.version}</dd>
        </dl>
        <VerifyConfig hash={agent.configHash} />
      </section>

      <section className="agent-side">
        <Chat agent={agent} />
        {BigInt(agent.pricePerUseWei) > 0n && <BuyUses agent={agent} market={market} onBought={() => (refetch(), quotas.refetch())} />}
        {agent.free && BigInt(agent.pricePerUseWei) > 0n && (
          <p className="muted small">Below {eth("20000000000000")} ETH per use, chats come from your daily free messages.</p>
        )}
      </section>
    </div>
  );
}

/** Fetches the served config and re-hashes it in the browser, against the hash on-chain. */
function VerifyConfig({ hash }: { hash: `0x${string}` }) {
  const [state, setState] = useState<"idle" | "ok" | "bad" | "missing">("idle");
  async function check() {
    const res = await fetch(`/api/configs/${hash}`);
    if (!res.ok) return setState("missing");
    setState(hashBytes(await res.text()) === hash ? "ok" : "bad");
  }
  return (
    <div className="verify">
      <span className="muted small">
        Config hash <code>{hash.slice(0, 10)}…{hash.slice(-6)}</code>
      </span>
      {state === "idle" && (
        <button className="btn btn-sm" onClick={check}>
          Verify
        </button>
      )}
      {state === "ok" && <span className="chip chip-sage">Matches on-chain</span>}
      {state === "bad" && <span className="chip chip-bad">Does not match</span>}
      {state === "missing" && <span className="chip chip-bad">Config not found</span>}
      <a className="small" href={`/api/configs/${hash}`} target="_blank" rel="noreferrer">
        View config ↗
      </a>
    </div>
  );
}
