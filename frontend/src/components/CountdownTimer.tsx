import { useEffect, useRef, useState } from "react";
import { formatCountdown, formatResetTime } from "../lib/formatters";

export function CountdownTimer({ resetsAt, onReset }: { resetsAt: string | null; onReset?: () => void }) {
  const [tick, setTick] = useState(0);
  const hasFiredRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  if (!resetsAt) return null;

  const diff = new Date(resetsAt).getTime() - Date.now();
  const isResetting = diff <= 0;

  // Fire onReset once when countdown hits zero
  if (isResetting && !hasFiredRef.current && onReset) {
    hasFiredRef.current = true;
    onReset();
  }

  // Reset the flag when countdown moves back to positive
  if (!isResetting) {
    hasFiredRef.current = false;
  }

  return (
    <span className="text-xs text-zinc-400">
      Resets in <span className="text-zinc-200 font-medium">{isResetting ? "Resetting…" : formatCountdown(resetsAt)}</span>
      {" · "}
      {formatResetTime(resetsAt)}
    </span>
  );
}
