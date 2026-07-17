import { motion } from 'framer-motion';
import { pctColor, formatCountdown, formatResetTime, effectivePct } from '../lib/utils';
import { LIMIT_LABELS } from '../lib/types';
import type { UsageLimit } from '../lib/types';

interface UsageBarProps {
  limit: UsageLimit;
  index: number;
}

export function UsageBar({ limit, index }: UsageBarProps) {
  const effPct = effectivePct(limit.usage_pct, limit.resets_at);
  const color = pctColor(effPct);
  const isMaxed = effPct >= 100;
  const isHigh = effPct >= 80 && effPct < 100;
  const countdown = formatCountdown(limit.resets_at);
  const resetTime = formatResetTime(limit.resets_at);
  const label = LIMIT_LABELS[limit.limit_type] || limit.limit_type;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="group/bar"
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] font-medium text-muted">
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <span
            className={`text-[12px] font-mono tabular-nums font-medium ${
              isMaxed ? 'text-accent-highlight' : isHigh ? 'text-accent-primary' : 'text-foreground/80'
            }`}
          >
            {effPct.toFixed(1)}%
          </span>
          {countdown && (
            <span className="text-[10px] font-mono text-muted/50 opacity-0 group-hover/bar:opacity-100 transition-opacity duration-200">
              {countdown}
            </span>
          )}
        </div>
      </div>

      <div className="h-[3px] rounded-full bg-border/50 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(effPct, 100)}%` }}
          transition={{
            duration: 0.8,
            delay: index * 0.08 + 0.2,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>

      {resetTime && (
        <div className="flex items-center justify-between mt-1 opacity-0 group-hover/bar:opacity-100 transition-opacity duration-200">
          <p className="text-[10px] font-mono text-muted/40">
            resets {resetTime}
          </p>
          {isMaxed && (
            <span className="text-[9px] font-medium text-accent-highlight/70 uppercase tracking-wider">
              maxed
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}