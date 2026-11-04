/** Kite's mark: an original kite shape with a ribbon tail. */
export function KiteLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="kite-logo">
      <path d="M24 3 L38 19 L24 33 L10 19 Z" fill="var(--tint-2, #e58f65)" />
      <path d="M24 3 L38 19 L24 19 Z" fill="var(--tint-1, #f2c9a0)" opacity=".9" />
      <path d="M10 19 L24 33 L24 19 Z" fill="var(--tint-1, #f2c9a0)" opacity=".55" />
      <path d="M24 3 V33 M10 19 H38" stroke="var(--ink, #1e1c1a)" strokeWidth="1.4" opacity=".55" fill="none" />
      <path d="M24 33 C 22 37, 28 39, 25 42 S 21 45, 24 47" stroke="var(--ink, #1e1c1a)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M23 38 l-3 -1.5 M26 42.5 l3 -1" stroke="var(--tint-2, #e58f65)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
