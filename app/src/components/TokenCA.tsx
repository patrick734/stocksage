"use client";

import { useState } from "react";
import { brand } from "@/lib/brand";
import { robinhoodChain } from "@/lib/chains";

/** The official $SAGE contract address, once it exists, with copy and explorer links. */
export function TokenCA({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!address) return <p className="ca muted">{brand.token} launches soon on Pons. The only official address will be posted here.</p>;
  return (
    <p className="ca">
      <span className="chip">{brand.token} CA</span>
      <code>{address}</code>
      <button
        className="btn btn-sm"
        onClick={() => {
          navigator.clipboard?.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a className="btn btn-sm" href={`${robinhoodChain.blockExplorers.default.url}/token/${address}`} target="_blank" rel="noreferrer">
        Explorer ↗
      </a>
    </p>
  );
}
