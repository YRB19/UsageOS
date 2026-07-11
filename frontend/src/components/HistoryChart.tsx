import { useState, useEffect } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { getSyncHistory } from '../lib/api';
import type { SyncEvent } from '../lib/types';

interface HistoryChartProps {
  accountId: string;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-neutral-900 border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-neutral-300">
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
          .filter(e => e.limits?.session?.usage_pct !== null && e.limits?.session?.usage_pct !== undefined)
          .reverse()
          .map(e => ({
            time: e.timestamp,
            pct: e.limits.session!.usage_pct!,
          }));
        setData(points);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expanded, accountId, data.length]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors"
      >
        Show history
      </button>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-neutral-500">Session usage over time</span>
        <button
          onClick={() => setExpanded(false)}
          className="text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          Hide
        </button>
      </div>
      {loading ? (
        <div className="h-[80px] flex items-center justify-center">
          <div className="w-4 h-4 border border-neutral-700 border-t-neutral-400 rounded-full animate-spin" />
        </div>
      ) : data.length < 2 ? (
        <div className="h-[80px] flex items-center justify-center text-[11px] text-neutral-600">
          Not enough data points
        </div>
      ) : (
        <div className="h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <YAxis domain={[0, 100]} hide />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="#6366f1"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: '#6366f1' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
