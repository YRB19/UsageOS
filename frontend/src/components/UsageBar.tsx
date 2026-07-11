import { pctColor } from '../lib/utils';

interface UsageBarProps {
  label: string;
  pct: number;
  resetsAt: string | null;
  countdown: string;
}

export function UsageBar({ label, pct, resetsAt, countdown }: UsageBarProps) {
  const color = pctColor(pct);

  return (
    <div className="group/bar">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] text-neutral-400">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-mono tabular-nums text-neutral-200">
            {pct.toFixed(1)}%
          </span>
          {countdown && (
            <span className="text-[11px] font-mono text-neutral-500 opacity-0 group-hover/bar:opacity-100 transition-opacity">
              {countdown}
            </span>
          )}
        </div>
      </div>
      <div className="h-[3px] rounded-full bg-neutral-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
      {resetsAt && (
        <p className="text-[11px] font-mono text-neutral-600 mt-1 opacity-0 group-hover/bar:opacity-100 transition-opacity">
          resets {new Date(resetsAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}
