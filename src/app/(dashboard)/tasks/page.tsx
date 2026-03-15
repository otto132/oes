'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { useTasksQuery, useCreateTask, useCompleteTask, useUpdateTask, useCommentOnTask } from '@/lib/queries/tasks';
import { useTeamQuery } from '@/lib/queries/settings';
import { Badge, Avatar, AgentTag, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState, Spinner } from '@/components/ui';
import { fDate, isOverdue, cn, fR, displayLabel } from '@/lib/utils';
import type { Task, TaskPriority, Goal } from '@/lib/types';
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
import { RotateCw } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { api } from '@/lib/api-client';
import { UserMentionInput } from '@/components/ui/UserMentionInput';
import { UserPicker } from '@/components/ui/UserPicker';

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
        className="self-end px-2.5 py-1.5 text-sm font-medium rounded-md bg-brand text-brand-on hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {comment.isPending ? '...' : 'Send'}
      </button>
    </div>
  );
}

function TasksSkeleton() {
  return (
    <div className="page-enter space-y-4">
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="space-y-2">
          <div className="flex items-center gap-2">
            <SkeletonText className="w-1/4" />
            <Skeleton className="h-1.5 flex-1 rounded-full" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <SkeletonText className="w-2/3" />
              <Skeleton className="h-4 w-12 rounded-full ml-auto" />
            </SkeletonCard>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksPageInner />
    </Suspense>
  );
}

