import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Activity, Pencil, Calendar, Clock, Hourglass, Zap } from 'lucide-react';
import { getAccounts, getSyncHistory } from '../lib/api';
import type { AccountWithUsage, SyncEvent, UsageLimit } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Ring } from '../components/Ring';
import { Segmented } from '../components/Segmented';
import { HistoryChart, type HistoryPoint } from '../components/HistoryChart';
import { NotesTextarea } from '../components/NotesTextarea';
import { EditPanel } from '../components/EditPanel';
import {
  summarizeAccount,
  usageColor,
  effectivePct,
  formatCountdown,
  formatResetLine,
} from '../lib/utils';

type LimitType = 'session' | 'weekly';
type RangeDays = 7 | 30;

interface RingCardData {
  hasLimit: boolean;
  pct: number;
  color: string;
  active: boolean;
  countdown: string | null;
  resetsLine: string | null;
}

function ringData(limit: UsageLimit | undefined): RingCardData {
  if (!limit) {
    return { hasLimit: false, pct: 0, color: '#8E8E93', active: false, countdown: null, resetsLine: null };
  }
  const pct = effectivePct(limit.usage_pct ?? 0, limit.resets_at);
  const active = !!limit.resets_at && new Date(limit.resets_at).getTime() > Date.now();
  return {
    hasLimit: true,
    pct,
    color: usageColor(pct),
    active,
    countdown: active ? formatCountdown(limit.resets_at) : null,
    resetsLine: active ? formatResetLine(limit.resets_at) : null,
  };
}

