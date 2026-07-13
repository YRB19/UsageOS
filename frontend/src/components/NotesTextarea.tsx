import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { putNote } from '../lib/api';

interface NotesTextareaProps {
  accountId: string;
  initialContent: string;
}

export function NotesTextarea({ accountId, initialContent }: NotesTextareaProps) {
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
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
          await putNote(accountId, val);
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
    [accountId]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    debouncedSave(val);
  };

  return (
    <div className="relative group/note">
      <textarea
        value={content}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
        placeholder="Add a note..."
        rows={2}
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