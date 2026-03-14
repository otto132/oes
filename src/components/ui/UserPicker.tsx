'use client';
import { useState, useRef, useEffect } from 'react';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

interface UserPickerProps {
  users: User[];
  selectedIds?: string[];
  onSelect: (user: User) => void;
  onClose: () => void;
  className?: string;
}

export function UserPicker({ users, selectedIds = [], onSelect, onClose, className }: UserPickerProps) {
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = users.filter(u =>
    !selectedIds.includes(u.id) &&
    u.name.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && filtered[activeIndex]) { e.preventDefault(); onSelect(filtered[activeIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div ref={ref} className={cn('absolute z-50 w-56 rounded-lg bg-[var(--elevated)] border border-[var(--border)] shadow-lg overflow-hidden', className)}>
      <input
        ref={inputRef}
        value={filter}
        onChange={e => { setFilter(e.target.value); setActiveIndex(0); }}
        onKeyDown={handleKeyDown}
        placeholder="Search team..."
        className="w-full px-2.5 py-2 text-[12px] bg-transparent border-b border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none"
      />
      <div className="max-h-[180px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-2.5 py-3 text-[11px] text-muted text-center">No matches</div>
        ) : filtered.map((u, i) => (
          <button
            key={u.id}
            onClick={() => onSelect(u)}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-left hover:bg-[var(--hover)] transition-colors',
              i === activeIndex && 'bg-[var(--hover)]'
            )}
          >
            <Avatar initials={u.initials} color={u.color} size="xs" />
            <span className="flex-1 truncate">{u.name}</span>
            <span className="text-[10px] text-muted capitalize">{u.role}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
