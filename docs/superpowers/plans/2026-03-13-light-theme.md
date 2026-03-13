# Light Theme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully functional light theme with localStorage persistence and flash-of-wrong-theme prevention.

**Architecture:** CSS variable swap approach — `:root` holds light tokens (default), `.dark` holds dark tokens. An inline `<script>` in `<head>` applies the correct class before first paint. Zustand store reads/writes `localStorage('eco-theme')` and mirrors the FOTWT script's default logic.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS (`darkMode: 'class'`), Zustand, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-03-13-light-theme-design.md`

---

## Chunk 1: Core Theme Infrastructure

### Task 1: CSS Variables — Light and Dark Tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Move dark tokens to `.dark` block and add light tokens to `:root`**

Replace the current `:root` block and add a `.dark` block. Also update `::selection`, scrollbar styles, and add the `.dark` variants.

```css
/* ── Design tokens ── */
:root {
  --bg: #ffffff;
  --elevated: #f8f9fa;
  --surface: #f1f3f5;
  --overlay: #e9ecef;
  --hover: #f1f3f5;
  --brand: #3ecf8e;
  --brand-dim: rgba(62,207,142,0.08);
  --brand-border: rgba(62,207,142,0.20);
  --border: #dee2e6;
  --border-strong: #adb5bd;
  --text: #1a1a2e;
  --sub: #495057;
  --muted: #868e96;
  --card-hover: #f1f3f5;
  --row-hover: rgba(0,0,0,0.02);
  --shadow-opacity: 0.08;
}

.dark {
  --bg: #09090b;
  --elevated: #111113;
  --surface: #18181b;
  --overlay: #1e1e22;
  --hover: #1c1c20;
  --brand: #3ecf8e;
  --brand-dim: rgba(62,207,142,0.06);
  --brand-border: rgba(62,207,142,0.15);
  --border: #27272a;
  --border-strong: #3f3f46;
  --text: #fafafa;
  --sub: #a1a1aa;
  --muted: #52525b;
  --card-hover: #1c1c20;
  --row-hover: rgba(255,255,255,0.02);
  --shadow-opacity: 0.3;
}
```

- [ ] **Step 2: Update `::selection` for both themes**

```css
::selection { background: rgba(62,207,142,.15); color: var(--text); }
```

- [ ] **Step 3: Update scrollbar styles for both themes**

```css
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
```

- [ ] **Step 4: Verify the file compiles**

Run: `cd /Users/ottosavasti/Desktop/eco-insight/.claude/worktrees/modest-grothendieck && npx tailwindcss --content './src/**/*.{ts,tsx}' --output /dev/null 2>&1 | head -5`
Expected: No errors (warnings OK)

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): add light/dark CSS variable tokens"
```

---

### Task 2: Tailwind Config — CSS Variable References

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Replace hardcoded theme-sensitive colors with CSS variable references**

Only replace colors that change between themes. Keep semantic colors (danger, warn, info, purple, teal) as hardcoded hex.

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:       'var(--bg)',
        elevated: 'var(--elevated)',
        surface:  'var(--surface)',
        overlay:  'var(--overlay)',
        hover:    'var(--hover)',
        brand:    { DEFAULT: 'var(--brand)', dim: 'var(--brand-dim)', border: 'var(--brand-border)' },
        border:   { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        sub:      'var(--sub)',
        muted:    'var(--muted)',
        text:     'var(--text)',
        danger:   '#ef4444',
        warn:     '#eab308',
        info:     '#60a5fa',
        purple:   '#a78bfa',
        teal:     '#2dd4bf',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        '3xs': ['9px', '12px'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0,0,0,var(--shadow-opacity))',
        md: '0 4px 12px -2px rgba(0,0,0,calc(var(--shadow-opacity) * 1.3))',
        lg: '0 8px 24px -4px rgba(0,0,0,calc(var(--shadow-opacity) * 1.6))',
        ring: '0 0 0 2px var(--brand-border)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease both',
        'slide-up': 'slideUp 0.2s cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
export default config;
```

Note: `boxShadow` uses `var(--shadow-opacity)` with `calc()` for the medium and large variants. Tailwind processes these at build time but the CSS variables resolve at runtime, so this works.

- [ ] **Step 2: Verify build**

Run: `cd /Users/ottosavasti/Desktop/eco-insight/.claude/worktrees/modest-grothendieck && npx next lint 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(theme): use CSS variables in Tailwind color config"
```

---

### Task 3: FOTWT Prevention and Layout Changes

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/theme-init.tsx`

- [ ] **Step 1: Add inline blocking script and remove hardcoded `dark` class**

Replace the current `layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';
import { ThemeInit } from './theme-init';

export const metadata: Metadata = {
  title: 'Eco-Insight · Revenue OS',
  description: 'AI-assisted Revenue OS for the GoO / renewable certificates market',
};

