'use client';
import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTipProps {
  /** The help text shown in the tooltip */
  label?: string;
  /** Alias for label (legacy) */
  text?: string;
  /** Optional bold title above the help text */
  title?: string;
  className?: string;
}

export function HelpTip({ label, text, title, className = '' }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const content = label || text || '';

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const show = open || hovered;

  return (
    <div
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => setOpen(!open)}
        className="text-[var(--muted)] hover:text-[var(--sub)] transition-colors"
        aria-label="Help"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 text-xs leading-relaxed bg-[var(--elevated)] border border-[var(--border)] rounded-lg shadow-lg text-[var(--sub)]">
          {title && <div className="text-2xs font-semibold text-[var(--text)] mb-0.5">{title}</div>}
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-[var(--elevated)] border-r border-b border-[var(--border)] rotate-45" />
        </div>
      )}
    </div>
  );
}
