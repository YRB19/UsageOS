type Variant = "ok" | "warn" | "maxed";

const styles: Record<Variant, string> = {
  ok:    "bg-green-500/15 text-green-400",
  warn:  "bg-amber-500/15 text-amber-400",
  maxed: "bg-red-500/15 text-red-400",
};

export function StatusBadge({ text, variant }: { text: string; variant: Variant }) {
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${styles[variant]}`}>
      {text}
    </span>
  );
}
