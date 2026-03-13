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
  toasts: Toast[];
  toggleTheme: () => void;
  openDrawer: (c: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode }) => void;
  closeDrawer: () => void;
  addToast: (toast: { type: Toast['type']; message: string; action?: Toast['action'] }) => void;
  removeToast: (id: string) => void;
}

let _toastCounter = 0;

export const useStore = create<Store>((set, get) => ({
  theme: 'dark',
  drawerOpen: false,
  drawerContent: null,
  toasts: [],
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', next === 'dark');
    return { theme: next };
  }),
  openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
  closeDrawer: () => set({ drawerOpen: false }),
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