const themeScript = `(function(){try{var t=localStorage.getItem('eco-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <QueryProvider>
          <ThemeInit />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
```

Key changes:
- Removed hardcoded `className="dark"` from `<html>` — the inline script handles it
- Added `suppressHydrationWarning` because the server-rendered HTML won't have the `dark` class but the client might add it before hydration
- Inline script reads localStorage and `prefers-color-scheme`, applies `.dark` before first paint

- [ ] **Step 2: Keep ThemeInit as a sync safety net**

`ThemeInit` still handles theme changes triggered by `toggleTheme()` during the session. Keep it as-is — it's already correct:

```tsx
'use client';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';

export function ThemeInit() {
  const theme = useStore(s => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  return null;
}
```

No changes needed to this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(theme): add FOTWT prevention script in layout"
```

---

### Task 4: Zustand Store — localStorage Persistence

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Update theme initialization to read localStorage**

Update the `theme` initial value and `toggleTheme` function. The initialization logic MUST mirror the FOTWT script's defaults exactly to avoid mismatch.

Replace the theme-related parts of the store:

```typescript
// Replace the theme initial value (line ~28)
theme: (() => {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem('eco-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
})(),

// Replace toggleTheme (line ~32-36)
toggleTheme: () => set(s => {
  const next = s.theme === 'dark' ? 'light' : 'dark';
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', next === 'dark');
    try { localStorage.setItem('eco-theme', next); } catch {}
  }
  return { theme: next };
}),
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/ottosavasti/Desktop/eco-insight/.claude/worktrees/modest-grothendieck && npx tsc --noEmit 2>&1 | head -10`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(theme): persist theme preference to localStorage"
```

---

## Chunk 2: Build Verification and Testing

### Task 5: Full Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full build**

Run: `cd /Users/ottosavasti/Desktop/eco-insight/.claude/worktrees/modest-grothendieck && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors. Warnings about missing env vars or DB are OK.

- [ ] **Step 2: Run lint**

Run: `cd /Users/ottosavasti/Desktop/eco-insight/.claude/worktrees/modest-grothendieck && npm run lint 2>&1 | tail -10`
Expected: No new lint errors

- [ ] **Step 3: Run existing tests**

Run: `cd /Users/ottosavasti/Desktop/eco-insight/.claude/worktrees/modest-grothendieck && npm test 2>&1 | tail -20`
Expected: All existing tests pass

- [ ] **Step 4: Fix any issues found in steps 1-3, then commit fixes if needed**

---

### Task 6: Visual Verification with Dev Server

**Files:** None (verification only)

- [ ] **Step 1: Start dev server and take screenshot of light mode**

Start the dev server, navigate to the home page. Verify:
- Light background, dark text, visible borders
- Brand green elements render correctly
- Score pills readable
- Sidebar looks correct

- [ ] **Step 2: Toggle to dark mode and verify**

Click the theme toggle in the sidebar. Verify:
- Dark background, light text
- All elements match the previous dark-only appearance
- Toggle icon changes (Sun → Moon or vice versa)

- [ ] **Step 3: Reload and verify persistence**

Reload the page. Verify:
- Theme persists (still dark if toggled to dark)
- No flash of wrong theme

- [ ] **Step 4: Test with no localStorage (incognito or clear storage)**

Clear localStorage or use incognito. Verify:
- Falls back to `prefers-color-scheme` or light if no preference
- No errors in console

- [ ] **Step 5: Check login page in both themes**

Navigate to `/login`. Verify:
- Login page renders correctly in light mode
- Login page renders correctly in dark mode

---

### Task 7: Edge Case Fixes (if needed)

**Files:** Various component files (only if visual verification reveals issues)

- [ ] **Step 1: Audit and fix any elements that don't respond to theme**

Check for any remaining hardcoded colors that look wrong in light mode. The `text-[#09090b]` pattern on brand buttons is intentional (dark text on green) and should NOT be changed.

Look specifically for:
- Hardcoded background colors that should use `bg-bg`, `bg-elevated`, `bg-surface`
- Hardcoded border colors that should use `border-border`
- Hardcoded text colors that should use `text-text`, `text-sub`, `text-muted`

- [ ] **Step 2: Commit any fixes**

```bash
git add -A
git commit -m "fix(theme): correct theme-insensitive colors in components"
```

---

### Task 8: Final Commit and Cleanup

- [ ] **Step 1: Run full verification suite one more time**

```bash
cd /Users/ottosavasti/Desktop/eco-insight/.claude/worktrees/modest-grothendieck
npm run lint && npm test && npm run build
```
Expected: All pass

- [ ] **Step 2: Verify clean git status**

```bash
git status
git log --oneline -5
```

Expected: All changes committed, no unstaged files.
