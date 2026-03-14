'use client';
import type React from 'react';
import { create } from 'zustand';

/* ── Toast ── */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; href: string };
}

interface Store {
  theme: 'dark' | 'light';
  drawerOpen: boolean;
  drawerContent: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode } | null;
  paletteOpen: boolean;
  toasts: Toast[];
  toggleTheme: () => void;
  openDrawer: (c: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode }) => void;
  closeDrawer: () => void;
  openPalette: () => void;
  closePalette: () => void;
  addToast: (toast: { type: Toast['type']; message: string; action?: Toast['action'] }) => void;
  removeToast: (id: string) => void;
}

let _toastCounter = 0;

export const useStore = create<Store>((set, get) => ({
  theme: (() => {
    if (typeof window === 'undefined') return 'dark' as const;
    try {
      const stored = localStorage.getItem('eco-theme');
      if (stored === 'dark' || stored === 'light') return stored;
      return 'dark' as const;
    } catch { return 'dark' as const; }
  })(),
  drawerOpen: false,
  drawerContent: null,
  paletteOpen: false,
  toasts: [],
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' as const : 'dark' as const;
    try { localStorage.setItem('eco-theme', next); } catch {}
    set({ theme: next });
  },
  openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
  closeDrawer: () => set({ drawerOpen: false }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  addToast: (toast) => {
    const id = `toast-${++_toastCounter}-${Date.now()}`;
    const newToast: Toast = { id, ...toast };
    set(s => {
      const next = [...s.toasts, newToast];
      // Keep max 3 visible — dismiss oldest if exceeded
      return { toasts: next.length > 3 ? next.slice(next.length - 3) : next };
    });
    // Longer timeout for toasts with action links
    setTimeout(() => get().removeToast(id), toast.action ? 8000 : 5000);
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
