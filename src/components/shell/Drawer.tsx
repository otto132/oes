'use client';
import { useRef } from 'react';
import { useStore } from '@/lib/store';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';

export default function Drawer() {
  const { drawerOpen, drawerContent, closeDrawer } = useStore();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, drawerOpen);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-150 ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={closeDrawer}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={`fixed right-0 top-0 bottom-0 w-full md:w-[480px] bg-[var(--elevated)] border-l border-[var(--border)] shadow-lg z-[51] flex flex-col transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${drawerOpen ? 'translate-x-0' : 'translate-x-full'} md:rounded-none rounded-t-xl md:top-0 md:bottom-0 max-h-[92vh] md:max-h-none mt-auto md:mt-0`}
      >
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
          <div className="min-w-0 flex-1 mr-2">
            <div id="drawer-title" className="text-lg sm:text-md font-semibold text-[var(--text)] truncate">{drawerContent?.title}</div>
            {drawerContent?.subtitle && <div className="text-sm sm:text-xs text-sub mt-0.5 truncate">{drawerContent.subtitle}</div>}
          </div>
          <button onClick={closeDrawer} aria-label="Close drawer" className="w-11 h-11 sm:w-7 sm:h-7 rounded-md flex items-center justify-center text-muted hover:bg-[var(--hover)] hover:text-sub transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">{drawerContent?.body}</div>
        {drawerContent?.footer && (
          <div className="px-4 sm:px-5 py-3 border-t border-[var(--border)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-1.5 flex-shrink-0">{drawerContent.footer}</div>
        )}
      </div>
    </>
  );
}
