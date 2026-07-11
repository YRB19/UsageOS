import { useState } from 'react';
import { EditableNickname } from './EditableNickname';
import { ColorPicker } from './ColorPicker';
import { TelegramChatIdPicker } from './TelegramChatIdPicker';
import { NotesTextarea } from './NotesTextarea';
import { HistoryChart } from './HistoryChart';
import { UsageBar } from './UsageBar';
import { formatCountdown } from '../lib/utils';
import { LIMIT_ORDER, LIMIT_LABELS } from '../lib/types';
import type { AccountWithUsage } from '../lib/types';

interface AccountCardProps {
  account: AccountWithUsage;
  onAccountUpdated: (id: string, patch: Partial<AccountWithUsage>) => void;
}

export function AccountCard({ account, onAccountUpdated }: AccountCardProps) {
  const [, setTick] = useState(0);

  const maxPct =
    account.limits.length > 0
      ? Math.max(...account.limits.map(l => l.usage_pct))
      : 0;

  const statusColor =
    maxPct >= 100 ? 'text-red-400' : maxPct >= 80 ? 'text-amber-400' : 'text-emerald-400';
  const statusLabel =
    maxPct >= 100 ? 'At limit' : maxPct >= 80 ? 'High' : 'Active';

  const sortedLimits = [...account.limits].sort((a, b) => {
    const ai = LIMIT_ORDER.indexOf(a.limit_type);
    const bi = LIMIT_ORDER.indexOf(b.limit_type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div
      className="border border-white/[0.06] rounded-lg p-5 hover:border-white/[0.12] transition-colors group"
      style={{ borderLeftWidth: '3px', borderLeftColor: account.color }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <ColorPicker
              accountId={account.id}
              color={account.color}
              onUpdated={c => {
                onAccountUpdated(account.id, { color: c });
                setTick(t => t + 1);
              }}
            />
            <EditableNickname
              accountId={account.id}
              nickname={account.nickname}
              email={account.email}
              color={account.color}
              onUpdated={n => {
                onAccountUpdated(account.id, { nickname: n });
                setTick(t => t + 1);
              }}
            />
            <TelegramChatIdPicker
              accountId={account.id}
              chatId={account.telegram_chat_id}
              onUpdated={c => {
                onAccountUpdated(account.id, { telegram_chat_id: c });
                setTick(t => t + 1);
              }}
            />
          </div>
          {account.email && account.nickname && (
            <p className="text-[12px] text-neutral-500 truncate ml-7">{account.email}</p>
          )}
          <p className="text-[11px] font-mono text-neutral-600 mt-0.5 ml-7">{account.org_id}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
          {account.subscription_tier && (
            <span className="text-[10px] font-mono text-neutral-600 border border-white/[0.06] rounded px-1.5 py-0.5">
              {account.subscription_tier.replace('claude_', '')}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {sortedLimits.length === 0 ? (
          <p className="text-[12px] text-neutral-600 text-center py-4">No usage data</p>
        ) : (
          sortedLimits.map(limit => (
            <UsageBar
              key={limit.limit_type}
              label={LIMIT_LABELS[limit.limit_type] || limit.limit_type}
              pct={limit.usage_pct}
              resetsAt={limit.resets_at}
              countdown={formatCountdown(limit.resets_at)}
            />
          ))
        )}
      </div>

      <div className="border-t border-white/[0.04] pt-3">
        <NotesTextarea accountId={account.id} initialContent={account.note || ''} />
      </div>

      <div className="border-t border-white/[0.04] pt-2 mt-1">
        <HistoryChart accountId={account.id} />
      </div>
    </div>
  );
}
