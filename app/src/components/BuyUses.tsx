"use client";

import { useState } from "react";
import { erc20Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { marketAbi } from "@/generated/abis";
import type { Agent, Market } from "@/lib/api";
import { brand } from "@/lib/brand";
import { useDeployment } from "@/lib/deployment";
import { eth, tokens } from "@/lib/money";
import { TxStatus, useTx } from "./Tx";

const PRESETS = [1, 5, 10, 25];

export function BuyUses({ agent, market, onBought }: { agent: Agent; market: Market; onBought: () => void }) {
  const { deployment, chainId } = useDeployment();
  const { address, isConnected } = useAccount();
  const [uses, setUses] = useState(5);
  const tx = useTx();
  const n = Number.isInteger(uses) && uses >= 1 && uses <= 10_000 ? uses : 0;
  const ready = Boolean(deployment && market.token && market.priceFresh && n);
  const quote = useReadContract({
    address: deployment?.market,
    abi: marketAbi,
    chainId,
    functionName: "quoteUses",
    args: [BigInt(agent.id), BigInt(n || 1)],
    query: { enabled: ready },
  });
  const balance = useReadContract({
    address: market.token ?? undefined,
    abi: erc20Abi,
    chainId,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(market.token && address) },
  });

  const cost = quote.data;
  // The price can tick up between the quote and the transaction; allow 2%.
  const maxCost = cost !== undefined ? (cost * 102n) / 100n : undefined;

  let label = `Buy ${n || "…"} use${n === 1 ? "" : "s"}`;
  let disabled = false;
  if (!deployment) [label, disabled] = ["Opens when StockSage is deployed", true];
  else if (!market.token) [label, disabled] = [`Opens when ${brand.token} launches`, true];
  else if (!market.priceFresh) [label, disabled] = ["Waiting for a fresh price", true];
  else if (!isConnected) [label, disabled] = ["Connect a wallet to buy", true];
  else if (!n) [label, disabled] = ["Pick 1 to 10,000 uses", true];
  else if (cost !== undefined && balance.data !== undefined && balance.data < cost) [label, disabled] = [`Not enough ${brand.token}`, true];
  else if (tx.busy) [label, disabled] = [tx.message ?? "Working…", true];

  async function buy() {
    if (!deployment || !market.token || maxCost === undefined) return;
    const ok = await tx.run("Buy uses", async ({ ensureAllowance }) => {
      await ensureAllowance(market.token!, deployment.market, maxCost);
      return tx.writeContractAsync({ address: deployment.market, abi: marketAbi, chainId, functionName: "purchaseUses", args: [BigInt(agent.id), BigInt(n), maxCost] });
    });
    if (ok) onBought();
  }

  return (
    <div className="card buy">
      <h3>Buy uses</h3>
      <p className="muted small">One use is one reply. Paid in {brand.token} at {eth(agent.pricePerUseWei)} ETH each: 60% to the creator, 30% burned, 10% treasury.</p>
      <div className="presets" role="group" aria-label="Number of uses">
        {PRESETS.map((p) => (
          <button key={p} className={`btn btn-sm ${uses === p ? "btn-active" : ""}`} onClick={() => setUses(p)}>
            {p}
          </button>
        ))}
        <input className="input input-sm" inputMode="numeric" value={uses || ""} onChange={(e) => setUses(Number(e.target.value.replace(/\D/g, "")))} aria-label="Uses" />
      </div>
      <dl className="kv">
        <dt>Cost</dt>
        <dd>{cost !== undefined ? `${tokens(cost)} ${brand.token}` : "…"}</dd>
        {balance.data !== undefined && (
          <>
            <dt>Your balance</dt>
            <dd>
              {tokens(balance.data)} {brand.token}
            </dd>
          </>
        )}
      </dl>
      <button className="btn btn-primary wide" disabled={disabled} onClick={buy}>
        {label}
      </button>
      <TxStatus message={tx.busy ? undefined : tx.message} error={tx.error} />
    </div>
  );
}
