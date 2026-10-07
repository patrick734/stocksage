"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, useMarket } from "@/lib/api";
import { brand } from "@/lib/brand";
import { robinhoodChain } from "@/lib/chains";
import { shortAddress } from "@/lib/format";
import { tokens } from "@/lib/money";

type Item = { kind: "deployed" | "purchased"; block: number; tx: string; agentId: number; who: string; name?: string; uses?: number; paid: string; burned: string };

export default function Activity() {
  const { data, error } = useQuery({ queryKey: ["activity"], queryFn: () => api<{ items: Item[] }>("/api/activity"), refetchInterval: 30_000 });
  const { data: market } = useMarket();
  const name = (id: number) => market?.agents.find((a) => a.id === id)?.name ?? `#${id}`;
  return (
    <div className="wrap page">
      <h1>Activity</h1>
      <p className="lede">Every agent deployed and every use bought, read from Robinhood Chain.</p>
      {error && <p className="tx-status error">{(error as Error).message}</p>}
      {data && data.items.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="feed">
        {data?.items.map((it) => (
          <li key={`${it.tx}-${it.kind}-${it.agentId}`} className="card feed-item">
            {it.kind === "deployed" ? (
              <span>
                <b>{shortAddress(it.who)}</b> deployed <Link href={`/agent/${it.agentId}`}>{it.name}</Link>
                {BigInt(it.burned) > 0n && <> · burned {tokens(it.burned)} {brand.token}</>}
              </span>
            ) : (
              <span>
                <b>{shortAddress(it.who)}</b> bought {it.uses} use{it.uses === 1 ? "" : "s"} of <Link href={`/agent/${it.agentId}`}>{name(it.agentId)}</Link>
                {BigInt(it.paid) > 0n && <> · {tokens(it.paid)} {brand.token}, {tokens(it.burned)} burned</>}
              </span>
            )}
            <a className="small" href={`${robinhoodChain.blockExplorers.default.url}/tx/${it.tx}`} target="_blank" rel="noreferrer">
              Tx ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
