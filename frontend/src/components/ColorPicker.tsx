import { useState, useRef, useEffect } from 'react';
import { patchAccount } from '../lib/api';
import { PRESET_COLORS } from '../lib/types';

interface ColorPickerProps {
  accountId: string;
  color: string;
  onUpdated: (color: string) => void;
}

export function ColorPicker({ accountId, color, onUpdated }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = async (c: string) => {
    setOpen(false);
    if (c === color) return;
    try {
      await patchAccount(accountId, { color: c });
      onUpdated(c);
    } catch { /* ignore */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded-full border border-white/10 hover:border-white/25 transition-colors flex-shrink-0"
        style={{ backgroundColor: color }}
        title="Change color"
      />
      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-neutral-900 border border-white/10 rounded-lg p-2 shadow-xl">
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => select(c)}
                className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: c === color ? '#fff' : 'transparent',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
