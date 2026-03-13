'use client';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';

export function ThemeInit() {
  const theme = useStore(s => s.theme);

  // On mount, hydrate store from localStorage (the inline script in layout.tsx
  // already applied the correct class to <html> before first paint).
  useEffect(() => {
    try {
      const stored = localStorage.getItem('eco-theme') as 'dark' | 'light' | null;
      if (stored && stored !== useStore.getState().theme) {
        useStore.setState({ theme: stored });
      }
    } catch {}
  }, []);

  // Keep <html> class in sync when store changes (e.g. from toggle button)
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return null;
}
