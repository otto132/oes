'use client';
import type React from 'react';
import { create } from 'zustand';

interface Store {
  theme: 'dark' | 'light';
  drawerOpen: boolean;
  drawerContent: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode } | null;
  toggleTheme: () => void;
  openDrawer: (c: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode }) => void;
  closeDrawer: () => void;
}

export const useStore = create<Store>((set) => ({
  theme: 'dark',
  drawerOpen: false,
  drawerContent: null,
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', next === 'dark');
    return { theme: next };
  }),
  openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
