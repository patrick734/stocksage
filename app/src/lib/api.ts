"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { AgentConfig } from "./agentConfig";

export type Agent = {
  id: number;
  name: string;
  creator: `0x${string}` | null;
  createdAt: number;
  version: number;
  active: boolean;
  blocked: boolean;
  pricePerUseWei: string;
  configHash: `0x${string}`;
  metadataURI: string;
  usesSold: number;
  creatorEarned: string;
  burned: string;
  seed: boolean;
  free: boolean;
  config: AgentConfig | null;
};

export type Market = {
  live: boolean;
  agents: Agent[];
  token: `0x${string}` | null;
  tokenPerEth: string | null;
  priceFresh: boolean;
  deploymentFeeWei: string;
  totals: { burned: string; toTreasury: string; uses: number };
};

export type Quota =
  | { kind: "paid"; purchased: number; used: number; remaining: number }
  | { kind: "free"; usedToday: number; limit: number; remaining: number };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error || `Request failed (${res.status})`, res.status);
  return body as T;
}

export const useMarket = () => useQuery({ queryKey: ["market"], queryFn: () => api<Market>("/api/agents"), refetchInterval: 20_000 });

export function useAgent(id: number) {
  const m = useMarket();
  return { ...m, agent: m.data?.agents.find((a) => a.id === id) ?? null, market: m.data };
}

/** Wallet sign-in: the session belongs to the connected wallet only. */
export function useSession() {
  const { address } = useAccount();
  const qc = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const q = useQuery({ queryKey: ["session"], queryFn: () => api<{ address: string | null }>("/api/auth"), refetchInterval: false });
  const signedIn = Boolean(address && q.data?.address && q.data.address.toLowerCase() === address.toLowerCase());

  async function signIn() {
    if (!address) return setError("Connect a wallet first.");
    setBusy(true);
    setError(undefined);
    try {
      const { nonce, message } = await api<{ nonce: string; message: string }>("/api/auth/nonce", { method: "POST", body: JSON.stringify({ address }) });
      const signature = await signMessageAsync({ message });
      await api("/api/auth", { method: "POST", body: JSON.stringify({ address, nonce, signature }) });
      await qc.invalidateQueries({ queryKey: ["session"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string; name?: string };
      setError(err.name === "UserRejectedRequestError" ? "Sign-in was declined in your wallet." : err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  return { signedIn, signIn, busy, error };
}

export function useQuotas(enabled: boolean) {
  return useQuery({ queryKey: ["me"], queryFn: () => api<{ address: string; quotas: Record<string, Quota> }>("/api/me"), enabled, refetchInterval: 20_000 });
}
