import type { ReactNode } from 'react';

interface RingProps {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
  dim?: boolean;
  icon?: ReactNode;
}

export function Ring({ pct, color, size = 64, stroke = 7.5, dim = false, icon }: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const dash = (clamped / 100) * c;
  const arcColor = dim ? '#8E8E93' : color;

  return (
    <div className="relative flex-shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`${Math.round(clamped)}%`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="rgba(142, 142, 147, 0.3)"
        />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={arcColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
          />
        )}
      </svg>
      {icon && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {icon}
        </div>
      )}
    </div>
  );
}