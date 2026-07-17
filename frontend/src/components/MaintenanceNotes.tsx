import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMaintenanceNote, putMaintenanceNote } from '../lib/api';

export function MaintenanceNotes() {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    getMaintenanceNote()
      .then((data) => {
        if (mountedRef.current) {
          setContent(data.content || '');
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const debouncedSave = useCallback(
    (val: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        try {
          await putMaintenanceNote(val);
          if (mountedRef.current) {
            setSaved(true);
            setTimeout(() => {
              if (mountedRef.current) setSaved(false);
            }, 1500);
          }
        } catch {
          /* ignore */
        }
      }, 600);
    },
    []
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    debouncedSave(val);
  };

  if (loading) {
    return (
      <div className="sticky-note rounded-xl p-6 border border-border/20">
        <div className="flex items-center gap-3 text-muted/40">
          <div className="w-5 h-5 border-2 border-border/50 border-t-accent-primary rounded-full animate-spin" />
          <span className="text-sm">Loading maintenance notes...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky-note relative group/note">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/60 mb-2">
        Maintenance Notes
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
        placeholder="Global notes visible to all dashboard users..."
        rows={6}
        className="w-full bg-transparent text-[12px] text-muted/70 placeholder-muted/25 resize-none outline-none leading-relaxed group-hover/note:text-muted/90 transition-colors duration-200"
      />
      <AnimatePresence>
        {saved && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute bottom-1 right-0 text-[10px] text-accent-primary/50 font-medium"
          >
            Saved
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}