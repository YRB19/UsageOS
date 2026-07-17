import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { AvatarUpload } from './AvatarUpload';
import { EditableNickname } from './EditableNickname';
import { ColorPicker } from './ColorPicker';
import { TelegramChatIdPicker } from './TelegramChatIdPicker';
import { NotesTextarea } from './NotesTextarea';
import { HistoryChart } from './HistoryChart';
import { UsageBar } from './UsageBar';
import { LIMIT_ORDER } from '../lib/types';
import type { AccountWithUsage } from '../lib/types';
import { effectivePct } from '../lib/utils';

interface AccountCardProps {
  account: AccountWithUsage;
  index: number;
  onAccountUpdated: (id: string, patch: Partial<AccountWithUsage>) => void;
  onNavigate?: (id: string) => void;
}

export function AccountCard({ account, index, onAccountUpdated, onNavigate }: AccountCardProps) {
  const [, setTick] = useState(0);
  const navigate = useNavigate();

  const handleUpdated = useCallback(
    (patch: Partial<AccountWithUsage>) => {
      onAccountUpdated(account.id, patch);
      setTick((t) => t + 1);
    },
    [account.id, onAccountUpdated]
  );

  const handleCardClick = () => {
    if (onNavigate) {
      onNavigate(account.id);
    } else {
      navigate(`/account/${account.id}`);
    }
  };

  const maxPct =
    account.limits.length > 0
      ? Math.max(...account.limits.map((l) => effectivePct(l.usage_pct, l.resets_at)))
      : 0;

  const statusColor =
    maxPct >= 100
      ? 'text-accent-highlight'
      : maxPct >= 80
        ? 'text-accent-primary'
        : 'text-[#22c55e]';

  const statusLabel =
    maxPct >= 100 ? 'At limit' : maxPct >= 80 ? 'High' : 'Active';

  const statusBg =
    maxPct >= 100
      ? 'bg-accent-highlight/10 border-accent-highlight/20'
      : maxPct >= 80
        ? 'bg-accent-primary/10 border-accent-primary/20'
        : 'bg-[#22c55e]/10 border-[#22c55e]/20';

  const sortedLimits = [...account.limits].sort((a, b) => {
    const ai = LIMIT_ORDER.indexOf(a.limit_type);
    const bi = LIMIT_ORDER.indexOf(b.limit_type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.06,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="glass rounded-xl overflow-hidden group hover:border-accent-primary/20 transition-all duration-300 cursor-pointer"
      style={{
        borderLeft: `3px solid ${account.color}`,
      }}
      onClick={handleCardClick}
    >
      <div className="p-5" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <AvatarUpload
              accountId={account.id}
              avatarUrl={account.avatar_url}
              color={account.color}
              name={account.nickname || account.email || 'Unknown'}
              onUpdated={(url) => handleUpdated({ avatar_url: url })}
            />
            <ColorPicker
              accountId={account.id}
              color={account.color}
              onUpdated={(c) => handleUpdated({ color: c })}
            />
            <EditableNickname
              accountId={account.id}
              nickname={account.nickname}
              email={account.email}
              onUpdated={(n) => handleUpdated({ nickname: n })}
            />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <TelegramChatIdPicker
              accountId={account.id}
              chatId={account.telegram_chat_id}
              onUpdated={(c) => handleUpdated({ telegram_chat_id: c })}
            />
            {account.subscription_tier && (
              <span className="text-[10px] font-mono font-medium text-muted/40 uppercase tracking-wider border border-border/40 rounded px-1.5 py-0.5">
                {account.subscription_tier.replace('claude_', '')}
              </span>
            )}
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBg} ${statusColor}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Usage Bars */}
        <div className="space-y-3 mb-4">
          {sortedLimits.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center">
              <div className="w-8 h-8 rounded-full border border-border/30 flex items-center justify-center mb-2">
                <span className="text-muted/30 text-sm">?</span>
              </div>
              <p className="text-[12px] text-muted/30">No usage data</p>
            </div>
          ) : (
            sortedLimits.map((limit, i) => (
              <UsageBar key={limit.limit_type} limit={limit} index={i} />
            ))
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="px-5 border-t border-border/30 pt-3 pb-2">
        <NotesTextarea
          accountId={account.id}
          initialContent={account.note || ''}
        />
      </div>

      {/* History */}
      <div className="px-5 pb-4 pt-1">
        <HistoryChart accountId={account.id} />
      </div>
    </motion.div>
  );
}