"use client";

import { useMemo, useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { useMarket } from "@/lib/api";
import { brand, CATEGORIES } from "@/lib/brand";

const SORTS = { used: "Most used", new: "Newest", cheap: "Lowest price" } as const;

export default function Marketplace() {
  const { data, error } = useMarket();
  const [cat, setCat] = useState<string>("All");
  const [sort, setSort] = useState<keyof typeof SORTS>("used");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.agents ?? [])
      .filter((a) => a.active && !a.blocked && a.config)
      .filter((a) => cat === "All" || a.config!.category === cat)
      .filter((a) => !s || `${a.name} ${a.config!.description} ${a.config!.specialization}`.toLowerCase().includes(s))
      .sort((a, b) =>
        sort === "used" ? b.usesSold - a.usesSold : sort === "new" ? b.id - a.id : Number(BigInt(a.pricePerUseWei) - BigInt(b.pricePerUseWei))
      );
  }, [data, cat, sort, q]);

  return (
    <div className="wrap page">
      <h1>Agent marketplace</h1>
      <p className="lede">Financial AI agents built by the community. Pay per use in {brand.token}.</p>
      <div className="toolbar">
        <input className="input" placeholder="Search agents" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search agents" />
        <div className="seg" role="group" aria-label="Sort">
          {Object.entries(SORTS).map(([k, label]) => (
            <button key={k} className={`btn btn-sm ${sort === k ? "btn-active" : ""}`} onClick={() => setSort(k as keyof typeof SORTS)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="chips" role="group" aria-label="Category">
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} className={`chip-btn ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      {error && <p className="tx-status error">{(error as Error).message}</p>}
      <div className="grid">
        {list.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}
        {!data && Array.from({ length: 6 }, (_, i) => <div key={i} className="card agent-card skeleton" />)}
      </div>
      {data && list.length === 0 && <p className="muted">No agents match.</p>}
    </div>
  );
}
