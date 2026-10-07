import Link from "next/link";
import type { Agent } from "@/lib/api";
import { brand } from "@/lib/brand";
import { eth } from "@/lib/money";

export function AgentAvatar({ agent, size = 44 }: { agent: Pick<Agent, "id" | "name">; size?: number }) {
  const hue = (agent.id * 67 + 140) % 360;
  const initials = agent.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 32% 88%)`, color: `hsl(${hue} 40% 26%)` }} aria-hidden>
      {initials}
    </span>
  );
}

export function PriceLabel({ agent }: { agent: Agent }) {
  if (BigInt(agent.pricePerUseWei) === 0n) return <span className="price free">Free</span>;
  return (
    <span className="price">
      {eth(agent.pricePerUseWei)} ETH <small>per use, in {brand.token}</small>
    </span>
  );
}

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link href={`/agent/${agent.id}`} className="card agent-card">
      <div className="agent-card-head">
        <AgentAvatar agent={agent} />
        <div>
          <h3>{agent.name}</h3>
          <span className="chip">{agent.config?.category ?? "Agent"}</span>
          {agent.seed && <span className="chip chip-sage">Official</span>}
        </div>
      </div>
      <p className="agent-desc">{agent.config?.description ?? "Configuration unavailable."}</p>
      <div className="agent-card-foot">
        <PriceLabel agent={agent} />
        <span className="muted small">{agent.usesSold.toLocaleString()} uses sold</span>
      </div>
    </Link>
  );
}