function RingCard({
  title,
  data,
  ringIcon,
  resetIcon,
}: {
  title: string;
  data: RingCardData;
  ringIcon?: ReactNode;
  resetIcon?: ReactNode;
}) {
  return (
    <div className="bg-card rounded-[20px] p-5 border border-black/[0.02] dark:border-white/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="text-[13px] font-semibold text-foreground">{title}</div>
      <div className="flex items-center gap-5 mt-4">
        <Ring pct={data.pct} color={data.color} size={84} stroke={10} icon={ringIcon} />
        <div className="min-w-0">
          {data.hasLimit ? (
            <>
              <div
                className="font-mono text-[32px] font-semibold leading-none tabular-nums"
                style={{ color: data.color }}
              >
                {Math.round(data.pct)}%
              </div>
              {data.active ? (
                <>
                  <p className="flex items-center gap-1 text-[12px] text-muted mt-2 whitespace-nowrap">
                    {resetIcon}
                    <span>
                      Resets in <span className="text-foreground/80">{data.countdown}</span>
                    </span>
                  </p>
                  <p className="text-[11px] text-muted mt-1 whitespace-nowrap">{data.resetsLine}</p>
                </>
              ) : (
                <p className="text-[12px] text-muted mt-2 whitespace-nowrap">No active session</p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-muted whitespace-nowrap">No data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AccountHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountWithUsage | null>(null);
  const [history, setHistory] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [limitType, setLimitType] = useState<LimitType>('session');
  const [rangeDays, setRangeDays] = useState<RangeDays>(7);

  const handleUpdated = (patch: Partial<AccountWithUsage>) => {
    setAccount((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const fetchData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [accounts, events] = await Promise.all([getAccounts(), getSyncHistory(id, 0)]);
      const found = accounts.find((a) => a.id === id);
      if (!found) {
        setError('Account not found');
        return;
      }
      setAccount(found);
      setHistory(events || []);
    } catch (err) {
      setError('Failed to load account history');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const summary = account ? summarizeAccount(account) : null;
  const statusColor = summary ? usageColor(summary.pct) : '#8E8E93';
  const statusWord = summary ? (summary.atLimit ? 'At limit' : 'Available') : '';

  const sessionData = ringData(account?.limits.find((l) => l.limit_type === 'session'));
  const weeklyData = ringData(account?.limits.find((l) => l.limit_type === 'weekly'));

  const points = useMemo<HistoryPoint[]>(() => {
    if (!history) return [];
    const cutoff = Date.now() - rangeDays * 86_400_000;
    return history
      .map((e) => {
        const v = e.limits?.[limitType];
        if (v === null || v === undefined || v.usage_pct === null || v.usage_pct === undefined) {
          return null;
        }
        return { time: new Date(e.timestamp).getTime(), pct: v.usage_pct };
      })
      .filter((p): p is HistoryPoint => p !== null && p.time >= cutoff)
      .sort((a, b) => a.time - b.time);
  }, [history, limitType, rangeDays]);

  const currentLimit = account?.limits.find((l) => l.limit_type === limitType);
  const lineColor = currentLimit
    ? usageColor(effectivePct(currentLimit.usage_pct ?? 0, currentLimit.resets_at))
    : '#8E8E93';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border/50 border-t-accent-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !account || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-4 text-accent-highlight/50" />
          <h2 className="text-lg font-semibold text-foreground mb-2">{error || 'Account not found'}</h2>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 rounded-[10px] bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-[13px] font-medium hover:bg-accent-primary/20 transition-colors"
          >
            Back to Dashboard
          </motion.button>
        </div>
      </div>
    );
  }

  const displayName = account.nickname || account.email || 'Unknown';
  const syncedLabel =
    summary.syncedAgo === null
      ? null
      : `${summary.stale ? 'Last synced' : 'Synced'} ${
          summary.syncedAgo === 'just now' ? 'just now' : `${summary.syncedAgo} ago`
        }`;

  return (
    <div className="min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-10 pb-16"
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Accounts
        </button>

        <div className="flex items-start gap-4 mt-6">
          <Avatar name={displayName} color={account.color} avatarUrl={account.avatar_url} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[17px] font-semibold text-foreground truncate">{displayName}</span>
              <span className="text-[13px] font-medium" style={{ color: statusColor }}>
                {statusWord}
              </span>
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-[8px] text-[11px] font-medium text-muted hover:text-foreground border border-border/70 hover:border-border transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            </div>
            {account.email && (
              <p className="text-[12px] text-muted mt-1 break-all">{account.email}</p>
            )}
          </div>
          {syncedLabel && (
            <span className="text-[11px] text-muted whitespace-nowrap pt-1">{syncedLabel}</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
          <RingCard
            title="Session Quota"
            data={sessionData}
            ringIcon={<Zap className="w-[18px] h-[18px] text-muted/60" />}
            resetIcon={<Clock className="w-3.5 h-3.5 text-muted/70 flex-shrink-0" />}
          />
          <RingCard
            title="Weekly Quota"
            data={weeklyData}
            ringIcon={<Calendar className="w-[18px] h-[18px] text-muted/60" />}
            resetIcon={<Hourglass className="w-3.5 h-3.5 text-muted/70 flex-shrink-0" />}
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-6 mt-6">
          <div className="flex-1 min-w-0 bg-card rounded-[20px] p-5 border border-black/[0.02] dark:border-white/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-3 flex-wrap">
              <Segmented
                id="limit-type"
                options={['Session', 'Weekly'] as const}
                value={limitType === 'session' ? 'Session' : 'Weekly'}
                onChange={(v) => setLimitType(v === 'Weekly' ? 'weekly' : 'session')}
              />
              <Segmented
                id="range"
                options={['7d', '30d'] as const}
                value={rangeDays === 7 ? '7d' : '30d'}
                onChange={(v) => setRangeDays(v === '30d' ? 30 : 7)}
              />
            </div>
            <div className="mt-4 h-[280px]">
              {points.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[13px] text-muted">Your history will appear after the first sync</p>
                </div>
              ) : (
                <HistoryChart points={points} color={lineColor} />
              )}
            </div>
          </div>

          <div className="w-full lg:w-64 flex-shrink-0 bg-card rounded-[20px] p-5 border border-black/[0.02] dark:border-white/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
            <span className="text-[13px] font-semibold text-foreground">Notes</span>
            <div className="flex-1 min-h-[260px] mt-2">
              <NotesTextarea accountId={account.id} initialContent={account.note || ''} />
            </div>
          </div>
        </div>
      </motion.div>

      <EditPanel open={editOpen} onClose={() => setEditOpen(false)} account={account} onUpdated={handleUpdated} />
    </div>
  );
}