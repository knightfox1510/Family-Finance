// ChillarFlow coin mark — SVG logo component
// Three variants: parent (wave lines, default), home (roofline), hustle (step chart)

interface CoinMarkProps {
  size?: number;
  color?: string;
  variant?: 'parent' | 'home' | 'hustle';
}

export function CoinMark({ size = 36, color = '#f59e0b', variant = 'parent' }: CoinMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-label="ChillarFlow" style={{ flexShrink: 0 }}>
      <circle cx="40" cy="40" r="37" fill="none" stroke={color} strokeWidth="3.2" strokeDasharray="2.2 3.6" />
      <circle cx="40" cy="40" r="30" fill="none" stroke={color} strokeWidth="1.6" opacity="0.55" />
      {variant === 'parent' && (
        <>
          <path d="M 18 35 Q 28 25, 40 35 T 62 35" fill="none" stroke={color} strokeWidth="4.2" strokeLinecap="round" opacity="0.45" />
          <path d="M 18 45 Q 28 55, 40 45 T 62 45" fill="none" stroke={color} strokeWidth="4.2" strokeLinecap="round" />
        </>
      )}
      {variant === 'home' && (
        <>
          <path d="M 18 44 L 30 30 L 40 40 L 50 30 L 62 44" fill="none" stroke={color} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 20 52 L 60 52" fill="none" stroke={color} strokeWidth="4.2" strokeLinecap="round" opacity="0.45" />
        </>
      )}
      {variant === 'hustle' && (
        <>
          <path d="M 18 52 L 28 52 L 28 42 L 40 42 L 40 32 L 52 32 L 52 22 L 60 22" fill="none" stroke={color} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 54 22 L 60 22 L 60 28" fill="none" stroke={color} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
