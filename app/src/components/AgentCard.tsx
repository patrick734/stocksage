import Link from "next/link";
import type { CSSProperties } from "react";
import type { Agent } from "@/lib/api";
import { brand } from "@/lib/brand";
import { eth } from "@/lib/money";

const hueOf = (id: number) => (id * 67 + 140) % 360;

/** A glowing orb per agent, its colour fixed by the agent id. */
export function AgentAvatar({ agent, size = 46 }: { agent: Pick<Agent, "id" | "name">; size?: number }) {
  const initials = agent.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.34, "--h": hueOf(agent.id) } as CSSProperties;
  return (
    <span className="avatar" style={style} aria-hidden>
      {initials}
    </span>
  );
}

export function PriceLabel({ agent }: { agent: Agent }) {
  if (BigInt(agent.pricePerUseWei) === 0n) return <span className="price free">Free</span>;
  return (
    <span className="price">
      {eth(agent.pricePerUseWei)} <em>ETH</em> <small>/ use, in {brand.token}</small>
    </span>
  );
}

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link href={`/agent/${agent.id}`} className="card agent-card" style={{ "--h": hueOf(agent.id) } as CSSProperties}>
      <div className="agent-card-head">
        <AgentAvatar agent={agent} />
        <div className="agent-card-title">
          <h3>{agent.name}</h3>
          <span className="kicker">
            {agent.config?.category ?? "Agent"}
            {agent.seed && <span className="official">Official</span>}
          </span>
        </div>
        <span className="agent-go" aria-hidden>
          ↗
        </span>
      </div>
      <p className="agent-desc">{agent.config?.description ?? "Configuration unavailable."}</p>
      <div className="agent-card-foot">
        <PriceLabel agent={agent} />
        <span className="uses num">{agent.usesSold.toLocaleString()} uses</span>
      </div>
    </Link>
  );
}
