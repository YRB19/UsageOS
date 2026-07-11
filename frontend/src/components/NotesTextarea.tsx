import { useState, useEffect, useRef, useCallback } from 'react';
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
        } catch { /* ignore */ }
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
    <div className="relative">
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="Notes..."
        rows={2}
        className="w-full bg-transparent text-[13px] text-neutral-400 placeholder-neutral-700 resize-none outline-none border-none leading-relaxed"
      />
      {saved && (
        <span className="absolute bottom-1 right-0 text-[10px] text-neutral-600 animate-pulse">
          Saved
        </span>
      )}
    </div>
  );
}
