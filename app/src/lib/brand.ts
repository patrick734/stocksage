export const brand = {
  name: "StockSage",
  ticker: "SAGE",
  token: "$SAGE",
  tagline: "An open market for AI agents on Robinhood Chain",
  site: process.env.NEXT_PUBLIC_SITE_URL || "https://stocksage.fun",
  x: process.env.NEXT_PUBLIC_X_URL || "",
  tokenAddress: (process.env.NEXT_PUBLIC_SAGE_CA || "") as `0x${string}` | "",
};

export const CATEGORIES = ["Market Intelligence", "Research", "RWA", "On-chain", "News", "Portfolio", "Trading", "Yield", "Custom"] as const;
export type Category = (typeof CATEGORIES)[number];
