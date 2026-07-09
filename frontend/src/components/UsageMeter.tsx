import { pctColor } from "../lib/formatters";
import { CountdownTimer } from "./CountdownTimer";
import { LIMIT_LABELS } from "../lib/types";
import type { CurrentUsage } from "../lib/types";

export function UsageMeter({ limitType, data, onReset }: { limitType: string; data: CurrentUsage; onReset?: () => void }) {
  const pct   = data.usage_pct ?? 0;
  const color = pctColor(pct);
  const label = LIMIT_LABELS[limitType] ?? limitType;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">{label}</span>
        <span className="text-[12px] font-semibold" style={{ color }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
      <div className="mt-1">
        <CountdownTimer resetsAt={data.resets_at} onReset={onReset} />
      </div>
    </div>
  );
}
