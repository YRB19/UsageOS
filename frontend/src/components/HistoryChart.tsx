import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { api } from "../lib/api";
import type { SnapshotPoint } from "../lib/types";

interface Props {
  accountId: string;
  limitType?: string;
  color?: string;
}

export function HistoryChart({ accountId, limitType = "session", color = "#d97757" }: Props) {
  const [data, setData] = useState<SnapshotPoint[]>([]);

  useEffect(() => {
    api.history(accountId, limitType).then(setData).catch(() => {});
  }, [accountId, limitType]);

  if (data.length < 2) {
    return <p className="text-xs text-zinc-600 py-2">Not enough history yet.</p>;
  }

  const chartData = data.map((d) => ({
    time: new Date(d.recorded_at).toLocaleDateString([], { month: "short", day: "numeric" }),
    pct:  d.usage_pct,
  }));

  return (
    <div className="h-28 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} />
          <Tooltip
            contentStyle={{ background: "#1a1a1a", border: "1px solid #3f3f3f", borderRadius: 6, fontSize: 12 }}
            formatter={(v: number) => [`${v.toFixed(0)}%`, "Usage"]}
          />
          <ReferenceLine y={80}  stroke="#f0a93f" strokeDasharray="3 3" />
          <ReferenceLine y={100} stroke="#e2554f" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="pct" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
