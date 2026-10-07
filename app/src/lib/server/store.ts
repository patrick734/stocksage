import "server-only";
import { ConfigError, settings } from "./env";

// Key-value store for agent configs, sign-in nonces and use counters: Upstash Redis over its REST API (Vercel's
// Upstash/KV integration sets these variables). Without them, a per-process memory store is used in development
// only: use counters must be shared by every server instance, so production refuses to run without Redis.

type Cmd = (string | number)[];

const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis<T>(command: Cmd): Promise<T> {
  const res = await fetch(url()!, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(command.map(String)),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`store: ${body.error || res.status}`);
  return body.result as T;
}

// One map per process, shared by every route bundle (each route module would otherwise get its own copy).
const g = globalThis as { __sageStore?: Map<string, { v: string; exp?: number }> };
const mem = (g.__sageStore ??= new Map());
function memGet(k: string) {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) {
    mem.delete(k);
    return null;
  }
  return e.v;
}

function backend() {
  if (url() && token()) return "redis" as const;
  if (settings.isProd) throw new ConfigError("Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)");
  return "memory" as const;
}

export const store = {
  async get(k: string): Promise<string | null> {
    return backend() === "redis" ? redis<string | null>(["GET", k]) : memGet(k);
  },
  /** Sets a value; with `nx`, only when the key is absent. Returns whether it was written. */
  async set(k: string, v: string, opts: { ex?: number; nx?: boolean } = {}): Promise<boolean> {
    if (backend() === "redis") {
      const cmd: Cmd = ["SET", k, v];
      if (opts.ex) cmd.push("EX", opts.ex);
      if (opts.nx) cmd.push("NX");
      return (await redis<string | null>(cmd)) === "OK";
    }
    if (opts.nx && memGet(k) !== null) return false;
    mem.set(k, { v, exp: opts.ex ? Date.now() + opts.ex * 1000 : undefined });
    return true;
  },
  async getdel(k: string): Promise<string | null> {
    if (backend() === "redis") return redis<string | null>(["GETDEL", k]);
    const v = memGet(k);
    mem.delete(k);
    return v;
  },
  /** Adds `by` and returns the new value; `ex` sets an expiry when the key is new. */
  async incr(k: string, by = 1, ex?: number): Promise<number> {
    if (backend() === "redis") {
      const n = await redis<number>(["INCRBY", k, by]);
      if (ex && n === by) await redis(["EXPIRE", k, ex]);
      return n;
    }
    const cur = Number(memGet(k) ?? 0) + by;
    const exp = mem.get(k)?.exp ?? (ex ? Date.now() + ex * 1000 : undefined);
    mem.set(k, { v: String(cur), exp });
    return cur;
  },
  async getMany(keys: string[]): Promise<(string | null)[]> {
    if (!keys.length) return [];
    if (backend() === "redis") return redis<(string | null)[]>(["MGET", ...keys]);
    return keys.map(memGet);
  },
};
