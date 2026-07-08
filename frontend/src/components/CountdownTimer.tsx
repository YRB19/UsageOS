import { useEffect, useState } from "react";
import { formatCountdown, formatResetTime } from "../lib/formatters";

export function CountdownTimer({ resetsAt }: { resetsAt: string | null }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!resetsAt) return null;

  // suppress tick warning
  void tick;

  return (
    <span className="text-xs text-zinc-400">
      Resets in <span className="text-zinc-200 font-medium">{formatCountdown(resetsAt)}</span>
      {" · "}
      {formatResetTime(resetsAt)}
    </span>
  );
}
