"use client";

import Link from "next/link";
import { useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { registryAbi } from "@/generated/abis";
import { AgentAvatar, PriceLabel } from "@/components/AgentCard";
import { TxStatus, useTx } from "@/components/Tx";
import { useMarket, useQuotas, useSession, type Agent } from "@/lib/api";
import { brand } from "@/lib/brand";
import { useDeployment } from "@/lib/deployment";
import { tokens } from "@/lib/money";

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { data, refetch } = useMarket();
  const session = useSession();
  const quotas = useQuotas(session.signedIn);
  if (!isConnected) return <div className="wrap page"><h1>Dashboard</h1><p className="lede">Connect your wallet to see your agents and your uses.</p></div>;

  const mine = (data?.agents ?? []).filter((a) => a.creator?.toLowerCase() === address!.toLowerCase());
  const earned = mine.reduce((s, a) => s + BigInt(a.creatorEarned), 0n);
  const owned = Object.entries(quotas.data?.quotas ?? {})
    .filter(([, q]) => q.kind === "paid" && q.purchased > 0)
    .map(([id, q]) => ({ agent: data?.agents.find((a) => a.id === Number(id)), q }));

  return (
    <div className="wrap page">
      <h1>Dashboard</h1>
      <section className="stats">
        <div className="stat"><b className="num">{mine.length}</b><span>Your agents</span></div>
        <div className="stat"><b className="num">{mine.reduce((s, a) => s + a.usesSold, 0).toLocaleString()}</b><span>Uses sold</span></div>
        <div className="stat"><b className="num">{tokens(earned)}</b><span>{brand.token} earned (paid to your wallet)</span></div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Your agents</h2>
          <Link href="/create" className="btn btn-sm">New agent</Link>
        </div>
        {mine.length === 0 && <p className="muted">You haven&apos;t deployed an agent yet.</p>}
        <div className="list">
          {mine.map((a) => (
            <MyAgent key={a.id} agent={a} onChange={refetch} />
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Your uses</h2>
        {!session.signedIn ? (
          <>
            <button className="btn" disabled={session.busy} onClick={session.signIn}>{session.busy ? "Check your wallet…" : "Sign in to see your uses"}</button>
            {session.error && <p className="tx-status error">{session.error}</p>}
          </>
        ) : owned.length === 0 ? (
          <p className="muted">No paid uses yet. <Link href="/marketplace">Find an agent →</Link></p>
        ) : (
          <table className="table">
            <thead><tr><th>Agent</th><th>Bought</th><th>Used</th><th>Left</th></tr></thead>
            <tbody>
              {owned.map(({ agent, q }) => q.kind === "paid" && (
                <tr key={agent?.id}>
                  <td><Link href={`/agent/${agent?.id}`}>{agent?.name}</Link></td>
                  <td className="num">{q.purchased}</td>
                  <td className="num">{q.used}</td>
                  <td className="num">{q.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function MyAgent({ agent, onChange }: { agent: Agent; onChange: () => void }) {
  const { deployment, chainId } = useDeployment();
  const tx = useTx();
  const [price, setPrice] = useState("");
  const call = async (label: string, functionName: "setPrice" | "setActive", args: readonly [bigint, bigint] | readonly [bigint, boolean]) => {
    if (!deployment) return;
    const ok = await tx.run(label, () => tx.writeContractAsync({ address: deployment.registry, abi: registryAbi, chainId, functionName, args } as never));
    if (ok) onChange();
  };
  let newPrice: bigint | null = null;
  try {
    newPrice = price ? parseEther(price as `${number}`) : null;
  } catch {}
  return (
    <div className="card my-agent">
      <div className="agent-card-head">
        <AgentAvatar agent={agent} />
        <div>
          <h3><Link href={`/agent/${agent.id}`}>{agent.name}</Link></h3>
          <PriceLabel agent={agent} /> · <span className="muted small">{agent.active ? "On sale" : "Switched off"}{agent.blocked ? " · blocked by the guardian" : ""}</span>
        </div>
      </div>
      <dl className="kv">
        <dt>Uses sold</dt><dd>{agent.usesSold.toLocaleString()}</dd>
        <dt>Earned</dt><dd>{tokens(agent.creatorEarned)} {brand.token}</dd>
        <dt>Burned</dt><dd>{tokens(agent.burned)} {brand.token}</dd>
      </dl>
      <div className="row">
        <input className="input input-sm" placeholder="New price in ETH" value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value.replace(",", "."))} />
        <button className="btn btn-sm" disabled={tx.busy || newPrice === null} onClick={() => call("Set price", "setPrice", [BigInt(agent.id), newPrice!] as const)}>Set price</button>
        <button className="btn btn-sm" disabled={tx.busy} onClick={() => call(agent.active ? "Switch off" : "Switch on", "setActive", [BigInt(agent.id), !agent.active] as const)}>
          {agent.active ? "Switch off" : "Switch on"}
        </button>
      </div>
      <TxStatus message={tx.busy ? undefined : tx.message} error={tx.error} />
    </div>
  );
}
