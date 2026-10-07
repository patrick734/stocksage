// Agent configuration: what a creator writes, how it is serialised, and how it is hashed. Shared by the browser
// (preview) and the server (storage). The on-chain configHash is keccak256 of the exact UTF-8 bytes served at the
// agent's metadataURI, so anyone can fetch the file and check it.
import { keccak256, toBytes } from "viem";
import { CATEGORIES } from "./brand";

export type AgentConfig = {
  name: string;
  description: string;
  specialization: string;
  personality: string;
  instructions: string;
  category: string;
  webSearch: boolean;
};

export const LIMITS = { name: 64, description: 280, specialization: 160, personality: 280, instructions: 4000 } as const;
const FIELDS = ["name", "description", "specialization", "personality", "instructions", "category", "webSearch"] as const;

/** Checks a config and returns it with fields in a fixed order, or a reason it was refused. */
export function normalizeConfig(input: unknown): { ok: true; config: AgentConfig } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "config must be an object" };
  const c = input as Record<string, unknown>;
  const extra = Object.keys(c).filter((k) => !(FIELDS as readonly string[]).includes(k));
  if (extra.length) return { ok: false, error: `unknown field: ${extra[0]}` };
  const text = (k: keyof typeof LIMITS, required: boolean) => {
    const v = c[k];
    if (v === undefined || v === "") return required ? `${k} is required` : "";
    if (typeof v !== "string") return `${k} must be text`;
    if (v.trim() !== v) return `${k} has spaces at the start or end`;
    if (new TextEncoder().encode(v).length > LIMITS[k]) return `${k} is longer than ${LIMITS[k]} bytes`;
    return null;
  };
  for (const [k, req] of [["name", true], ["description", true], ["specialization", false], ["personality", false], ["instructions", true]] as const) {
    const e = text(k, req);
    if (e) return { ok: false, error: e };
  }
  if (typeof c.category !== "string" || !(CATEGORIES as readonly string[]).includes(c.category)) return { ok: false, error: "pick a category from the list" };
  if (typeof c.webSearch !== "boolean") return { ok: false, error: "webSearch must be true or false" };
  return {
    ok: true,
    config: {
      name: c.name as string,
      description: c.description as string,
      specialization: (c.specialization as string) || "",
      personality: (c.personality as string) || "",
      instructions: c.instructions as string,
      category: c.category as string,
      webSearch: c.webSearch as boolean,
    },
  };
}

/** The exact bytes that are stored, served and hashed. */
export function serializeConfig(config: AgentConfig): string {
  return JSON.stringify(config, null, 2) + "\n";
}

export function hashBytes(bytes: string): `0x${string}` {
  return keccak256(toBytes(bytes));
}
