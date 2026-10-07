import { formatEther } from "viem";

/** ETH amount for display, trimmed. */
export function eth(wei: string | bigint, digits = 6) {
  const n = Number(formatEther(BigInt(wei)));
  if (n === 0) return "0";
  if (n < 10 ** -digits) return `<${(10 ** -digits).toFixed(digits)}`;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Token amount (18 decimals) for display, compact. */
export function tokens(wei: string | bigint) {
  const n = Number(formatEther(BigInt(wei)));
  return n.toLocaleString(undefined, { notation: n >= 1e6 ? "compact" : "standard", maximumFractionDigits: n >= 100 ? 0 : 2 });
}

/** $SAGE for an ETH amount at the oracle price (token wei per 1 ETH), rounded up like the contract. */
export function toTokenWei(weiAmount: bigint, tokenPerEth: string | null): bigint | null {
  if (!tokenPerEth) return null;
  const p = BigInt(tokenPerEth);
  return (weiAmount * p + 10n ** 18n - 1n) / 10n ** 18n;
}
