import "server-only";

const isProd = process.env.NODE_ENV === "production";

/** A required setting: missing in production is an error the route reports, never a silent default. */
export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(`${name} is not set`);
  return v;
}

export class ConfigError extends Error {}

export const settings = {
  rpcUrl: () => process.env.ROBINHOOD_RPC_URL || process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  sessionSecret: () => (isProd ? need("SESSION_SECRET") : process.env.SESSION_SECRET || "dev-only-session-secret"),
  /**
   * Which AI provider runs the agents: "anthropic" (Claude, needs ANTHROPIC_API_KEY) or "openai" (any OpenAI-compatible
   * API such as Gemini, Groq or OpenRouter, several with free tiers; needs LLM_BASE_URL and LLM_API_KEY). Defaults to
   * "openai" when LLM_BASE_URL is set, else "anthropic".
   */
  llmProvider: (): "anthropic" | "openai" => {
    const p = (process.env.LLM_PROVIDER || "").toLowerCase();
    if (p === "anthropic" || p === "openai") return p;
    return process.env.LLM_BASE_URL ? "openai" : "anthropic";
  },
  /** Model for every agent, e.g. set in Vercel. Read from the environment so it can change without a deploy. */
  agentModel: () => need("AGENT_MODEL"),
  agentEffort: () => (process.env.AGENT_EFFORT || "low") as "low" | "medium" | "high",
  maxReplyTokens: () => Number(process.env.AGENT_MAX_TOKENS || 8000),
  webSearchMaxUses: () => Number(process.env.AGENT_WEB_SEARCHES || 2),
  /** Agents priced below this (in wei) are served from the free quota, since their price would not cover a reply. */
  minPaidPriceWei: () => BigInt(process.env.MIN_PAID_PRICE_WEI || "20000000000000"),
  freePerAddressPerDay: () => Number(process.env.FREE_PER_ADDRESS_PER_DAY || 10),
  freeGlobalPerDay: () => Number(process.env.FREE_GLOBAL_PER_DAY || 500),
  repliesPerMinute: () => Number(process.env.REPLIES_PER_MINUTE || 6),
  isProd,
};
