# Task Management Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade task management with mobile nav, goal grouping toggle, better @mentions, easier assignment, due date reminders, and subtasks.

**Architecture:** Six independent features built on existing task infrastructure. New `Subtask` Prisma model, two new shared UI components (`UserPicker`, `UserMentionInput`), one new API endpoint (`check-due`), and incremental changes to existing task page/API. Each task produces working, testable software.

**Tech Stack:** Next.js 15 (App Router), React 19, Prisma 6, PostgreSQL, Zustand, React Query, Tailwind CSS, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-14-task-management-upgrade-design.md`

---

## Chunk 1: Schema, Shared Components, and Bottom Nav

### Task 1: Prisma Schema — Subtask Model + Notification Types

**Files:**
- Modify: `prisma/schema.prisma:173-177` (NotificationType enum)
- Modify: `prisma/schema.prisma:482-512` (Task model — add subtasks relation)
- Create: new Subtask model after TaskComment (after line 528)

- [ ] **Step 1: Add `TASK_DUE` and `TASK_OVERDUE` to NotificationType enum**

In `prisma/schema.prisma`, update the enum:

```prisma
enum NotificationType {
  QUEUE_ITEM
  TASK_ASSIGNED
  MENTION
  TASK_DUE
  TASK_OVERDUE
}
```

- [ ] **Step 2: Add Subtask model**

After the `TaskComment` model (after line 528), add:

```prisma
model Subtask {
  id        String   @id @default(cuid())
  title     String
  done      Boolean  @default(false)
  position  Int      @default(0)
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  taskId    String
  createdAt DateTime @default(now())

  @@index([taskId])
}
```

- [ ] **Step 3: Add subtasks relation to Task model**

In the Task model, after the `comments` relation (line 504), add:

```prisma
  subtasks   Subtask[]
```

- [ ] **Step 4: Generate Prisma migration**

Run: `npx prisma migrate dev --name add-subtasks-and-notification-types`
Expected: Migration created successfully, no errors.

- [ ] **Step 5: Verify generated client**

Run: `npx prisma generate`
Expected: Prisma Client generated, `Subtask` type available.

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat(schema): add Subtask model and TASK_DUE/TASK_OVERDUE notification types"
```

---

### Task 2: Subtask Validation Schema

**Files:**
- Modify: `src/lib/schemas/tasks.ts`

- [ ] **Step 1: Write test for subtask schema validation**

Create `src/lib/schemas/__tests__/tasks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { patchTaskSchema } from '../tasks';

describe('patchTaskSchema — subtasks', () => {
  it('accepts valid subtasks array', () => {
    const result = patchTaskSchema.safeParse({
      subtasks: [
        { title: 'Do thing', done: false, position: 0 },
        { id: 'existing-1', title: 'Done thing', done: true, position: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects subtask with empty title', () => {
    const result = patchTaskSchema.safeParse({
      subtasks: [{ title: '', done: false, position: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 subtasks', () => {
    const subtasks = Array.from({ length: 21 }, (_, i) => ({
      title: `Task ${i}`, done: false, position: i,
    }));
    const result = patchTaskSchema.safeParse({ subtasks });
    expect(result.success).toBe(false);
  });

  it('rejects subtask title over 200 chars', () => {
    const result = patchTaskSchema.safeParse({
      subtasks: [{ title: 'x'.repeat(201), done: false, position: 0 }],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/schemas/__tests__/tasks.test.ts`
Expected: FAIL — `subtasks` not recognized by current schema.

- [ ] **Step 3: Add subtask schema to patchTaskSchema**

In `src/lib/schemas/tasks.ts`, add the subtask schema and update `patchTaskSchema`:

```typescript
import { z } from 'zod';

const subtaskSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
  position: z.number().int().min(0),
});

export const patchTaskSchema = z.object({
  title: z.string().trim().min(1).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigneeIds: z.array(z.string()).optional(),
  reviewerId: z.string().nullable().optional(),
  notes: z.string().optional(),
  subtasks: z.array(subtaskSchema).max(20).optional(),
}).superRefine((obj, ctx) => {
  if (!Object.values(obj).some(v => v !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});

// taskActionSchema unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/schemas/__tests__/tasks.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/
git commit -m "feat(schema): add subtask validation to patchTaskSchema"
```

---

### Task 3: Types and Adapters — Subtask Support

**Files:**
- Modify: `src/lib/types.ts:108-126`
- Modify: `src/lib/adapters.ts:261-310`

- [ ] **Step 1: Add Subtask type and update Task/TaskComment types**

In `src/lib/types.ts`, after the `TaskPriority` type (line 110):

```typescript
export interface Subtask {
  id: ID; title: string; done: boolean; position: number;
}
```

Update `TaskComment` to clarify mentions store IDs:

```typescript
export interface TaskComment { author: User; text: string; createdAt: string; mentions?: string[]; }
```

(No change needed — `mentions` already stores strings, which will now be user IDs.)

Update `Task` to include subtask counts and optional full subtasks:

```typescript
export interface Task {
  id: ID; title: string; accountName: string; accountId: ID;
  dueDate: string; owner: User; assignees?: User[];
  priority: TaskPriority; status: TaskStatus; source: string;
  goalId?: ID; reviewer?: User; comments: TaskComment[];
  completedAt?: string; notes?: string;
  subtasksDone?: number; subtasksTotal?: number;
  subtasks?: Subtask[];
}
```

- [ ] **Step 2: Add adaptSubtask and update adaptTask**

In `src/lib/adapters.ts`, add before `adaptTask`:

```typescript
export function adaptSubtask(s: {
  id: string;
  title: string;
  done: boolean;
  position: number;
  [k: string]: unknown;
}): import('./types').Subtask {
  return { id: s.id, title: s.title, done: s.done, position: s.position };
}
```

Update `adaptTask` to accept optional subtasks and _count:

