import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getSyncHistory } from '../lib/api';
import type { SyncEvent } from '../lib/types';

interface HistoryChartProps {
  accountId: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-2.5 py-1 text-[11px] font-mono text-foreground/80 shadow-lg">
      {payload[0].value.toFixed(1)}%
    </div>
  );
}

export function HistoryChart({ accountId }: HistoryChartProps) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<{ time: string; pct: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || data.length > 0) return;
    setLoading(true);
    getSyncHistory(accountId, 50)
      .then((events: SyncEvent[]) => {
        const points = events
          .filter(
            (e) =>
              e.limits?.session?.usage_pct !== null &&
              e.limits?.session?.usage_pct !== undefined
          )
          .reverse()
          .map((e) => ({
            time: e.timestamp,
            pct: e.limits.session!.usage_pct!,
          }));
        setData(points);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expanded, accountId, data.length]);

  return (
    <div>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-muted/40 hover:text-muted/70 transition-colors duration-200"
      >
        {expanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
        {expanded ? 'Hide' : 'History'}
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="mt-2">
              {loading ? (
                <div className="h-[72px] flex items-center justify-center">
                  <div className="w-4 h-4 border border-border/50 border-t-accent-primary rounded-full animate-spin" />
                </div>
              ) : data.length < 2 ? (
                <div className="h-[72px] flex items-center justify-center text-[11px] text-muted/30">
                  Not enough data yet
                </div>
              ) : (
                <div className="h-[72px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="pct"
                        stroke="#ff8906"
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{
                          r: 3,
                          fill: '#ff8906',
                          stroke: '#0f0e17',
                          strokeWidth: 2,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}