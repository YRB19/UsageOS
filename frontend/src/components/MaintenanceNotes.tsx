import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pin, Pencil } from 'lucide-react';
import { getMaintenanceNote, putMaintenanceNote } from '../lib/api';

const STORAGE_KEY = 'usageos:notes:pos';
const DRAG_MIN_WIDTH = 1024;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 80;
const MAX_AUTO_HEIGHT = 400;
const EDGE_MARGIN = 8;

interface NotePos {
  x: number;
  y: number;
}

interface StoredState {
  x: number;
  y: number;
  w: number;
  h: number | null;
}

function loadStoredState(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (![parsed.x, parsed.y, parsed.w].every((v) => typeof v === 'number')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

interface Seg {
  text: string;
  email: boolean;
}

const EMAIL_RE = /\S+@\S+\.\S+/g;

function splitEmails(text: string): Seg[] {
  const segs: Seg[] = [];
  let last = 0;
  EMAIL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMAIL_RE.exec(text))) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index), email: false });
    segs.push({ text: m[0], email: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ text: text.slice(last), email: false });
  return segs;
}

function relativeUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60 * 1000) return 'Updated just now';
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    const t = d.toLocaleString([], { hour: 'numeric', minute: '2-digit' });
    return `Updated today, ${t}`;
  }
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(diffMs / 86400000)}d ago`;
}

export function MaintenanceNotes() {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [enable, setEnable] = useState(() => window.innerWidth >= DRAG_MIN_WIDTH);
  const [pos, setPos] = useState<NotePos | null>(null);
  const [size, setSize] = useState<{ w: number; h: number | null }>(() => {
    const stored = loadStoredState();
    return stored ? { w: stored.w, h: stored.h } : { w: 280, h: null };
  });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const enableRef = useRef(enable);
  enableRef.current = enable;
  const dragStartRef = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
    oW: number;
    oH: number;
  } | null>(null);

  const persist = (next: StoredState) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const autoresize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (enableRef.current && sizeRef.current.h !== null) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_AUTO_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    getMaintenanceNote()
      .then((data) => {
        if (mountedRef.current) {
          setContent(data.content || '');
          setUpdatedAt(data.updated_at);
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

  useEffect(() => {
    if (!loading) autoresize();
  }, [content, loading, autoresize]);

  useEffect(() => {
    if (!editing) return;
    const raf = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) el.focus();
      autoresize();
    });
    return () => cancelAnimationFrame(raf);
  }, [editing, autoresize]);

  useEffect(() => {
    const onResize = () => setEnable(window.innerWidth >= DRAG_MIN_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!enable || pos) return;
    const stored = loadStoredState();
    if (stored) {
      setPos({ x: stored.x, y: stored.y });
      return;
    }
    const el = rootRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ x: r.left, y: r.top });
    } else {
      setPos({
        x: Math.max(EDGE_MARGIN, window.innerWidth - sizeRef.current.w - 16),
        y: 96,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enable]);

  const debouncedSave = useCallback(
    (val: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        try {
          const res = await putMaintenanceNote(val);
          if (mountedRef.current) {
            setUpdatedAt(res.updated_at);
            setSaveError(false);
            setSaved(true);
            setTimeout(() => {
              if (mountedRef.current) setSaved(false);
            }, 1500);
          }
        } catch {
          if (mountedRef.current) {
            setSaved(false);
            setSaveError(true);
          }
        }
      }, 600);
    },
    []
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    autoresize();
    debouncedSave(val);
  };

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = rootRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      px: e.clientX,
      py: e.clientY,
      ox: pos?.x ?? rect.left,
      oy: pos?.y ?? rect.top,
      oW: sizeRef.current.w,
      oH: rect.height,
    };
    setDragging(true);
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    if (!s) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxX = Math.max(EDGE_MARGIN, vw - s.oW - EDGE_MARGIN);
    const maxY = Math.max(EDGE_MARGIN, vh - s.oH - EDGE_MARGIN);
    setPos({
      x: clamp(s.ox + (e.clientX - s.px), EDGE_MARGIN, maxX),
      y: clamp(s.oy + (e.clientY - s.py), EDGE_MARGIN, maxY),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    dragStartRef.current = null;
    setDragging(false);
    if (!s) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxX = Math.max(EDGE_MARGIN, vw - s.oW - EDGE_MARGIN);
    const maxY = Math.max(EDGE_MARGIN, vh - s.oH - EDGE_MARGIN);
    const x = clamp(s.ox + (e.clientX - s.px), EDGE_MARGIN, maxX);
    const y = clamp(s.oy + (e.clientY - s.py), EDGE_MARGIN, maxY);
    setPos({ x, y });
    persist({ x, y, w: sizeRef.current.w, h: sizeRef.current.h });
  };

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = rootRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      px: e.clientX,
      py: e.clientY,
      ox: pos?.x ?? rect.left,
      oy: pos?.y ?? rect.top,
      oW: sizeRef.current.w,
      oH: rect.height,
    };
    setResizing(true);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    if (!s) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = Math.max(MIN_WIDTH, vw - (s.ox + EDGE_MARGIN));
    const maxH = Math.max(MIN_HEIGHT, vh - (s.oy + EDGE_MARGIN));
    const w = clamp(s.oW + (e.clientX - s.px), MIN_WIDTH, maxW);
    const h = clamp(s.oH + (e.clientY - s.py), MIN_HEIGHT, maxH);
    setSize({ w, h });
  };

  const endResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    dragStartRef.current = null;
    setResizing(false);
    if (!s) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = Math.max(MIN_WIDTH, vw - (s.ox + EDGE_MARGIN));
    const maxH = Math.max(MIN_HEIGHT, vh - (s.oy + EDGE_MARGIN));
    const w = clamp(s.oW + (e.clientX - s.px), MIN_WIDTH, maxW);
    const h = clamp(s.oH + (e.clientY - s.py), MIN_HEIGHT, maxH);
    setSize({ w, h });
    persist({ x: s.ox, y: s.oy, w, h });
  };

  const wrapperClasses = [
    'group rounded-[12px] p-4',
    enable ? 'fixed z-30 flex flex-col' : '',
    dragging || resizing ? 'select-none' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const footerText = relativeUpdated(updatedAt);

  return (
    <div
      ref={rootRef}
      className={wrapperClasses}
      style={{
        backgroundColor: '#FEF3BD',
        color: '#3C3826',
        boxShadow:
          dragging || resizing
            ? '0 14px 30px rgba(0,0,0,0.16)'
            : '0 8px 24px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03)',
        ...(enable && pos ? { left: pos.x, top: pos.y, width: size.w } : {}),
        ...(enable && pos && size.h !== null ? { height: size.h } : {}),
        ...(dragging || resizing ? { opacity: 0.95 } : {}),
      }}
    >
      {loading ? (
        <div className="flex items-center gap-3" style={{ color: '#3C3826' }}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
          <span className="text-[13px]">Loading maintenance notes...</span>
        </div>
      ) : (
        <div className={enable ? 'relative flex-1 min-h-0 flex flex-col' : 'relative'}>
          <div
            onPointerDown={enable ? handleDragStart : undefined}
            onPointerMove={enable ? handleDragMove : undefined}
            onPointerUp={enable ? endDrag : undefined}
            onPointerCancel={enable ? endDrag : undefined}
            className={`flex items-center gap-1.5 text-[11px] font-semibold ${
              enable ? 'cursor-grab touch-none' : ''
            }`}
          >
            <Pin className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
            <span>Maintenance notes</span>
          </div>
          <div className="mt-2 mb-2.5 border-t" style={{ borderColor: 'rgba(60,56,38,0.15)' }} />
          {editing ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              onBlur={() => setEditing(false)}
              placeholder="Global notes visible to all dashboard users..."
              rows={2}
              className={`w-full bg-transparent resize-none outline-none text-[13px] leading-relaxed overflow-y-auto ${
                enable && size.h !== null ? 'flex-1 min-h-0' : ''
              }`}
              style={{ color: '#3C3826', maxHeight: MAX_AUTO_HEIGHT }}
            />
          ) : (
            <div
              onClick={() => setEditing(true)}
              className={`w-full text-[13px] leading-relaxed break-words whitespace-pre-wrap cursor-text ${
                enable && size.h !== null ? 'flex-1 min-h-0 overflow-y-auto' : ''
              }`}
              style={{ color: '#3C3826', maxHeight: MAX_AUTO_HEIGHT }}
            >
              {content.trim()
                ? splitEmails(content).map((seg, i) =>
                    seg.email ? (
                      <span
                        key={i}
                        className="rounded-md px-1 py-px"
                        style={{ backgroundColor: 'rgba(60,56,38,0.08)' }}
                      >
                        {seg.text}
                      </span>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    )
                  )
                : <span className="opacity-40">Global notes visible to all dashboard users...</span>}
            </div>
          )}
          {enable && (
            <div
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              className="absolute bottom-1 right-1 w-4 h-4 opacity-0 group-hover:opacity-100 cursor-nwse-resize touch-none transition-opacity duration-150"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 16 16"
                className="w-full h-full"
                fill="none"
                stroke="rgba(60,56,38,0.5)"
                strokeWidth="1.5"
              >
                <path d="M13 3v10H3" />
              </svg>
            </div>
          )}
          {(footerText || saved || saveError) && (
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-[10px] opacity-60">{footerText}</span>
              <span className="flex items-center gap-1.5">
                <AnimatePresence>
                  {saveError && (
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-[10px] font-medium"
                      style={{ color: '#B3261E' }}
                    >
                      Couldn&apos;t save
                    </motion.span>
                  )}
                  {saved && (
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-[10px] font-medium opacity-60"
                      style={{ color: '#3C3826' }}
                    >
                      Saved
                    </motion.span>
                  )}
                </AnimatePresence>
                <Pencil className="w-3 h-3 opacity-60" aria-hidden="true" />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}