Add to the `adaptTask` parameter type:

```typescript
  _count?: { subtasks?: number };
  subtasks?: Parameters<typeof adaptSubtask>[0][];
```

Add to the parameter type:

```typescript
  _subtasksDone?: number;
```

Add to the return object (before the closing `};`):

```typescript
    ...(t._count?.subtasks ? {
      subtasksTotal: t._count.subtasks,
      subtasksDone: t._subtasksDone ?? (t.subtasks || []).filter(s => s.done).length,
    } : {}),
    ...(t.subtasks ? { subtasks: t.subtasks.map(adaptSubtask).sort((a, b) => a.position - b.position) } : {}),
```

Note: For the task list GET, we use Prisma's `_count` with a where filter for done subtasks to avoid loading all subtask rows. The `_subtasksDone` field is set from a separate count query. For the detail view (PATCH response), full subtask data is already loaded so we compute inline.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run`
Expected: All existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/adapters.ts
git commit -m "feat(types): add Subtask type and adapter"
```

---

### Task 4: UserPicker Component

**Files:**
- Create: `src/components/ui/UserPicker.tsx`

- [ ] **Step 1: Create the UserPicker component**

Create `src/components/ui/UserPicker.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/UserPicker.tsx
git commit -m "feat(ui): add UserPicker dropdown component"
```

---

### Task 5: UserMentionInput Component

**Files:**
- Create: `src/components/ui/UserMentionInput.tsx`

- [ ] **Step 1: Create the UserMentionInput component**

Create `src/components/ui/UserMentionInput.tsx`:

```tsx
'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { UserPicker } from './UserPicker';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

interface UserMentionInputProps {
  value: string;
  onChange: (text: string, mentionedUserIds: string[]) => void;
  onSubmit?: () => void;
  users: User[];
  placeholder?: string;
  className?: string;
}

