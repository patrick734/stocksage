/** The StockSage mark: a sage leaf whose midrib is a rising chart line. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5fbf86" />
          <stop offset="1" stopColor="#c9f5d6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#12201a" stroke="rgb(159 224 184 / 35%)" />
      <path d="M8 24C8 14 14 8 25 7c0 11-6 17-17 17Z" fill="url(#logo-g)" />
      <path d="M9 23l5-5 3 2 6-8" fill="none" stroke="#0b130f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
