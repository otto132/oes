'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  Home, Shield, Signal, Target, Building2, TrendingUp,
  Inbox, CheckSquare, Settings, Search, Plus, Clock,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types ── */
interface PaletteItem {
  id: string;
  label: string;
  icon: React.ElementType;
  group: 'navigation' | 'actions' | 'recent';
  keywords?: string;
  onSelect: () => void;
}

/* ── Recent-page helpers (sessionStorage) ── */
const RECENT_KEY = 'eco-cmd-recent';
const MAX_RECENT = 3;

function getRecent(): { href: string; label: string }[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function trackPage(href: string, label: string) {
  if (typeof window === 'undefined') return;
  const list = getRecent().filter(r => r.href !== href);
  list.unshift({ href, label });
  sessionStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

/* ── Navigation definitions ── */
const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; keywords?: string }[] = [
  { href: '/', label: 'Home', icon: Home, keywords: 'dashboard overview' },
  { href: '/queue', label: 'Approval Queue', icon: Shield, keywords: 'queue review approve' },
  { href: '/signals', label: 'Signals', icon: Signal, keywords: 'signal alert intent' },
  { href: '/leads', label: 'Leads', icon: Target, keywords: 'lead prospect' },
  { href: '/accounts', label: 'Accounts', icon: Building2, keywords: 'account company org' },
  { href: '/pipeline', label: 'Pipeline', icon: TrendingUp, keywords: 'pipeline deal opportunity' },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, keywords: 'task todo' },
  { href: '/inbox', label: 'Inbox', icon: Inbox, keywords: 'inbox email message' },
  { href: '/settings', label: 'Settings', icon: Settings, keywords: 'settings preferences config' },
];

/* ── Icon map for recent pages ── */
const iconByHref: Record<string, React.ElementType> = Object.fromEntries(
  NAV_ITEMS.map(n => [n.href, n.icon]),
);

/* ── Group labels ── */
const GROUP_LABELS: Record<string, string> = {
  recent: 'Recent',
  navigation: 'Navigation',
  actions: 'Quick Actions',
};
const GROUP_ORDER = ['recent', 'navigation', 'actions'] as const;

/* ── Component ── */
export default function CommandPalette() {
  const { paletteOpen, closePalette } = useStore();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  /* Build item list */
  const items = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = NAV_ITEMS.map(n => ({
      id: `nav-${n.href}`,
      label: n.label,
      icon: n.icon,
      group: 'navigation',
      keywords: n.keywords,
      onSelect: () => { router.push(n.href); closePalette(); },
    }));

    const actions: PaletteItem[] = [
      {
        id: 'action-new-task',
        label: 'New Task',
        icon: Plus,
        group: 'actions',
        keywords: 'create add task todo',
        onSelect: () => { closePalette(); router.push('/tasks?create=1'); },
      },
      {
        id: 'action-new-account',
        label: 'New Account',
        icon: Plus,
        group: 'actions',
        keywords: 'create add account company',
        onSelect: () => { closePalette(); router.push('/accounts?create=1'); },
      },
    ];

    const recent: PaletteItem[] = getRecent().map(r => ({
      id: `recent-${r.href}`,
      label: r.label,
      icon: iconByHref[r.href] || Clock,
      group: 'recent',
      onSelect: () => { router.push(r.href); closePalette(); },
    }));

    return [...recent, ...nav, ...actions];
  }, [router, closePalette]);

  /* Filter */
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      (i.keywords && i.keywords.toLowerCase().includes(q)),
    );
  }, [items, query]);

  /* Group for rendering */
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return GROUP_ORDER
      .filter(g => map.has(g))
      .map(g => ({ group: g, label: GROUP_LABELS[g], items: map.get(g)! }));
  }, [filtered]);

  /* Flat list for keyboard nav */
  const flatItems = useMemo(() => grouped.flatMap(g => g.items), [grouped]);

  /* Reset on open/close */
  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [paletteOpen]);

  /* Clamp active index when filtered list shrinks */
  useEffect(() => {
    setActiveIdx(idx => Math.min(idx, Math.max(flatItems.length - 1, 0)));
  }, [flatItems.length]);

  /* Scroll active item into view */
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  /* Global Cmd+K / Ctrl+K */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (paletteOpen) {
          closePalette();
        } else {
          useStore.getState().openPalette();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paletteOpen, closePalette]);

  /* Keyboard navigation inside palette */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => (i + 1) % flatItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => (i - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        flatItems[activeIdx]?.onSelect();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      }
    },
    [flatItems, activeIdx, closePalette],
  );

  if (!paletteOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closePalette} />

      {/* Palette */}
      <div
        className="relative w-full max-w-[520px] mx-4 rounded-xl bg-[var(--elevated)] border border-[var(--border)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            placeholder="Search pages, actions..."
            className="flex-1 bg-transparent py-3 text-[14px] text-[var(--text)] placeholder:text-muted outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-medium text-muted bg-[var(--surface)] border border-[var(--border)] px-1.5 py-[2px] rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1.5">
          {flatItems.length === 0 && (
            <div className="py-8 text-center text-[13px] text-muted">No results found</div>
          )}
          {grouped.map(g => (
            <div key={g.group}>
              <div className="px-4 pt-2.5 pb-1 text-[9px] font-semibold tracking-[0.1em] uppercase text-muted">
                {g.label}
              </div>
              {g.items.map(item => {
                const idx = flatItems.indexOf(item);
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={item.id}
                    data-active={isActive}
                    onClick={item.onSelect}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-4 py-[7px] text-left text-[13px] transition-colors',
                      isActive
                        ? 'bg-[var(--hover)] text-[var(--text)]'
                        : 'text-sub hover:bg-[var(--hover)] hover:text-[var(--text)]',
                    )}
                  >
                    <item.icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-brand' : 'text-muted')} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {isActive && <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <kbd className="bg-[var(--surface)] border border-[var(--border)] px-1 py-[1px] rounded text-[9px]">&uarr;</kbd>
            <kbd className="bg-[var(--surface)] border border-[var(--border)] px-1 py-[1px] rounded text-[9px]">&darr;</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-[var(--surface)] border border-[var(--border)] px-1 py-[1px] rounded text-[9px]">&crarr;</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-[var(--surface)] border border-[var(--border)] px-1 py-[1px] rounded text-[9px]">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