export function UserMentionInput({ value, onChange, onSubmit, users, placeholder, className }: UserMentionInputProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset mentionedIds when value is cleared externally (e.g., after submit)
  useEffect(() => {
    if (!value) setMentionedIds([]);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Check if we're in a mention context
    const textBeforeCursor = text.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? text[atIndex - 1] : ' ';
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !/\s/.test(textAfterAt)) {
        setShowPicker(true);
        setMentionStart(atIndex);
      } else {
        setShowPicker(false);
      }
    } else {
      setShowPicker(false);
    }

    onChange(text, mentionedIds);
  }, [onChange, mentionedIds]);

  const handleSelect = useCallback((user: User) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const before = value.slice(0, mentionStart);
    const after = value.slice(textarea.selectionStart);
    const newText = `${before}@${user.name} ${after}`;
    const newIds = [...mentionedIds, user.id];

    setMentionedIds(newIds);
    onChange(newText, newIds);
    setShowPicker(false);

    // Refocus textarea
    setTimeout(() => {
      textarea.focus();
      const pos = mentionStart + user.name.length + 2; // @Name + space
      textarea.setSelectionRange(pos, pos);
    }, 0);
  }, [value, mentionStart, mentionedIds, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={2}
        placeholder={placeholder || 'Add a comment... Use @ to mention'}
        className={cn(
          'w-full px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none',
          className
        )}
      />
      {showPicker && (
        <UserPicker
          users={users}
          selectedIds={mentionedIds}
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
          className="bottom-full mb-1 left-0"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/UserMentionInput.tsx
git commit -m "feat(ui): add UserMentionInput component with @mention autocomplete"
```

---

### Task 6: Mobile Bottom Nav — Add Tasks

**Files:**
- Modify: `src/components/layout/BottomNav.tsx`

- [ ] **Step 1: Write E2E test for Tasks in bottom nav**

Create `e2e/bottom-nav-tasks.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Bottom Nav — Tasks tab', () => {
  test('Tasks tab is visible on mobile and navigates to /tasks', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check Tasks tab exists in bottom nav
    const tasksTab = page.locator('nav.fixed a[href="/tasks"]');
    await expect(tasksTab).toBeVisible();
    await expect(tasksTab).toContainText('Tasks');

    // Click and verify navigation
    await tasksTab.click();
    await expect(page).toHaveURL(/\/tasks/);
  });

  test('More/Settings tab is NOT in bottom nav', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const moreTab = page.locator('nav.fixed a[href="/settings"]');
    await expect(moreTab).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Update BottomNav.tsx**

Replace the full content of `src/components/layout/BottomNav.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Shield, TrendingUp, Inbox, CheckSquare } from 'lucide-react';
import { useBadgeCounts } from '@/lib/queries/badge-counts';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/queue', label: 'Queue', icon: Shield, badgeKey: 'queue' as const },
  { href: '/pipeline', label: 'Pipeline', icon: TrendingUp },
  { href: '/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'inbox' as const },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, badgeKey: 'tasks' as const },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { data: bc } = useBadgeCounts();
  const badges: Record<string, number> = {
    queue: bc?.queue ?? 0,
    inbox: bc?.inbox ?? 0,
    tasks: bc?.tasks ?? 0,
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-elevated/90 backdrop-blur-sm border-t border-border z-30 flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(tab => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        const badge = tab.badgeKey ? badges[tab.badgeKey] : 0;
        return (
          <Link key={tab.href} href={tab.href} className={cn('flex flex-col items-center gap-0.5 py-1.5 px-2.5 rounded-md flex-1 min-w-0', active ? 'text-brand' : 'text-muted')}>
            <div className="relative">
              <tab.icon className="w-5 h-5" />
              {badge > 0 && <span className="absolute -top-0.5 -right-1.5 min-w-[14px] h-[14px] rounded-full text-[8px] font-bold flex items-center justify-center px-[3px] bg-brand text-[#09090b]">{badge}</span>}
            </div>
            <span className="text-[9px] font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Fix badge-counts query to scope tasks to current user**

In `src/app/api/badge-counts/route.ts`, update the `overdueTasks` query (line 17) to scope to the current user:

Replace:
```typescript
db.task.count({ where: { status: { not: 'Done' }, due: { lt: new Date() } } }),
```

With:
```typescript
(() => {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return db.task.count({
    where: {
      status: { not: 'Done' },
      due: { lte: endOfToday },
      OR: [
        { ownerId: session.user.id },
        { assignees: { some: { id: session.user.id } } },
      ],
    },
  });
})(),
```

- [ ] **Step 4: Verify unit tests pass**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/BottomNav.tsx src/app/api/badge-counts/route.ts e2e/bottom-nav-tasks.spec.ts
git commit -m "feat(nav): replace More with Tasks in mobile bottom nav, scope badge count to user"
```

---

### Task 7: Zustand Store — Task View Mode

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Add taskViewMode to store**

In `src/lib/store.ts`, add to the `Store` interface:

```typescript
taskViewMode: 'grouped' | 'flat';
setTaskViewMode: (mode: 'grouped' | 'flat') => void;
```

Add to the `create<Store>` initializer (after `toasts: []`):

```typescript
taskViewMode: 'grouped',
setTaskViewMode: (mode) => set({ taskViewMode: mode }),
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(store): add taskViewMode preference to Zustand store"
```

---

## Chunk 2: Backend Changes — Mentions, Subtasks API, Due Date Notifications

### Task 8: Comment Handler — Use mentionedUserIds

**Files:**
- Modify: `src/app/api/tasks/route.ts:129-153`
- Test: `src/app/api/__tests__/tasks.test.ts`

- [ ] **Step 1: Write test for mentionedUserIds-based mentions**

Add to `src/app/api/__tests__/tasks.test.ts`:

```typescript
// Add to mockDb (in vi.hoisted):
// taskComment: { create: fn() },
// user: { findMany: fn() },

describe('POST /api/tasks (comment action)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('uses mentionedUserIds for notifications instead of regex parsing', async () => {
    const comment = {
      id: 'comment-1',
      text: 'Hey @Nick check this',
      mentions: ['user-2'],
      createdAt: new Date(),
      author: mockOwner,
    };
    mockDb.taskComment.create.mockResolvedValue(comment);

    const res = await POST(
      makeRequest({
        action: 'comment',
        id: 'task-1',
        text: 'Hey @Nick check this',
        mentionedUserIds: ['user-2'],
      }),
    );

    expect(res.status).toBe(201);

    // Should use mentionedUserIds directly, NOT look up users by name
    expect(mockDb.user.findMany).not.toHaveBeenCalled();

    // Comment should store user IDs in mentions field
    expect(mockDb.taskComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mentions: ['user-2'],
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/__tests__/tasks.test.ts`
Expected: FAIL — current code uses regex and `user.findMany`.

- [ ] **Step 3: Update comment handler to use mentionedUserIds**

In `src/app/api/tasks/route.ts`, replace the comment action block (lines 129-153):

```typescript
  if (body.action === 'comment') {
    const { id, text, mentionedUserIds } = body;
    const userId = session.user.id;
    const mentions = mentionedUserIds || [];
    const comment = await db.taskComment.create({
      data: { text, taskId: id, authorId: userId, mentions },
      include: { author: true },
    });
    // Notify mentioned users by ID directly
    if (mentions.length > 0) {
      await notifyUsers(db, mentions, userId, {
        type: 'MENTION',
        title: 'You were mentioned',
        message: text.slice(0, 100),
        entityType: 'TaskComment',
        entityId: comment.id,
      });
    }
    return NextResponse.json({ data: adaptTaskComment(comment) }, { status: 201 });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/__tests__/tasks.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Update api-client to pass mentionedUserIds**

In `src/lib/api-client.ts`, update the comment function:

```typescript
comment: (id: string, text: string, mentionedUserIds?: string[]) =>
  post<any>('/tasks', { action: 'comment', id, text, mentionedUserIds }),
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tasks/route.ts src/app/api/__tests__/tasks.test.ts src/lib/api-client.ts
git commit -m "feat(api): use mentionedUserIds for comment notifications instead of regex"
```

---

### Task 9: Subtask CRUD in PATCH /api/tasks/[id]

**Files:**
- Modify: `src/app/api/tasks/[id]/route.ts`
- Test: `src/app/api/__tests__/tasks-patch.test.ts` (new)

- [ ] **Step 1: Write tests for subtask CRUD via PATCH**

Create `src/app/api/__tests__/tasks-patch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      task: { findUnique: fn(), update: fn() },
      subtask: { deleteMany: fn(), create: fn(), update: fn(), findMany: fn() },
      $transaction: fn(),
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/scoped-db', () => ({ scopedDb: () => mockDb, ScopedDb: {} }));

import { PATCH } from '../tasks/[id]/route';

const USER_ID = 'user-1';
const mockOwner = { id: USER_ID, name: 'Test', initials: 'TU', role: 'rep', color: 'default' };

function makeRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/tasks/[id] — subtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFn.mockResolvedValue({ user: { id: USER_ID } });
  });

  it('creates new subtasks when no id is provided', async () => {
    const existing = { id: 'task-1', title: 'Test', ownerId: USER_ID };
    mockDb.task.findUnique.mockResolvedValue(existing);
    mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb));
    mockDb.subtask.findMany.mockResolvedValue([]);
    mockDb.subtask.create.mockResolvedValue({ id: 'sub-1', title: 'Step 1', done: false, position: 0 });
    mockDb.task.update.mockResolvedValue({
      ...existing, owner: mockOwner, assignees: [], reviewer: null,
      account: null, comments: [], subtasks: [{ id: 'sub-1', title: 'Step 1', done: false, position: 0 }],
      _count: { subtasks: 1 }, due: null, completedAt: null, source: 'Manual', priority: 'Medium', status: 'Open', goalId: null,
    });

    const res = await PATCH(
      makeRequest('task-1', {
        subtasks: [{ title: 'Step 1', done: false, position: 0 }],
      }),
      { params: Promise.resolve({ id: 'task-1' }) },
    );

    expect(res.status).toBe(200);
    expect(mockDb.subtask.create).toHaveBeenCalled();
  });

  it('updates existing subtasks when id is provided', async () => {
    const existing = { id: 'task-1', title: 'Test', ownerId: USER_ID };
    mockDb.task.findUnique.mockResolvedValue(existing);
    mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb));
    mockDb.subtask.findMany.mockResolvedValue([{ id: 'sub-1' }]);
    mockDb.subtask.update.mockResolvedValue({ id: 'sub-1', title: 'Updated', done: true, position: 0 });
    mockDb.task.update.mockResolvedValue({
      ...existing, owner: mockOwner, assignees: [], reviewer: null,
      account: null, comments: [], subtasks: [{ id: 'sub-1', title: 'Updated', done: true, position: 0 }],
      _count: { subtasks: 1 }, due: null, completedAt: null, source: 'Manual', priority: 'Medium', status: 'Open', goalId: null,
    });

    const res = await PATCH(
      makeRequest('task-1', {
        subtasks: [{ id: 'sub-1', title: 'Updated', done: true, position: 0 }],
      }),
      { params: Promise.resolve({ id: 'task-1' }) },
    );

    expect(res.status).toBe(200);
    expect(mockDb.subtask.update).toHaveBeenCalled();
  });

  it('deletes subtasks not in the array', async () => {
    const existing = { id: 'task-1', title: 'Test', ownerId: USER_ID };
    mockDb.task.findUnique.mockResolvedValue(existing);
    mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb));
    mockDb.subtask.findMany.mockResolvedValue([{ id: 'sub-1' }, { id: 'sub-2' }]);
    mockDb.subtask.deleteMany.mockResolvedValue({ count: 1 });
    mockDb.subtask.update.mockResolvedValue({ id: 'sub-1', title: 'Keep', done: false, position: 0 });
    mockDb.task.update.mockResolvedValue({
      ...existing, owner: mockOwner, assignees: [], reviewer: null,
      account: null, comments: [], subtasks: [{ id: 'sub-1', title: 'Keep', done: false, position: 0 }],
      _count: { subtasks: 1 }, due: null, completedAt: null, source: 'Manual', priority: 'Medium', status: 'Open', goalId: null,
    });

    const res = await PATCH(
      makeRequest('task-1', {
        subtasks: [{ id: 'sub-1', title: 'Keep', done: false, position: 0 }],
      }),
      { params: Promise.resolve({ id: 'task-1' }) },
    );

    expect(res.status).toBe(200);
    // sub-2 should have been deleted
    expect(mockDb.subtask.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          taskId: 'task-1',
          id: { notIn: ['sub-1'] },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/__tests__/tasks-patch.test.ts`
Expected: FAIL — current PATCH handler doesn't handle subtasks.

- [ ] **Step 3: Implement subtask handling in PATCH**

Update `src/app/api/tasks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { adaptTask } from '@/lib/adapters';
import { patchTaskSchema } from '@/lib/schemas/tasks';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';
import { notifyUsers } from '@/lib/notifications';

const TASK_INCLUDE = {
  owner: true,
  assignees: true,
  reviewer: true,
  account: { select: { id: true, name: true } },
  comments: { include: { author: true }, orderBy: { createdAt: 'asc' as const } },
  subtasks: { orderBy: { position: 'asc' as const } },
  _count: { select: { subtasks: true } },
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const { id } = await params;

  const raw = await req.json();
  const parsed = patchTaskSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) return notFound('Task not found');

  // Handle subtasks in a transaction
  if (body.subtasks !== undefined) {
    await db.$transaction(async (tx: any) => {
      const existingSubtasks = await tx.subtask.findMany({ where: { taskId: id }, select: { id: true } });
      const existingIds = existingSubtasks.map((s: any) => s.id);
      const incomingIds = body.subtasks!.filter(s => s.id).map(s => s.id!);

      // Delete subtasks not in incoming array
      const toDelete = existingIds.filter((eid: string) => !incomingIds.includes(eid));
      if (toDelete.length > 0) {
        await tx.subtask.deleteMany({ where: { taskId: id, id: { notIn: incomingIds } } });
      }

      // Create or update each subtask
      for (const sub of body.subtasks!) {
        if (sub.id && existingIds.includes(sub.id)) {
          await tx.subtask.update({ where: { id: sub.id }, data: { title: sub.title, done: sub.done, position: sub.position } });
        } else {
          await tx.subtask.create({ data: { title: sub.title, done: sub.done, position: sub.position, taskId: id } });
        }
      }
    });
  }

  // Build task update data (non-subtask fields)
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.due !== undefined) data.due = new Date(body.due);
  if (body.assigneeIds !== undefined) {
    data.assignees = { set: body.assigneeIds.map(aid => ({ id: aid })) };
  }
  if (body.reviewerId !== undefined) {
    data.reviewerId = body.reviewerId;
  }
  if (body.notes !== undefined) data.notes = body.notes;

  // Only run task update if there are non-subtask fields to change,
  // or always run it to get the fresh include data
  const updated = await db.task.update({
    where: { id },
    data: Object.keys(data).length > 0 ? data : {},
    include: TASK_INCLUDE,
  });

  // Notify new assignees if assigneeIds changed
  if (body.assigneeIds !== undefined) {
    await notifyUsers(db, body.assigneeIds, session.user.id, {
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      message: updated.title.slice(0, 100),
      entityType: 'Task',
      entityId: id,
    });
  }

  return NextResponse.json({ data: adaptTask(updated as any) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/__tests__/tasks-patch.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks/[id]/route.ts src/app/api/__tests__/tasks-patch.test.ts
git commit -m "feat(api): add subtask CRUD to PATCH /api/tasks/[id]"
```

---

### Task 10: Include Subtask Counts in GET /api/tasks

**Files:**
- Modify: `src/app/api/tasks/route.ts:32-38` (GET handler)

- [ ] **Step 1: Update GET to include subtask counts**

In `src/app/api/tasks/route.ts`, update the task `findMany` include (line 34) to add:

```typescript
subtasks: { orderBy: { position: 'asc' as const } },
_count: { select: { subtasks: true } },
```

The full include becomes:

```typescript
include: {
  owner: true,
  assignees: true,
  reviewer: true,
  goal: true,
  account: { select: { id: true, name: true } },
  comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
  subtasks: { orderBy: { position: 'asc' as const } },
  _count: { select: { subtasks: true } },
},
```

- [ ] **Step 2: Verify existing tests pass**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/route.ts
git commit -m "feat(api): include subtask data and counts in task GET response"
```

---

### Task 11: Due Date Check Endpoint

**Files:**
- Create: `src/app/api/tasks/check-due/route.ts`
- Test: `src/app/api/__tests__/tasks-check-due.test.ts` (new)

- [ ] **Step 1: Write test for check-due endpoint**

Create `src/app/api/__tests__/tasks-check-due.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuthFn, mockCreateNotification } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      task: { findMany: fn() },
    },
    mockAuthFn: fn(),
    mockCreateNotification: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/scoped-db', () => ({ scopedDb: () => mockDb, ScopedDb: {} }));
vi.mock('@/lib/notifications', () => ({ createNotification: mockCreateNotification }));

import { POST } from '../tasks/check-due/route';

const USER_ID = 'user-1';

describe('POST /api/tasks/check-due', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFn.mockResolvedValue({ user: { id: USER_ID } });
  });

  it('creates TASK_OVERDUE notifications for overdue tasks', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockDb.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Overdue task',
        due: yesterday,
        ownerId: USER_ID,
        assignees: [{ id: USER_ID }],
      },
    ]);
    mockCreateNotification.mockResolvedValue({ id: 'notif-1' });

    const res = await POST(new NextRequest('http://localhost/api/tasks/check-due', { method: 'POST' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.processed).toBeGreaterThan(0);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'TASK_OVERDUE', entityId: 'task-1' }),
    );
  });

  it('skips tasks that already have unread notifications (dedup returns null)', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockDb.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Overdue task',
        due: yesterday,
        ownerId: USER_ID,
        assignees: [{ id: USER_ID }],
      },
    ]);
    mockCreateNotification.mockResolvedValue(null); // createNotification dedup returns null

    const res = await POST(new NextRequest('http://localhost/api/tasks/check-due', { method: 'POST' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.processed).toBe(0); // null means deduped, not counted
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await POST(new NextRequest('http://localhost/api/tasks/check-due', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/__tests__/tasks-check-due.test.ts`
Expected: FAIL — endpoint doesn't exist yet.

- [ ] **Step 3: Create check-due endpoint**

Create `src/app/api/tasks/check-due/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';
import { createNotification } from '@/lib/notifications';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);

  // Find all non-done tasks with due dates <= today
  const tasks = await db.task.findMany({
    where: {
      status: { not: 'Done' },
      due: { lte: endOfToday },
    },
    select: {
      id: true,
      title: true,
      due: true,
      ownerId: true,
      assignees: { select: { id: true } },
    },
  });

  let processed = 0;

  for (const task of tasks) {
    const isOverdue = task.due! < startOfToday;
    const type = isOverdue ? 'TASK_OVERDUE' : 'TASK_DUE';
    const title = isOverdue ? 'Task overdue' : 'Task due today';

    // Collect all users to notify (owner + assignees, deduped)
    const userIds = [...new Set([task.ownerId, ...task.assignees.map((a: any) => a.id)])];

    for (const userId of userIds) {
      const created = await createNotification(db, {
        userId,
        type: type as any,
        title,
        message: task.title.slice(0, 100),
        entityType: 'Task',
        entityId: task.id,
      });
      if (created) processed++;
    }
  }

  return NextResponse.json({ processed });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/__tests__/tasks-check-due.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Add check-due to api-client**

In `src/lib/api-client.ts`, add to the `tasks` object (after `sendForReview`):

```typescript
checkDue: () => post<{ processed: number }>('/tasks/check-due', {}),
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tasks/check-due/route.ts src/app/api/__tests__/tasks-check-due.test.ts src/lib/api-client.ts
git commit -m "feat(api): add POST /api/tasks/check-due for due date notifications"
```

---

## Chunk 3: Frontend — Task Page Upgrades

### Task 12: Goal Grouping Toggle + Priority Sort

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Add view toggle and priority sort**

In `src/app/(dashboard)/tasks/page.tsx`:

1. Import `useStore` `taskViewMode` and `setTaskViewMode`:

After line 5, update the store destructure:
```typescript
const { openDrawer, closeDrawer, taskViewMode, setTaskViewMode } = useStore();
```

2. Add the toggle button after the search/completed area (after line 675). Inside the `flex` wrapper:

```tsx
<button
  onClick={() => setTaskViewMode(taskViewMode === 'grouped' ? 'flat' : 'grouped')}
  className="px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--hover)] transition-colors whitespace-nowrap"
>
  {taskViewMode === 'grouped' ? '☰ Flat' : '📁 Grouped'}
</button>
```

3. Update the `sorted` function (line 152-156) to include priority-based sorting:

```typescript
const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

const sorted = (arr: Task[]) => [...arr].sort((a, b) => {
  const ao = a.status === 'Done' ? 2 : isOverdue(a.dueDate) ? 0 : 1;
  const bo = b.status === 'Done' ? 2 : isOverdue(b.dueDate) ? 0 : 1;
  if (ao !== bo) return ao - bo;
  // Priority sort within urgency group
  const pa = PRIORITY_ORDER[a.priority] ?? 1;
  const pb = PRIORITY_ORDER[b.priority] ?? 1;
  if (pa !== pb) return pa - pb;
  return new Date(a.dueDate || '2099-01-01').getTime() - new Date(b.dueDate || '2099-01-01').getTime();
});
```

4. Add goal status badge to goal headers. In the goal header section (line 692), after the title span:

```tsx
<Badge variant={g.status === 'completed' ? 'ok' : g.status === 'archived' ? 'neutral' : 'info'} className="!text-[8px]">{g.status}</Badge>
```

5. Conditionally render grouped vs flat view (replace lines 680-706):

```tsx
{visible.length === 0 ? (
  <EmptyState icon="☑" title={tab === 'review' ? 'No reviews pending' : 'All tasks complete'} description={tab === 'review' ? 'Tasks assigned to you for review will appear here.' : 'Nice work. New tasks will appear from AI agents and pipeline hygiene.'} />
) : taskViewMode === 'flat' ? (
  <div className="flex flex-col gap-1">{sorted(visible).map(t => <TaskRow key={t.id} t={t} />)}</div>
) : (
  <div className="flex flex-col gap-2">
    {Object.entries(goalTasks).map(([gId, gTasks]) => {
      /* ... existing goal group rendering with badge added ... */
    })}
    {ungrouped.length > 0 && (
      <div className="flex flex-col gap-1">{sorted(ungrouped).map(t => <TaskRow key={t.id} t={t} />)}</div>
    )}
  </div>
)}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx next build --no-lint` (or just check TypeScript: `npx tsc --noEmit`)
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "feat(tasks): add grouped/flat toggle, priority sort, goal status badge"
```

---

### Task 13: Due Date Urgency Badges

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx` (TaskRow component)

- [ ] **Step 1: Add urgency badges to TaskRow**

In the `TaskRow` component, add a helper function and update the due date display area.

Add this helper inside `TasksPageInner` (before `TaskRow`):

```typescript
function dueDateLabel(dueDate: string): { label: string; variant: 'err' | 'warn' | 'neutral' } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const dayAfterTomorrow = new Date(today.getTime() + 2 * 86400000);

  if (due < today) {
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
    return { label: daysOverdue === 1 ? 'Overdue' : `${daysOverdue}d overdue`, variant: 'err' };
  }
  if (due < tomorrow) return { label: 'Today', variant: 'warn' };
  if (due < dayAfterTomorrow) return { label: 'Tomorrow', variant: 'neutral' };
  return null;
}
```

In `TaskRow`, replace the due date span (line 628):

```tsx
{!done && t.dueDate && (() => {
  const urgency = dueDateLabel(t.dueDate);
  return urgency ? (
    <Badge variant={urgency.variant} className="!text-[9px]">{urgency.label}</Badge>
  ) : (
    <span className="font-mono text-[10.5px] flex-shrink-0 text-sub">{fDate(t.dueDate)}</span>
  );
})()}
```

- [ ] **Step 2: Trigger check-due on page mount**

At the top of `TasksPageInner`, add:

```typescript
useEffect(() => {
  if (typeof window !== 'undefined' && !sessionStorage.getItem('check-due-fired')) {
    sessionStorage.setItem('check-due-fired', '1');
    api.tasks.checkDue().catch(() => {}); // Fire and forget
  }
}, []);
```

Add `import { api } from '@/lib/api-client';` at the top if not already imported.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "feat(tasks): add due date urgency badges and check-due trigger"
```

---

### Task 14: Comment Mentions — UI Integration

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx` (CommentInput, comment rendering)

- [ ] **Step 1: Replace CommentInput with UserMentionInput**

Update the `CommentInput` component to use `UserMentionInput`:

```tsx
function CommentInput({ taskId, teamMembers }: { taskId: string; teamMembers: any[] }) {
  const [text, setText] = useState('');
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const comment = useCommentOnTask();

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    comment.mutate(
      { id: taskId, text: trimmed, mentionedUserIds: mentionedIds },
      { onSuccess: () => { setText(''); setMentionedIds([]); } }
    );
  };

  return (
    <div className="mt-3 flex gap-2">
      <UserMentionInput
        value={text}
        onChange={(newText, ids) => { setText(newText); setMentionedIds(ids); }}
        onSubmit={submit}
        users={teamMembers}
        placeholder="Add a comment... Use @ to mention (Cmd+Enter to send)"
        className="flex-1"
      />
      <button
        onClick={submit}
        disabled={!text.trim() || comment.isPending}
        className="self-end px-2.5 py-1.5 text-[12px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {comment.isPending ? '...' : 'Send'}
      </button>
    </div>
  );
}
```

Add import at top:
```typescript
import { UserMentionInput } from '@/components/ui/UserMentionInput';
```

2. Update `CommentInput` usage in `openTaskDetail` to pass teamMembers:

```tsx
<CommentInput taskId={t.id} teamMembers={teamMembers} />
```

3. Update `useCommentOnTask` mutation call to include `mentionedUserIds`.

In `src/lib/queries/tasks.ts`, update `useCommentOnTask`:

```typescript
export function useCommentOnTask() {
  return useOptimisticMutation<unknown, { id: string; text: string; mentionedUserIds?: string[] }>({
    mutationKey: ['tasks', 'comment'],
    mutationFn: ({ id, text, mentionedUserIds }) => api.tasks.comment(id, text, mentionedUserIds),
    // ... rest unchanged
  });
}
```

Update `api.tasks.comment` in `src/lib/api-client.ts`:

```typescript
comment: (id: string, text: string, mentionedUserIds?: string[]) =>
  post<any>('/tasks', { action: 'comment', id, text, mentionedUserIds }),
