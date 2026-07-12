import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <motion.button
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white/10 hover:ring-white/25 transition-all duration-200"
        style={{ backgroundColor: color }}
        title="Change color"
      />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute top-full mt-3 left-1/2 -translate-x-1/2 z-50 glass rounded-xl p-3 shadow-2xl"
          >
            <div className="grid grid-cols-4 gap-2">
              {PRESET_COLORS.map((c) => (
                <motion.button
                  key={c}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => select(c)}
                  className="w-7 h-7 rounded-full transition-all duration-150"
                  style={{
                    backgroundColor: c,
                    outline: c === color ? '2px solid #fffffe' : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}