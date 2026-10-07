"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEther, parseEventLogs, type Hash } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { registryAbi } from "@/generated/abis";
import { TxStatus, useTx } from "@/components/Tx";
import { api, useMarket, useSession } from "@/lib/api";
import { LIMITS, normalizeConfig, type AgentConfig } from "@/lib/agentConfig";
import { brand, CATEGORIES } from "@/lib/brand";
import { useDeployment } from "@/lib/deployment";
import { eth, tokens } from "@/lib/money";

const EMPTY: AgentConfig = { name: "", description: "", specialization: "", personality: "", instructions: "", category: "Research", webSearch: true };

export default function CreateAgent() {
  const router = useRouter();
  const { deployment, chainId } = useDeployment();
  const { isConnected } = useAccount();
  const client = usePublicClient({ chainId });
  const session = useSession();
  const { data: market } = useMarket();
  const tx = useTx();
  const [cfg, setCfg] = useState<AgentConfig>(EMPTY);
  const [price, setPrice] = useState("0.0001");
  const fee = useReadContract({ address: deployment?.registry, abi: registryAbi, chainId, functionName: "deploymentFeeToken", query: { enabled: Boolean(deployment && market?.token) } });

  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const trimmed = Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
  const check = normalizeConfig(trimmed);
  let priceWei: bigint | null = null;
  try {
    priceWei = price.trim() === "" ? null : parseEther(price.trim() as `${number}`);
  } catch {}
  const priceOk = priceWei !== null && priceWei <= parseEther("1");

  let label = "Deploy agent";
  let disabled = false;
  if (!deployment) [label, disabled] = ["Opens when StockSage is deployed", true];
  else if (!market?.token) [label, disabled] = [`Opens when ${brand.token} launches`, true];
  else if (!isConnected) [label, disabled] = ["Connect a wallet", true];
  else if (!check.ok) [label, disabled] = [check.error.replace(/^\w/, (s) => s.toUpperCase()), true];
  else if (!priceOk) [label, disabled] = ["Set a price from 0 to 1 ETH", true];
  else if (fee.isError) [label, disabled] = ["Waiting for a fresh price", true];
  else if (tx.busy) [label, disabled] = [tx.message ?? "Working…", true];

  async function deploy() {
    if (!check.ok || priceWei === null || !deployment || !market?.token || fee.data === undefined) return;
    let hash: Hash | undefined;
    const ok = await tx.run("Deploy agent", async ({ ensureAllowance }) => {
      const saved = await api<{ hash: `0x${string}`; metadataURI: string }>("/api/configs", { method: "POST", body: JSON.stringify({ config: check.config }) });
      const maxFee = (fee.data! * 102n) / 100n;
      if (maxFee > 0n) await ensureAllowance(market.token!, deployment.registry, maxFee);
      hash = await tx.writeContractAsync({
        address: deployment.registry,
        abi: registryAbi,
        chainId,
        functionName: "deployAgent",
        args: [check.config.name, saved.metadataURI, saved.hash, priceWei!, maxFee],
      });
      return hash;
    });
    if (!ok || !hash || !client) return;
    const receipt = await client.getTransactionReceipt({ hash });
    const ev = parseEventLogs({ abi: registryAbi, logs: receipt.logs, eventName: "AgentDeployed" })[0];
    if (ev) router.push(`/agent/${ev.args.agentId}`);
  }

  const needsSignIn = isConnected && !session.signedIn;

  return (
    <div className="wrap page create">
      <h1>Create an agent</h1>
      <p className="lede">
        Describe what your agent does and how it talks. You earn 60% of every use, paid in {brand.token} straight to your wallet. Deploying costs{" "}
        {market ? `${eth(market.deploymentFeeWei)} ETH` : "a small fee"} in {brand.token}{fee.data !== undefined ? ` (${tokens(fee.data)} ${brand.token})` : ""}, 80% of it burned.
      </p>
      <div className="create-grid">
        <form className="card form" onSubmit={(e) => e.preventDefault()}>
          <Field label="Name" hint={`${cfg.name.length}/${LIMITS.name}`}>
            <input className="input" maxLength={LIMITS.name} value={cfg.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Earnings Desk" />
          </Field>
          <Field label="Category">
            <select className="input" value={cfg.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Description" hint="What users see in the marketplace">
            <textarea className="input" rows={2} maxLength={LIMITS.description} value={cfg.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Specialization" hint="Optional">
            <input className="input" maxLength={LIMITS.specialization} value={cfg.specialization} onChange={(e) => set("specialization", e.target.value)} placeholder="e.g. Earnings reports of tokenized tech stocks" />
          </Field>
          <Field label="Personality" hint="Optional">
            <input className="input" maxLength={LIMITS.personality} value={cfg.personality} onChange={(e) => set("personality", e.target.value)} placeholder="e.g. Brief, numbers first, no hype" />
          </Field>
          <Field label="Instructions" hint={`What the agent should do, step by step · ${cfg.instructions.length}/${LIMITS.instructions}`}>
            <textarea className="input" rows={7} maxLength={LIMITS.instructions} value={cfg.instructions} onChange={(e) => set("instructions", e.target.value)} />
          </Field>
          <label className="toggle">
            <input type="checkbox" checked={cfg.webSearch} onChange={(e) => set("webSearch", e.target.checked)} />
            <span>Let the agent search the web for current information</span>
          </label>
          <Field label="Price per use (ETH)" hint="Paid in $SAGE at the live price. You can change it later.">
            <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(",", "."))} />
          </Field>
          {needsSignIn ? (
            <>
              <button className="btn btn-primary wide big" disabled={session.busy} onClick={session.signIn}>
                {session.busy ? "Check your wallet…" : "Sign in to deploy"}
              </button>
              {session.error && <p className="tx-status error">{session.error}</p>}
            </>
          ) : (
            <button className="btn btn-primary wide big" disabled={disabled} onClick={deploy}>
              {label}
            </button>
          )}
          <TxStatus message={tx.busy ? undefined : tx.message} error={tx.error} />
        </form>
        <aside className="card preview">
          <span className="eyebrow">Preview</span>
          <h3>{cfg.name || "Your agent"}</h3>
          <span className="chip">{cfg.category}</span>
          <p>{cfg.description || "Its description shows here."}</p>
          <p className="muted small">
            The configuration is stored with StockSage and its hash goes on-chain with the agent, so anyone can check that what runs is what you deployed. Saving a
            change later creates a new version with a new hash.
          </p>
          <p className="muted small">Every agent follows StockSage&apos;s rules: information, not investment advice; never asks for keys; clear about what it doesn&apos;t know.</p>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}
