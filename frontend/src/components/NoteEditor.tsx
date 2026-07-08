import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface Props {
  accountId: string;
  initialContent: string;
}

export function NoteEditor({ accountId, initialContent }: Props) {
  const [content, setContent]   = useState(initialContent);
  const [saved,   setSaved]     = useState(false);
  const timerRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the parent re-fetches and gives us fresh content, sync it
  useEffect(() => { setContent(initialContent); }, [initialContent]);

  const save = useCallback(async (text: string) => {
    try {
      await api.putNote(accountId, text);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* silent — will retry on next keystroke */
    }
  }, [accountId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(val), 700);
  };

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] text-zinc-500">📝 Notes</span>
        {saved && <span className="text-[11px] text-green-400 transition-opacity">Saved</span>}
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="Current task, reminders, what to ask next…"
        rows={3}
        className="
          w-full bg-zinc-900 border border-zinc-700 rounded-md
          text-zinc-200 text-[13px] font-mono leading-relaxed
          px-3 py-2 resize-y
          placeholder:text-zinc-600
          focus:outline-none focus:border-zinc-500
          transition-colors
        "
      />
    </div>
  );
}
