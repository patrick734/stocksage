import "server-only";
import { seeds } from "@/generated/seeds";
import { hashBytes, normalizeConfig, serializeConfig, type AgentConfig } from "../agentConfig";
import { store } from "./store";

const SEEDS = new Map(seeds.map((s) => [hashBytes(s.bytes), s.bytes]));

/** The stored bytes for a config hash: seed agents ship with the app, the rest come from the store. */
export async function configBytes(hash: string): Promise<string | null> {
  const h = hash.toLowerCase() as `0x${string}`;
  if (!/^0x[0-9a-f]{64}$/.test(h)) return null;
  return SEEDS.get(h) ?? (await store.get(`cfg:${h}`));
}

export async function loadConfig(hash: string): Promise<AgentConfig | null> {
  const bytes = await configBytes(hash);
  if (!bytes || hashBytes(bytes) !== hash.toLowerCase()) return null;
  return JSON.parse(bytes) as AgentConfig;
}

/** Validates and stores a config, keyed by its hash. Stored configs never change: a new config is a new hash. */
export async function saveConfig(input: unknown): Promise<{ ok: true; hash: `0x${string}`; bytes: string } | { ok: false; error: string }> {
  const n = normalizeConfig(input);
  if (!n.ok) return n;
  const bytes = serializeConfig(n.config);
  const hash = hashBytes(bytes);
  if (!SEEDS.has(hash)) await store.set(`cfg:${hash}`, bytes, { nx: true });
  return { ok: true, hash, bytes };
}