```

- [ ] **Step 2: Add mention chip rendering in comments**

In the comment rendering section of `openTaskDetail`, replace the plain text display (line 575):

```tsx
<div className="text-sub">
  {c.mentions?.length ? renderMentionText(c.text, c.mentions, teamMembers) : c.text}
</div>
```

Add this helper function inside `TasksPageInner`:

```typescript
function renderMentionText(text: string, mentions: string[], team: any[]) {
  // Build a list of mentioned user names from IDs
  const mentionNames = mentions
    .map(mid => team.find((u: any) => u.id === mid)?.name || mid) // fallback to raw value for old name-based mentions
    .filter(Boolean);

  if (mentionNames.length === 0) return text;

  // Build regex that matches @Name for each mentioned user (handles multi-word names)
  const escaped = mentionNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(@(?:${escaped.join('|')}))`, 'g');
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (part.startsWith('@') && mentionNames.some(n => part === `@${n}`)) {
      return <span key={i} className="px-1 py-0.5 rounded bg-brand/10 text-brand font-medium text-[11px]">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx src/lib/queries/tasks.ts src/lib/api-client.ts
git commit -m "feat(tasks): integrate UserMentionInput and mention chip rendering"
```

---

### Task 15: Easier Assignment — Avatar Chips + Quick Assign

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx` (edit drawer, task row)

- [ ] **Step 1: Replace checkbox assignee picker with avatar chips**

In `openEditTaskDrawer`, replace the assignees label/checkbox section (lines 449-466) with:

```tsx
<div className="flex flex-col gap-1">
  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Assignees</span>
  <div className="flex items-center gap-1 flex-wrap">
    {state.assigneeIds.map((aid: string) => {
      const u = teamMembers.find((m: any) => m.id === aid);
      if (!u) return null;
      return (
        <div key={aid} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[11px]">
          <Avatar initials={u.initials} color={u.color} size="xs" />
          <span>{u.name}</span>
          <button
            className="text-muted hover:text-danger text-[10px]"
            onClick={() => { state.assigneeIds = state.assigneeIds.filter((id: string) => id !== aid); openEditTaskDrawer({ ...t, assignees: state.assigneeIds.map((id: string) => teamMembers.find((m: any) => m.id === id)).filter(Boolean) } as any); }}
          >
            ✕
          </button>
        </div>
      );
    })}
    <AssignButton
      teamMembers={teamMembers}
      selectedIds={state.assigneeIds}
      onSelect={(u: any) => { state.assigneeIds = [...state.assigneeIds, u.id]; openEditTaskDrawer({ ...t, assignees: state.assigneeIds.map((id: string) => teamMembers.find((m: any) => m.id === id)).filter(Boolean) } as any); }}
    />
  </div>
</div>
```

Add an `AssignButton` component inside `TasksPageInner`:

```tsx
function AssignButton({ teamMembers, selectedIds, onSelect }: { teamMembers: any[]; selectedIds: string[]; onSelect: (u: any) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className="w-6 h-6 rounded-full bg-[var(--surface)] border border-dashed border-[var(--border)] flex items-center justify-center text-[12px] text-muted hover:border-brand hover:text-brand transition-colors"
        onClick={() => setOpen(true)}
      >+</button>
      {open && (
        <UserPicker
          users={teamMembers}
          selectedIds={selectedIds}
          onSelect={(u) => { onSelect(u); setOpen(false); }}
          onClose={() => setOpen(false)}
          className="top-full mt-1"
        />
      )}
    </div>
  );
}
```

Add import:
```typescript
import { UserPicker } from '@/components/ui/UserPicker';
```

- [ ] **Step 2: Add quick-assign to TaskRow**

In `TaskRow`, replace the single avatar at the end (line 629) with:

```tsx
<div className="flex items-center -space-x-1">
  {(t.assignees || [t.owner]).slice(0, 3).map(u => (
    <Avatar key={u.id} initials={u.initials} color={u.color} size="xs" />
  ))}
  {!done && (
    <QuickAssign taskId={t.id} currentAssigneeIds={(t.assignees || [t.owner]).map(u => u.id)} teamMembers={teamMembers} />
  )}
</div>
```

Add a `QuickAssign` component:

```tsx
function QuickAssign({ taskId, currentAssigneeIds, teamMembers }: { taskId: string; currentAssigneeIds: string[]; teamMembers: any[] }) {
  const [open, setOpen] = useState(false);
  const updateTask = useUpdateTask();

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        className="w-5 h-5 rounded-full bg-[var(--surface)] border border-dashed border-[var(--border)] flex items-center justify-center text-[10px] text-muted hover:border-brand hover:text-brand transition-colors ml-1"
        onClick={() => setOpen(true)}
      >+</button>
      {open && (
        <UserPicker
          users={teamMembers}
          selectedIds={currentAssigneeIds}
          onSelect={(u) => {
            updateTask.mutate({ id: taskId, data: { assigneeIds: [...currentAssigneeIds, u.id] } });
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          className="right-0 top-full mt-1"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "feat(tasks): avatar chip assignee picker and quick-assign from task row"
```

---

### Task 16: Subtask UI in Task Drawer

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx` (edit drawer, detail drawer, TaskRow)

- [ ] **Step 1: Add subtask progress badge to TaskRow**

In `TaskRow`, after the priority badge (line 627), add:

```tsx
{(t.subtasksTotal ?? 0) > 0 && (
  <span className="text-[9px] text-muted font-mono">{t.subtasksDone}/{t.subtasksTotal}</span>
)}
```

- [ ] **Step 2: Add subtask section to edit drawer**

In `openEditTaskDrawer`, add a subtask section after the notes textarea. This requires making the drawer re-renderable when subtasks change.

Add to `state`:
```typescript
subtasks: (t.subtasks || []).map(s => ({ ...s })),
```

Add the subtask section JSX after the notes label:

```tsx
<div className="flex flex-col gap-1">
  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Subtasks</span>
  {state.subtasks.map((sub: any, i: number) => (
    <div key={sub.id || i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--surface)] border border-[var(--border)]">
      <input
        type="checkbox"
        checked={sub.done}
        onChange={e => { state.subtasks[i].done = e.target.checked; }}
        className="w-3.5 h-3.5"
      />
      <input
        defaultValue={sub.title}
        onChange={e => { state.subtasks[i].title = e.target.value; }}
        className="flex-1 text-[11px] bg-transparent focus:outline-none"
      />
      <div className="flex items-center gap-0.5">
        {i > 0 && <button className="text-[10px] text-muted hover:text-[var(--text)]" onClick={() => { const s = state.subtasks.splice(i, 1)[0]; state.subtasks.splice(i - 1, 0, s); state.subtasks.forEach((s: any, idx: number) => s.position = idx); openEditTaskDrawer({ ...t, subtasks: state.subtasks } as any); }}>↑</button>}
        {i < state.subtasks.length - 1 && <button className="text-[10px] text-muted hover:text-[var(--text)]" onClick={() => { const s = state.subtasks.splice(i, 1)[0]; state.subtasks.splice(i + 1, 0, s); state.subtasks.forEach((s: any, idx: number) => s.position = idx); openEditTaskDrawer({ ...t, subtasks: state.subtasks } as any); }}>↓</button>}
        <button className="text-[10px] text-muted hover:text-danger" onClick={() => { state.subtasks.splice(i, 1); state.subtasks.forEach((s: any, idx: number) => s.position = idx); openEditTaskDrawer({ ...t, subtasks: state.subtasks } as any); }}>✕</button>
      </div>
    </div>
  ))}
  {state.subtasks.length < 20 && (
    <input
      placeholder="Add subtask... (Enter)"
      className="px-2.5 py-1.5 text-[11px] rounded-md bg-[var(--surface)] border border-dashed border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
      onKeyDown={e => {
        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
          state.subtasks.push({ title: e.currentTarget.value.trim(), done: false, position: state.subtasks.length });
          e.currentTarget.value = '';
          openEditTaskDrawer({ ...t, subtasks: state.subtasks } as any);
        }
      }}
    />
  )}
</div>
```

3. Include subtasks in the update mutation call. In the `onClick` handler of the Save button, add to the `data` object:

```typescript
subtasks: state.subtasks.map((s: any, i: number) => ({
  ...(s.id && !s.id.startsWith('temp-') ? { id: s.id } : {}),
  title: s.title,
  done: s.done,
  position: i,
})),
```

- [ ] **Step 3: Show subtasks in detail drawer**

In `openTaskDetail`, after the comments section heading, add a subtasks display section (if subtasks exist):

```tsx
{(t.subtasks || []).length > 0 && (
  <div>
    <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-1.5">
      Subtasks <span className="text-muted font-mono">({(t.subtasks || []).filter(s => s.done).length}/{(t.subtasks || []).length})</span>
    </div>
    {(t.subtasks || []).map(sub => (
      <div key={sub.id} className="flex items-center gap-1.5 py-0.5 text-[11px]">
        <span className={sub.done ? 'text-brand' : 'text-muted'}>{sub.done ? '✓' : '○'}</span>
        <span className={sub.done ? 'line-through text-muted' : ''}>{sub.title}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Verify everything compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "feat(tasks): add subtask UI in drawer and progress badge on task rows"
```

---

### Task 17: Reviewer Shortcut

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Add reviewer picker on send-for-review**

The current "Send for Review" action is handled inline. We need to intercept it when no reviewer is set.

Find where `send_for_review` is triggered (in the task detail drawer or task row actions). In the current code, this is handled via the `sendForReview` API call. Update the send-for-review flow:

Add a `SendForReviewButton` component inside `TasksPageInner`:

```tsx
function SendForReviewButton({ task, teamMembers }: { task: Task; teamMembers: any[] }) {
  const [showPicker, setShowPicker] = useState(false);
  const updateTask = useUpdateTask();
  const addToast = useStore(s => s.addToast);

  const handleSend = async (reviewerId?: string) => {
    try {
      if (reviewerId) {
        await updateTask.mutateAsync({ id: task.id, data: { reviewerId } });
      }
      await api.tasks.sendForReview(task.id);
      addToast({ type: 'success', message: 'Sent for review' });
    } catch {
      addToast({ type: 'error', message: 'Failed to send for review' });
    }
  };

  if (!task.reviewer) {
    return (
      <div className="relative">
        <button
          className="px-2.5 py-1.5 text-[11px] font-medium bg-purple/10 text-purple rounded-md hover:bg-purple/20 transition-colors"
          onClick={() => setShowPicker(true)}
        >
          Send for Review
        </button>
        {showPicker && (
          <UserPicker
            users={teamMembers}
            onSelect={(u) => { handleSend(u.id); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
            className="bottom-full mb-1 right-0"
          />
        )}
      </div>
    );
  }

  return (
    <button
      className="px-2.5 py-1.5 text-[11px] font-medium bg-purple/10 text-purple rounded-md hover:bg-purple/20 transition-colors"
      onClick={() => handleSend()}
    >
      Send for Review
    </button>
  );
}
```

Use this component in the task detail drawer footer (for non-done tasks that aren't already InReview).

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "feat(tasks): reviewer shortcut — pick reviewer inline when sending for review"
```

---

### Task 18: Final Verification

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run build**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 4: Commit any fixes**

If any issues found, fix and commit with descriptive message.

- [ ] **Step 5: Final commit with all changes verified**

```bash
git add -A
git status
# Only commit if there are uncommitted changes
git commit -m "chore: final verification — all tests pass, build succeeds"
```
