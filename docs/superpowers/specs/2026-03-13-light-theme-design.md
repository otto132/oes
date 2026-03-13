# Light Theme Implementation (UX-04 + UX-05)

## Summary

Implement a fully functional light theme and persist the user's preference to localStorage. The toggle button already exists in the Sidebar; the Zustand store already manages `theme` state and toggles the `.dark` class. This spec covers defining light-mode CSS tokens, wiring localStorage persistence, and preventing flash-of-wrong-theme (FOTWT).

## Approach

**CSS variable swap** — `:root` = light (default), `.dark` = current dark values. This follows the Tailwind `darkMode: 'class'` convention.

## Files Changed

| File | Change |
|------|--------|
| `src/app/globals.css` | Move current dark tokens to `.dark {}` block; add light tokens to `:root`; adjust scrollbar, score pill, and selection colors for both themes |
| `tailwind.config.ts` | Replace hardcoded hex colors with `var(--token)` references so Tailwind utilities respect the active theme |
| `src/lib/store.ts` | Read initial theme from `localStorage('eco-theme')`; write on toggle |
| `src/app/layout.tsx` | Add inline `<script>` in `<head>` for FOTWT prevention; remove hardcoded `className="dark"` |
| `src/app/theme-init.tsx` | Simplify or remove — the inline script handles initial class application |

## Light Palette

Designed for readability on white backgrounds while keeping the brand green (#3ecf8e) consistent.

| Token | Light Value | Dark Value (existing) |
|-------|-------------|----------------------|
| `--bg` | `#ffffff` | `#09090b` |
| `--elevated` | `#f8f9fa` | `#111113` |
| `--surface` | `#f1f3f5` | `#18181b` |
| `--overlay` | `#e9ecef` | `#1e1e22` |
| `--hover` | `#f1f3f5` | `#1c1c20` |
| `--brand` | `#3ecf8e` | `#3ecf8e` |
| `--brand-dim` | `rgba(62,207,142,0.06)` | `rgba(62,207,142,0.06)` |
| `--brand-border` | `rgba(62,207,142,0.20)` | `rgba(62,207,142,0.15)` |
| `--border` | `#dee2e6` | `#27272a` |
| `--border-strong` | `#adb5bd` | `#3f3f46` |
| `--text` | `#1a1a2e` | `#fafafa` |
| `--sub` | `#495057` | `#a1a1aa` |
| `--muted` | `#868e96` | `#52525b` |
| `--card-hover` | `#f1f3f5` | `#1c1c20` |
| `--row-hover` | `rgba(0,0,0,0.02)` | `rgba(255,255,255,0.02)` |

## FOTWT Prevention

An inline `<script>` in `layout.tsx`'s `<head>` reads `localStorage('eco-theme')` and applies the `.dark` class before the first paint. This runs synchronously and blocks rendering for ~1ms — no visible flash.

```html
<script dangerouslySetInnerHTML={{ __html: `
  (function(){
    try {
      var t = localStorage.getItem('eco-theme');
      if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    } catch(e) {}
  })();
`}} />
```

Default behavior: if no preference stored, respect `prefers-color-scheme` media query. Falls back to light if media query unavailable.

## Zustand Store Changes

```typescript
// store.ts — theme initialization
theme: (typeof window !== 'undefined' && localStorage.getItem('eco-theme') as 'dark' | 'light') || 'dark',

// toggleTheme — persist
toggleTheme: () => set(s => {
  const next = s.theme === 'dark' ? 'light' : 'dark';
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('eco-theme', next);
  }
  return { theme: next };
}),
```

## Tailwind Config Changes

Replace hardcoded color hex values with CSS variable references so that utility classes like `bg-bg`, `text-text`, `border-border` automatically respond to theme changes:

```typescript
colors: {
  bg: 'var(--bg)',
  elevated: 'var(--elevated)',
  surface: 'var(--surface)',
  // ... etc
}
```

Semantic colors (danger, warn, info, purple, teal) stay as hardcoded hex since they don't change between themes.

## Score Pills & Semantic Colors

Score pill colors (green/yellow/red) and confidence dots remain the same in both themes — they're semantic and already have sufficient contrast on both light and dark backgrounds via their semi-transparent background approach.

## Scrollbar Styling

Light mode scrollbars need lighter track/thumb colors. The `.dark` block retains current dark scrollbar colors.

## Testing Criteria

1. Toggle switches between light and dark without page reload
2. Preference persists across page reloads and new tabs
3. No FOTWT on initial load
4. All pages readable in both themes (text contrast, borders visible, interactive elements distinguishable)
5. Score pills, confidence dots, and brand green render correctly in both themes
6. `prefers-color-scheme` respected when no localStorage preference exists

## Out of Scope

- Per-page theme overrides
- System theme auto-sync (beyond initial load)
- Custom theme colors / theme editor
- Color scheme for third-party components (none exist currently)
