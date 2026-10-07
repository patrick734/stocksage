/** The StockSage mark: a sage leaf whose midrib is a rising chart line. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--sage)" />
      <path d="M8 24C8 14 14 8 25 7c0 11-6 17-17 17Z" fill="var(--leaf)" />
      <path d="M9 23l5-5 3 2 6-8" fill="none" stroke="var(--sage)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