function TasksPageInner() {
  const { openDrawer, closeDrawer, taskViewMode, setTaskViewMode } = useStore();
  const { data: session } = useSession();
  const [tab, setTab] = useState<'mine' | 'review' | 'all'>('mine');
  const [showCompleted, setShowCompleted] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchParams = useSearchParams();
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();
  const updateTask = useUpdateTask();
  const addToast = useStore(s => s.addToast);
  const { data: teamResp } = useTeamQuery();
  const teamMembers = teamResp?.data ?? [];
  const autoCreateFired = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('check-due-fired')) {
      sessionStorage.setItem('check-due-fired', '1');
      api.tasks.checkDue().catch(() => {});
    }
  }, []);

  const pendingIds = usePendingMutations(['tasks']);
  const failedMutations = useFailedMutations(['tasks']);

  // Always fetch all tasks (including completed) so goal progress bars
  // can compute done/total correctly. Client-side filtering for the
  // showCompleted toggle happens below.
  const { data: resp, isLoading, isError, refetch } = useTasksQuery(true);

  // Auto-open create drawer when navigated with ?create=1 (from command palette)
  // Must be before early returns to maintain consistent hook ordering.
  useEffect(() => {
    if (!isLoading && searchParams.get('create') === '1' && !autoCreateFired.current) {
      autoCreateFired.current = true;
      openNewTaskDrawer();
    }
  });

  if (isLoading) return <TasksSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const allTasks: Task[] = resp?.data?.tasks ?? [];
  const goals: Goal[] = resp?.data?.goals ?? [];
  const me = {
    id: session?.user?.id ?? '',
    name: session?.user?.name ?? '',
    initials: session?.user?.name ? session.user.name.split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2) : '??',
    role: session?.user?.role ?? '',
    color: 'green',
  };

  // Apply showCompleted filter client-side
  const tasks = showCompleted ? allTasks : allTasks.filter(t => t.status !== 'Done');

  let all = tasks;
  if (debouncedSearch) all = all.filter(t => `${t.title} ${t.accountName}`.toLowerCase().includes(debouncedSearch.toLowerCase()));
  const mine = all.filter(t => t.assignees?.some(u => u.id === me.id) || t.owner.id === me.id);
  const review = all.filter(t => t.status === 'InReview' && t.reviewer?.id === me.id);
  const visible = tab === 'mine' ? mine : tab === 'review' ? review : all;
  const overdue = visible.filter(t => t.status !== 'Done' && isOverdue(t.dueDate));

  // Group by goals
  const goalTasks: Record<string, Task[]> = {};
  const ungrouped: Task[] = [];
  visible.forEach(t => {
    if (t.goalId) { if (!goalTasks[t.goalId]) goalTasks[t.goalId] = []; goalTasks[t.goalId].push(t); }
    else ungrouped.push(t);
  });

  const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

  const sorted = (arr: Task[]) => [...arr].sort((a, b) => {
    const ao = a.status === 'Done' ? 2 : isOverdue(a.dueDate) ? 0 : 1;
    const bo = b.status === 'Done' ? 2 : isOverdue(b.dueDate) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(a.dueDate || '2099-01-01').getTime() - new Date(b.dueDate || '2099-01-01').getTime();
  });

  function openNewTaskDrawer() {
    const defaultDue = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
    const state = {
      title: '', priority: 'Medium', dueDate: defaultDue, accountName: '', goalId: '',
      assigneeIds: [] as string[],
      assigneeNames: [] as { id: string; name: string; initials: string; color: string }[],
      subtasks: [] as string[],
    };

    function render() {
      openDrawer({
        title: 'New Task',
        subtitle: 'Create a task and assign to team members',
        body: (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Title *</span>
              <input
                autoFocus
                defaultValue={state.title}
                onChange={e => { state.title = e.target.value; }}
                placeholder="e.g. Follow up with Ørsted on PPA terms"
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
              />
            </label>
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Priority</span>
                <select
                  defaultValue={state.priority}
                  onChange={e => { state.priority = e.target.value as TaskPriority; }}
                  className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Due Date</span>
                <input
                  type="date"
                  defaultValue={state.dueDate}
                  onChange={e => { state.dueDate = e.target.value; }}
                  className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
                />
              </label>
            </div>

            {/* Assignees */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Assign To</span>
              <div className="flex flex-wrap gap-1.5">
                {state.assigneeNames.map(u => (
                  <span key={u.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]">
                    <Avatar initials={u.initials} color={u.color} size="xs" />
                    {u.name}
                    <button
                      type="button"
                      onClick={() => {
                        state.assigneeIds = state.assigneeIds.filter(id => id !== u.id);
                        state.assigneeNames = state.assigneeNames.filter(a => a.id !== u.id);
                        render();
                      }}
                      className="ml-0.5 text-[var(--muted)] hover:text-[var(--text)]"
                    >×</button>
                  </span>
                ))}
              </div>
              <select
                value=""
                onChange={e => {
                  const userId = e.target.value;
                  if (!userId || state.assigneeIds.includes(userId)) return;
                  const user = teamMembers.find((u: any) => u.id === userId);
                  if (user) {
                    state.assigneeIds.push(userId);
                    state.assigneeNames.push({
                      id: user.id,
                      name: user.name,
                      initials: user.name?.split(/\s+/).map((p: string) => p[0]).join('').toUpperCase().slice(0, 2) ?? '??',
                      color: user.color ?? 'green',
                    });
                    render();
                  }
                }}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="">+ Add team member...</option>
                {teamMembers
                  .filter((u: any) => !state.assigneeIds.includes(u.id))
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
              </select>
              <span className="text-2xs text-[var(--muted)]">{state.assigneeIds.length === 0 ? 'Defaults to you if none selected' : ''}</span>
            </div>

            {/* Subtasks */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Subtasks</span>
              {state.subtasks.length > 0 && (
                <div className="flex flex-col gap-1">
                  {state.subtasks.map((sub, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--surface)] border border-[var(--border)]">
                      <span className="text-xs text-[var(--muted)]">{i + 1}.</span>
                      <span className="text-xs flex-1 text-[var(--text)]">{sub}</span>
                      <button
                        type="button"
                        onClick={() => { state.subtasks.splice(i, 1); render(); }}
                        className="text-[var(--muted)] hover:text-red-500 text-xs"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  id="subtask-input"
                  placeholder="Add a subtask..."
                  className="flex-1 px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const input = e.currentTarget;
                      if (input.value.trim()) {
                        state.subtasks.push(input.value.trim());
                        input.value = '';
                        render();
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  className="px-2.5 py-1.5 text-xs font-medium bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
                  onClick={() => {
                    const input = document.getElementById('subtask-input') as HTMLInputElement;
                    if (input?.value.trim()) {
                      state.subtasks.push(input.value.trim());
                      input.value = '';
                      render();
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Account (optional)</span>
              <input
                defaultValue={state.accountName}
                onChange={e => { state.accountName = e.target.value; }}
                placeholder="e.g. Ørsted, Vattenfall"
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
              />
            </label>
            {goals.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Goal (optional)</span>
                <select
                  defaultValue={state.goalId}
                  onChange={e => { state.goalId = e.target.value; }}
                  className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
                >
                  <option value="">No goal</option>
                  {goals.map(g => (
                    <option key={g.id} value={g.id}>{g.title}{g.accountName ? ` (${g.accountName})` : ''}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ),
        footer: (
          <>
            <button
              className="px-3.5 py-1.5 text-sm text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
              onClick={closeDrawer}
            >
              Cancel
            </button>
            <button
              disabled={createTask.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                if (!state.title.trim()) {
                  addToast({ type: 'error', message: 'Title is required' });
                  return;
                }
                createTask.mutate(
                  {
                    title: state.title.trim(),
                    priority: state.priority,
                    dueDate: state.dueDate || undefined,
                    goalId: state.goalId || undefined,
                    assigneeIds: state.assigneeIds.length > 0 ? state.assigneeIds : undefined,
                  },
                  {
                    onSuccess: (result: any) => {
                      addToast({ type: 'success', message: `Task created: ${state.title}` });
                      closeDrawer();
                      if (state.subtasks.length > 0 && result?.data?.id) {
                        const subtaskData = state.subtasks.map((title, i) => ({
                          title, done: false, position: i,
                        }));
                        api.tasks.update(result.data.id, { subtasks: subtaskData }).catch(() => {
                          addToast({ type: 'error', message: 'Task created but failed to add subtasks' });
                        });
                      }
                    },
                    onError: (err: unknown) => addToast({ type: 'error', message: `Failed: ${err instanceof Error ? err.message : 'Unknown error'}` }),
                  }
                );
              }}
            >
              {createTask.isPending && <Spinner className="h-3 w-3" />}Create Task
            </button>
          </>
        ),
      });
    }

    render();
  }

  function openCompleteDrawer(t: Task) {
    const state = { outcome: 'Completed', notes: '', followUps: [] as string[] };

    function render() {
      openDrawer({
        title: 'Complete Task',
        subtitle: t.title,
        body: (
          <div
            className="flex flex-col gap-3"
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-complete]') as HTMLButtonElement)?.click(); }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Outcome</span>
              <select
                defaultValue={state.outcome}
                onChange={e => { state.outcome = e.target.value; }}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="Completed">Completed</option>
                <option value="Deferred">Deferred</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Notes</span>
              <textarea
                rows={3}
                defaultValue={state.notes}
                onChange={e => { state.notes = e.target.value; }}
                placeholder="Any notes on the outcome…"
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40 resize-none"
              />
            </label>
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Follow-up Tasks</span>
              <div className="flex gap-1.5 mt-1">
                <input
                  id="followup-input"
                  placeholder="Follow-up title…"
                  className="flex-1 px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const input = e.currentTarget;
                      if (input.value.trim()) {
                        state.followUps.push(input.value.trim());
                        input.value = '';
                        render();
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  className="px-2.5 py-1.5 text-xs font-medium bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
                  onClick={() => {
                    const input = document.getElementById('followup-input') as HTMLInputElement;
                    if (input?.value.trim()) {
                      state.followUps.push(input.value.trim());
                      input.value = '';
                      render();
                    }
                  }}
                >
                  Add
                </button>
              </div>
              {state.followUps.length > 0 && (
                <div className="flex flex-col gap-1 mt-1.5">
                  {state.followUps.map((fu, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--surface)] border border-[var(--border)]">
                      <span className="text-xs flex-1">{fu}</span>
                      <button
                        className="text-2xs text-danger hover:text-danger/80"
                        onClick={() => { state.followUps.splice(i, 1); render(); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ),
        footer: (
          <>
            <button
              className="px-3.5 py-1.5 text-sm text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
              onClick={closeDrawer}
            >
              Cancel
            </button>
            <button
              data-submit-complete
              disabled={completeTask.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                completeTask.mutate(
                  {
                    id: t.id,
                    data: {
                      outcome: state.outcome,
                      notes: state.notes || undefined,
                      followUpTasks: state.followUps.map(title => ({ title, source: 'Manual' })),
                    },
                  },
                  {
                    onSuccess: () => {
                      addToast({ type: 'success', message: `Task completed: ${t.title}`, action: { label: 'View Tasks →', href: '/tasks' } });
                      closeDrawer();
                    },
                    onError: () => addToast({ type: 'error', message: 'Failed to complete task' }),
                  }
                );
              }}
            >
              {completeTask.isPending && <Spinner className="h-3 w-3" />}Complete Task
            </button>
          </>
        ),
      });
    }

    render();
  }

  function openEditTaskDrawer(t: Task) {
    const state = {
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.split('T')[0] : '',
      notes: t.notes ?? '',
      assigneeIds: t.assignees?.map((a: any) => a.id) ?? [],
      reviewerId: t.reviewer?.id ?? null as string | null,
      subtasks: (t.subtasks || []).map(s => ({ ...s })),
    };

    openDrawer({
      title: 'Edit Task',
      subtitle: t.title,
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Title</span>
            <input
              autoFocus
              defaultValue={state.title}
              onChange={e => { state.title = e.target.value; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Priority</span>
              <select
                defaultValue={state.priority}
                onChange={e => { state.priority = e.target.value as TaskPriority; }}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Due Date</span>
              <input
                type="date"
                defaultValue={state.dueDate}
                onChange={e => { state.dueDate = e.target.value; }}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Notes</span>
            <textarea
              defaultValue={state.notes}
              onChange={e => { state.notes = e.target.value; }}
              rows={3}
              placeholder="Add context or details..."
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
            />
          </label>
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
                  <button className="text-[10px] text-muted hover:text-danger" onClick={() => {
                    const removed = state.subtasks.splice(i, 1)[0];
                    const removedIdx = i;
                    state.subtasks.forEach((s: any, idx: number) => s.position = idx);
                    addToast({ type: 'info', message: `Subtask "${removed.title.slice(0, 30)}" removed — close drawer to discard all changes` });
                    openEditTaskDrawer({ ...t, subtasks: state.subtasks } as any);
                  }}>✕</button>
                </div>
              </div>
            ))}
            {state.subtasks.length < 20 && (
              <input
                placeholder="Add subtask... (Enter)"
                className="px-2.5 py-1.5 text-[11px] rounded-md bg-[var(--surface)] border border-dashed border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    state.subtasks.push({ id: `temp-${Date.now()}` as any, title: e.currentTarget.value.trim(), done: false, position: state.subtasks.length });
                    e.currentTarget.value = '';
                    openEditTaskDrawer({ ...t, subtasks: state.subtasks } as any);
                  }
                }}
              />
            )}
          </div>
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
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Reviewer</span>
            <select
              defaultValue={state.reviewerId ?? ''}
              onChange={e => { state.reviewerId = e.target.value || null; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="">None</option>
              {teamMembers.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>
      ),
      footer: (
        <>
          <button
            className="px-3.5 py-1.5 text-sm text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <button
            disabled={updateTask.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.title.trim()) {
                addToast({ type: 'error', message: 'Title is required' });
                return;
              }
              updateTask.mutate(
                {
                  id: t.id,
                  data: {
                    title: state.title.trim(),
                    priority: state.priority,
                    due: state.dueDate || undefined,
                    notes: state.notes,
                    assigneeIds: state.assigneeIds,
                    reviewerId: state.reviewerId,
                    subtasks: state.subtasks.map((s: any, i: number) => ({
                      ...(s.id && !s.id.startsWith('temp-') ? { id: s.id } : {}),
                      title: s.title,
                      done: s.done,
                      position: i,
                    })),
                  },
                },
                {
                  onSuccess: () => {
                    addToast({ type: 'success', message: `Task updated: ${state.title}` });
                    closeDrawer();
                  },
                  onError: (err: unknown) => addToast({ type: 'error', message: `Failed: ${err instanceof Error ? err.message : 'Unknown error'}` }),
                }
              );
            }}
          >
            {updateTask.isPending && <Spinner className="h-3 w-3" />}Save Changes
          </button>
        </>
      ),
    });
  }

  function openTaskDetail(t: Task) {
    const goal = t.goalId ? goals.find(g => g.id === t.goalId) : null;
    const siblings = t.goalId ? tasks.filter(x => x.goalId === t.goalId && x.id !== t.id) : [];
    openDrawer({
      title: t.title,
      subtitle: t.accountName || 'Task Detail',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant={t.priority === 'High' ? 'err' : t.priority === 'Low' ? 'neutral' : 'warn'}>{t.priority}</Badge>
            <Badge variant={t.status === 'Done' ? 'ok' : t.status === 'InReview' ? 'purple' : t.status === 'InProgress' ? 'info' : 'neutral'}>{displayLabel(t.status)}</Badge>
            {t.source !== 'Manual' && <AgentTag name={t.source} />}
            {t.dueDate && <span className={cn('text-xs', t.status !== 'Done' && isOverdue(t.dueDate) ? 'text-danger' : 'text-muted')}>Due {fDate(t.dueDate)}</span>}
          </div>
          <div>
            <div className="text-3xs font-semibold tracking-wide uppercase text-muted mb-1.5">Assigned To</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(t.assignees || [t.owner]).map(u => (
                <div key={u.id} className="flex items-center gap-1"><Avatar initials={u.initials} color={u.color} size="xs" /><span className="text-xs">{u.name}</span></div>
              ))}
            </div>
          </div>
          {t.reviewer && (
            <div>
              <div className="text-3xs font-semibold tracking-wide uppercase text-muted mb-1.5">Reviewer</div>
              <div className="flex items-center gap-1"><Avatar initials={t.reviewer.initials} color={t.reviewer.color} size="xs" /><span className="text-xs">{t.reviewer.name}</span></div>
            </div>
          )}
          {goal && (
            <div>
              <div className="text-3xs font-semibold tracking-wide uppercase text-muted mb-1.5">Goal</div>
              <div className="flex items-center gap-1.5"><span className="text-2xs">🎯</span><span className="text-sm font-medium">{goal.title}</span></div>
              {siblings.length > 0 && (
                <div className="mt-1.5">{siblings.map(st => (
                  <div key={st.id} className="flex items-center gap-1.5 py-0.5 text-xs text-sub">
                    <span className={st.status === 'Done' ? 'text-brand' : 'text-muted'}>{st.status === 'Done' ? '✓' : '○'}</span>{st.title}
                  </div>
                ))}</div>
              )}
            </div>
          )}
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
          <div>
            <div className="text-3xs font-semibold tracking-wide uppercase text-muted mb-1.5">Comments</div>
            {(t.comments || []).length === 0 ? (
              <div className="text-xs text-muted py-2">No comments yet</div>
            ) : (t.comments || []).map((c, i) => (
              <div key={i} className="py-2 border-b border-[var(--border)] last:border-b-0 text-[11.5px]">
                <div className="flex items-center gap-1 mb-0.5"><Avatar initials={c.author.initials} color={c.author.color} size="xs" /><span className="text-[10.5px] font-medium">{c.author.name}</span><span className="text-[9px] text-muted">{fR(c.createdAt)}</span></div>
                <div className="text-sub">
                  {c.mentions?.length ? renderMentionText(c.text, c.mentions, teamMembers) : c.text}
                </div>
              </div>
            ))}
            <CommentInput taskId={t.id} teamMembers={teamMembers} />
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12.5px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Close</button>
          {t.status !== 'Done' && t.status !== 'InReview' && (
            <SendForReviewButton task={t} teamMembers={teamMembers} />
          )}
          {t.status !== 'Done' && (
            <button
              className="px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors"
              onClick={() => openEditTaskDrawer(t)}
            >
              Edit
            </button>
          )}
        </>
      ),
    });
  }

  function AssignButton({ teamMembers: members, selectedIds, onSelect }: { teamMembers: any[]; selectedIds: string[]; onSelect: (u: any) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <div className="relative">
        <button
          className="w-6 h-6 rounded-full bg-[var(--surface)] border border-dashed border-[var(--border)] flex items-center justify-center text-[12px] text-muted hover:border-brand hover:text-brand transition-colors"
          onClick={() => setOpen(true)}
        >+</button>
        {open && (
          <UserPicker
            users={members}
            selectedIds={selectedIds}
            onSelect={(u) => { onSelect(u); setOpen(false); }}
            onClose={() => setOpen(false)}
            className="top-full mt-1"
          />
        )}
      </div>
    );
  }

  function QuickAssign({ taskId, currentAssigneeIds, teamMembers: members }: { taskId: string; currentAssigneeIds: string[]; teamMembers: any[] }) {
    const [open, setOpen] = useState(false);

    return (
      <div className="relative" onClick={e => e.stopPropagation()}>
        <button
          className="w-5 h-5 rounded-full bg-[var(--surface)] border border-dashed border-[var(--border)] flex items-center justify-center text-[10px] text-muted hover:border-brand hover:text-brand transition-colors ml-1"
          onClick={() => setOpen(true)}
        >+</button>
        {open && (
          <UserPicker
            users={members}
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

  function renderMentionText(text: string, mentions: string[], team: any[]) {
    const mentionNames = mentions
      .map(mid => team.find((u: any) => u.id === mid)?.name || mid)
      .filter(Boolean);
    if (mentionNames.length === 0) return text;
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

  function SendForReviewButton({ task, teamMembers: members }: { task: Task; teamMembers: any[] }) {
    const [showPicker, setShowPicker] = useState(false);
    const addToastLocal = useStore(s => s.addToast);

    const handleSend = async (reviewerId?: string) => {
      try {
        if (reviewerId) {
          await updateTask.mutateAsync({ id: task.id, data: { reviewerId } });
        }
        await api.tasks.sendForReview(task.id);
        addToastLocal({ type: 'success', message: 'Sent for review' });
      } catch {
        addToastLocal({ type: 'error', message: 'Failed to send for review' });
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
              users={members}
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

  function TaskRow({ t }: { t: Task }) {
    const od = t.status !== 'Done' && isOverdue(t.dueDate);
    const done = t.status === 'Done';
    const isPending = pendingIds.has(t.id);
    const failedInfo = failedMutations.get(t.id);
    return (
      <div className={cn('flex items-center gap-2.5 px-3.5 py-3 sm:py-2.5 rounded-lg bg-[var(--elevated)] border border-[var(--border)] hover:bg-[var(--hover)] transition-colors relative min-h-[52px] sm:min-h-0', done && 'opacity-50', isPending && 'opacity-60 animate-pulse', failedInfo && 'border-l-2 border-l-red-500')}>
        {failedInfo && (
          <button
            onClick={e => { e.stopPropagation(); completeTask.mutate(failedInfo.variables as any); }}
            className="absolute top-1 right-1 p-0.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
            title={failedInfo.error}
          >
            <RotateCw className="w-2.5 h-2.5" />
          </button>
        )}
        <div
          className={cn('w-5 h-5 sm:w-4 sm:h-4 rounded border-[1.5px] flex-shrink-0 flex items-center justify-center cursor-pointer touch-manipulation', done ? 'border-brand bg-brand-dim text-brand text-3xs' : od ? 'border-danger' : 'border-[var(--border-strong)]')}
          onClick={e => { e.stopPropagation(); if (!done) openCompleteDrawer(t); }}
        >{done ? '✓' : ''}</div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openTaskDetail(t)}>
          <div className={cn('text-sm font-medium', done && 'line-through text-muted')}>{t.title}</div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {t.accountName && <span className="text-2xs text-muted">{t.accountName}</span>}
            {t.source !== 'Manual' && <AgentTag name={t.source} className="!text-3xs" />}
            {t.status === 'InReview' && <Badge variant="purple" className="!text-3xs">In Review · {t.reviewer?.initials || '?'}</Badge>}
            {(t.comments || []).length > 0 && <span className="text-3xs text-muted">💬 {t.comments!.length}</span>}
          </div>
        </div>
        <Badge variant={t.priority === 'High' ? 'err' : t.priority === 'Low' ? 'neutral' : 'warn'} className="!text-[9px]">{t.priority}</Badge>
        {(t.subtasksTotal ?? 0) > 0 && (
          <span className="text-[9px] text-muted font-mono">{t.subtasksDone}/{t.subtasksTotal}</span>
        )}
        {!done && t.dueDate && (() => {
          const urgency = dueDateLabel(t.dueDate);
          return urgency ? (
            <Badge variant={urgency.variant} className="!text-[9px]">{urgency.label}</Badge>
          ) : (
            <span className="font-mono text-[10.5px] flex-shrink-0 text-sub">{fDate(t.dueDate)}</span>
          );
        })()}
        <div className="flex items-center -space-x-1">
          {(t.assignees || [t.owner]).slice(0, 3).map(u => (
            <Avatar key={u.id} initials={u.initials} color={u.color} size="xs" />
          ))}
          {!done && (
            <QuickAssign taskId={t.id} currentAssigneeIds={(t.assignees || [t.owner]).map(u => u.id)} teamMembers={teamMembers} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] page-enter">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-sub mt-0.5">
            {mine.filter(t => t.status !== 'Done').length} mine · {all.filter(t => t.status !== 'Done').length} total
            {overdue.length > 0 && <span className="text-danger"> · {overdue.length} overdue</span>}
          </p>
        </div>
        <button
          onClick={openNewTaskDrawer}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-brand text-brand-on hover:brightness-110 transition-colors flex items-center gap-1 self-start sm:self-auto"
        >
          + New Task
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] mb-2.5 gap-0 overflow-x-auto">
        {([
          { k: 'mine' as const, l: 'My Tasks', ct: mine.filter(t => t.status !== 'Done').length },
          { k: 'review' as const, l: 'For Review', ct: review.length },
          { k: 'all' as const, l: 'All', ct: all.filter(t => t.status !== 'Done').length },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={cn(
            'px-3 sm:px-3.5 py-2.5 sm:py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap',
            tab === t.k ? 'text-[var(--text)] border-brand font-medium' : 'text-sub border-transparent hover:text-[var(--text)]'
          )}>
            {t.l}
            {t.ct > 0 && <span className={cn('ml-1 text-2xs font-semibold px-[5px] py-[1px] rounded-full', t.k === 'review' ? 'bg-purple/[.15] text-purple' : 'bg-[var(--surface)] text-muted')}>{t.ct}</span>}
          </button>
        ))}
      </div>

      {/* Search + completed toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2.5">
        <SearchInput value={search} onChange={setSearch} onDebouncedChange={setDebouncedSearch} placeholder="Search tasks..." className="w-full sm:max-w-[240px]" />
        <label className="flex items-center gap-1.5 text-xs text-sub cursor-pointer min-h-[44px] sm:min-h-0">
          <input type="checkbox" className="w-4 h-4 sm:w-3.5 sm:h-3.5" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} /> Show completed
        </label>
        <button
          onClick={() => setTaskViewMode(taskViewMode === 'grouped' ? 'flat' : 'grouped')}
          className="px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--hover)] transition-colors whitespace-nowrap"
        >
          {taskViewMode === 'grouped' ? '☰ Flat' : '📁 Grouped'}
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="☑" title={tab === 'review' ? 'No reviews pending' : 'All tasks complete'} description={tab === 'review' ? 'Tasks assigned to you for review will appear here.' : 'Nice work. New tasks will appear from AI agents and pipeline hygiene.'} />
      ) : taskViewMode === 'flat' ? (
        <div className="flex flex-col gap-1">{sorted(visible).map(t => <TaskRow key={t.id} t={t} />)}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {Object.entries(goalTasks).map(([gId, gTasks]) => {
            const g = goals.find(x => x.id === gId);
            if (!g) return null;
            const done = allTasks.filter(t => t.goalId === gId && t.status === 'Done').length;
            const total = allTasks.filter(t => t.goalId === gId).length;
            const pct = total ? Math.round(done / total * 100) : 0;
            return (
              <div key={gId} className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
                  <span className="text-[10px]">🎯</span>
                  <span className="text-[12px] font-semibold flex-1">{g.title}</span>
                  <Badge variant={g.status === 'completed' ? 'ok' : g.status === 'archived' ? 'neutral' : 'info'} className="!text-[8px]">{g.status}</Badge>
                  <div className="w-14 sm:w-20 h-[3px] rounded-full bg-[var(--surface)] overflow-hidden"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
                  <span className="text-2xs text-muted">{done}/{total}</span>
                  {g.accountName && <Badge variant="neutral" className="!text-3xs">{g.accountName}</Badge>}
                </div>
                <div className="p-1 flex flex-col gap-1">{sorted(gTasks).map(t => <TaskRow key={t.id} t={t} />)}</div>
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div className="flex flex-col gap-1">{sorted(ungrouped).map(t => <TaskRow key={t.id} t={t} />)}</div>
          )}
        </div>
      )}
    </div>
  );
}
