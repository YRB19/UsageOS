import { motion } from 'framer-motion';

interface SegmentedProps<T extends string> {
  id: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ id, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] dark:bg-white/[0.07] p-1">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`relative px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors duration-200 ${
              active ? 'text-foreground' : 'text-muted hover:text-foreground/70'
            }`}
          >
            {active && (
              <motion.span
                layoutId={id}
                className="absolute inset-0 rounded-full bg-card shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-black/[0.04] dark:border-white/[0.08]"
                transition={{ type: 'tween', duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              />
            )}
            <span className="relative">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}