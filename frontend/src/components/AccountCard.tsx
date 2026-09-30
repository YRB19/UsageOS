import { motion } from 'framer-motion';
import { ChevronRight, Zap } from 'lucide-react';
import { Avatar } from './Avatar';
import { Ring } from './Ring';
import { summarizeAccount, usageColor } from '../lib/utils';
import type { AccountWithUsage } from '../lib/types';

interface AccountCardProps {
  account: AccountWithUsage;
  onNavigate?: (id: string) => void;
}

export function AccountCard({ account, onNavigate }: AccountCardProps) {
  const s = summarizeAccount(account);
  const color = usageColor(s.pct);
  const displayName = account.nickname || account.email || 'Unknown';
  const note = account.note?.trim() || null;
  const stale = s.stale;
  const ringColor = stale ? '#8E8E93' : color;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={() => onNavigate?.(account.id)}
      className="group cursor-pointer bg-card rounded-[20px] p-5 border border-black/[0.02] dark:border-white/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <Avatar name={displayName} color={account.color} avatarUrl={account.avatar_url} size={40} />
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[15px] font-semibold text-foreground truncate">{displayName}</span>
            <ChevronRight className="w-4 h-4 text-muted/60 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
          {account.email && (
            <p className="text-[12px] text-muted mt-0.5 break-all">{account.email}</p>
          )}
        </div>
        {!stale && (
          <span className="text-[13px] font-medium whitespace-nowrap" style={{ color }}>
            {s.atLimit ? 'At limit' : 'Available'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 mt-5">
        <Ring
          pct={s.pct}
          color={ringColor}
          size={64}
          stroke={7.5}
          dim={stale}
          icon={<Zap className="w-4 h-4 text-muted/60" />}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`font-mono text-[30px] font-semibold leading-none tabular-nums ${
              stale ? 'text-muted' : ''
            }`}
            style={stale ? undefined : { color }}
          >
            {Math.round(s.pct)}%
          </div>
          {s.sessionActive && s.resetText ? (
            <p className="text-[12px] text-muted mt-2 whitespace-nowrap">
              Resets in <span className="text-foreground/80">{s.resetText}</span>
            </p>
          ) : (
            <p className="text-[12px] text-muted mt-2 whitespace-nowrap">No active session</p>
          )}
        </div>
        {note && (
          <div className="w-32 flex-shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Note
            </div>
            <p className="text-[11px] text-muted truncate mt-0.5">{note}</p>
          </div>
        )}
      </div>

      {s.weeklyPct !== null && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-muted">Weekly</span>
            <span
              className="text-[12px] font-medium tabular-nums"
              style={{ color: stale ? '#8E8E93' : usageColor(s.weeklyPct) }}
            >
              {Math.round(s.weeklyPct)}%
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-border/50 mt-1.5">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(s.weeklyPct, 100)}%`,
                backgroundColor: stale ? '#8E8E93' : usageColor(s.weeklyPct),
              }}
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-all duration-500"
              style={{
                left: `calc(${Math.min(s.weeklyPct, 100)}% - 4px)`,
                backgroundColor: stale ? '#8E8E93' : usageColor(s.weeklyPct),
                boxShadow: '0 0 0 2px rgb(var(--card))',
              }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border/40">
        {s.syncedAgo && (
          <span className="text-[11px] text-muted whitespace-nowrap">
            {stale ? 'Last synced' : 'Synced'}{' '}
            <span>{s.syncedAgo === 'just now' ? 'just now' : s.syncedAgo}</span>{' '}
            {s.syncedAgo === 'just now' ? '' : 'ago'}
          </span>
        )}
      </div>
    </motion.div>
  );
}