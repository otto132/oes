'use client';
import { useStore } from '@/lib/store';
import { X } from 'lucide-react';

export default function Drawer() {
  const { drawerOpen, drawerContent, closeDrawer } = useStore();
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-150 ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={closeDrawer}
      />
      <div className={`fixed right-0 top-0 bottom-0 w-full md:w-[480px] bg-[var(--elevated)] border-l border-[var(--border)] shadow-lg z-[51] flex flex-col transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${drawerOpen ? 'translate-x-0' : 'translate-x-full'} md:rounded-none rounded-t-xl md:top-0 md:bottom-0 max-h-[92vh] md:max-h-none mt-auto md:mt-0`}>
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
          <div>
            <div className="text-[14px] font-semibold text-[var(--text)]">{drawerContent?.title}</div>
            {drawerContent?.subtitle && <div className="text-[11px] text-sub mt-0.5">{drawerContent.subtitle}</div>}
          </div>
          <button onClick={closeDrawer} className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:bg-[var(--hover)] hover:text-sub transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{drawerContent?.body}</div>
        {drawerContent?.footer && (
          <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-end gap-1.5 flex-shrink-0">{drawerContent.footer}</div>
        )}
      </div>
    </>
  );
}
