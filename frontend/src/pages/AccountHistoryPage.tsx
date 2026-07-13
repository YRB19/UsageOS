import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ArrowLeft, Activity } from 'lucide-react';
import { getAccounts, getSyncHistory } from '../lib/api';
import type { AccountWithUsage, SyncEvent } from '../lib/types';
import { LIMIT_LABELS, LIMIT_ORDER } from '../lib/types';
import { formatCountdown, pctColor } from '../lib/utils';

export default function AccountHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountWithUsage | null>(null);
  const [history, setHistory] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLimit, setSelectedLimit] = useState<string>('session');

  const fetchData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [accounts, events] = await Promise.all([
        getAccounts(),
        getSyncHistory(id, 0),
      ]);
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

  const sortedLimits = useMemo(
    () =>
      [...(account?.limits || [])].sort((a, b) => {
        const ai = LIMIT_ORDER.indexOf(a.limit_type);
        const bi = LIMIT_ORDER.indexOf(b.limit_type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }),
    [account?.limits]
  );

  const chartData = useMemo(
    () =>
      history
        .filter(
          (e) =>
            e.limits?.[selectedLimit]?.usage_pct !== null &&
            e.limits?.[selectedLimit]?.usage_pct !== undefined
        )
        .map((e) => ({
          time: e.timestamp,
          pct: e.limits![selectedLimit]!.usage_pct!,
        })),
    [history, selectedLimit]
  );

  const currentLimit = sortedLimits.find((l) => l.limit_type === selectedLimit);
  const currentPct = currentLimit?.usage_pct ?? 0;
  const currentReset = currentLimit?.resets_at ?? null;

  const maxPct = account?.limits?.length
    ? Math.max(...account.limits.map((l) => l.usage_pct))
    : 0;

  const statusColor =
    maxPct >= 100
      ? 'text-accent-highlight'
      : maxPct >= 80
        ? 'text-accent-primary'
        : 'text-[#22c55e]';
  const statusLabel = maxPct >= 100 ? 'At limit' : maxPct >= 80 ? 'High' : 'Active';

  function CustomTooltip({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: { time: string } }>;
  }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass rounded-lg px-2.5 py-1 text-[11px] font-mono text-foreground/80 shadow-lg">
        {payload[0].value.toFixed(1)}%
        <br />
        <span className="text-[10px] opacity-60">
          {new Date(payload[0].payload.time).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-border/50 border-t-accent-primary rounded-full animate-spin" />
          <p className="text-[12px] text-muted/40">Loading history...</p>
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-4 text-accent-highlight/50" />
          <h2 className="text-lg font-semibold text-foreground/80 mb-2">
            {error || 'Account not found'}
          </h2>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 rounded-lg bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-[13px] font-medium hover:bg-accent-primary/20 transition-colors"
          >
            Back to Dashboard
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Back Button Header */}
      <div className="sticky top-0 z-50 glass-header px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-16 flex items-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-muted/60 hover:text-foreground transition-colors mr-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </motion.button>
          <div className="flex-1 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: account.color }}>
              <img src="/icon128.png" alt="" className="w-6 h-6 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-foreground truncate">{account.nickname || account.email || 'Unknown'}</h1>
              <p className="text-[11px] text-muted/60 truncate">{account.email || account.org_id}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Current Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass rounded-xl p-5 mb-6"
          style={{ borderLeft: `3px solid ${account.color}` }}
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                {account.subscription_tier && (
                  <span className="text-[10px] font-mono text-muted/40 uppercase tracking-wider border border-border/40 rounded px-1.5 py-0.5">
                    {account.subscription_tier.replace('claude_', '')}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-muted/30 mt-0.5">{account.org_id}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-2xl font-mono font-bold text-foreground">{currentPct.toFixed(1)}%</p>
                <p className="text-[11px] text-muted/50">Current {LIMIT_LABELS[selectedLimit] || selectedLimit}</p>
              </div>
              {currentReset && (
                <div className="text-right">
                  <p className="text-[11px] font-mono text-muted/60">Resets</p>
                  <p className="text-[11px] font-mono text-foreground/80">{formatCountdown(currentReset)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Limit Selector */}
          <div className="flex flex-wrap gap-2">
            {sortedLimits.map((limit) => (
              <motion.button
                key={limit.limit_type}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedLimit(limit.limit_type)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                  selectedLimit === limit.limit_type
                    ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                    : 'text-muted/60 hover:text-muted/80 hover:bg-white/5'
                }`}
              >
                {LIMIT_LABELS[limit.limit_type] || limit.limit_type}
                <span className={`ml-1.5 font-mono ${pctColor(limit.usage_pct)}`}>
                  {limit.usage_pct.toFixed(1)}%
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* History Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="glass rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-foreground/80 mb-4">Usage History — {LIMIT_LABELS[selectedLimit] || selectedLimit}</h3>
          
          {chartData.length < 2 ? (
            <div className="h-[300px] flex items-center justify-center text-muted/40">
              <div className="text-center">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-[13px]">Not enough data points for history chart</p>
                <p className="text-[11px] opacity-50 mt-1">{chartData.length} data point{chartData.length !== 1 ? 's' : ''} available</p>
              </div>
            </div>
          ) : (
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(value) =>
                      new Date(value).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    }
                    tick={{ fontSize: 11, fill: '#a7a9be' }}
                    tickMargin={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#a7a9be' }}
                    tickFormatter={(value) => `${value}%`}
                    tickMargin={8}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="pct"
                    stroke="#ff8906"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: '#ff8906',
                      stroke: '#0f0e17',
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        {/* All Limits Mini Charts */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {sortedLimits.map((limit) => (
            <motion.div
              key={limit.limit_type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="glass rounded-xl p-4"
              style={{ borderLeft: `3px solid ${account.color}` }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium text-muted">{LIMIT_LABELS[limit.limit_type] || limit.limit_type}</span>
                <span className={`text-lg font-mono font-bold ${pctColor(limit.usage_pct)}`}>
                  {limit.usage_pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={history
                      .filter((e) => e.limits?.[limit.limit_type]?.usage_pct !== null && e.limits?.[limit.limit_type]?.usage_pct !== undefined)
                      .map((e) => ({ time: e.timestamp, pct: e.limits![limit.limit_type]!.usage_pct! }))
                    }
                  >
                    <YAxis domain={[0, 100]} hide />
                    <Line
                      type="monotone"
                      dataKey="pct"
                      stroke={pctColor(limit.usage_pct)}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {limit.resets_at && (
                <p className="text-[10px] font-mono text-muted/40 mt-2 text-right">
                  resets in {formatCountdown(limit.resets_at)}
                </p>
              )}
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}