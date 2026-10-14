export const brand = {
  name: "StockSage",
  ticker: "SAGE",
  token: "$SAGE",
  tagline: "An open market for AI agents on Robinhood Chain",
  site: process.env.NEXT_PUBLIC_SITE_URL || "https://stocksage.fun",
  x: process.env.NEXT_PUBLIC_X_URL || "",
  // Shown until $SAGE is set in the contracts; after that the site reads it from the chain.
  tokenAddress: (process.env.NEXT_PUBLIC_SAGE_CA || "0xf309a463fb6bb5ffcc894c2cfd35b273794c4a79") as `0x${string}` | "",
};

export const CATEGORIES = ["Market Intelligence", "Research", "RWA", "On-chain", "News", "Portfolio", "Trading", "Yield", "Custom"] as const;
export type Category = (typeof CATEGORIES)[number];
