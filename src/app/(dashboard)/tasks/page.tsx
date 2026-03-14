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

function CommentInput({ taskId }: { taskId: string }) {
  const [text, setText] = useState('');
  const comment = useCommentOnTask();

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    comment.mutate(
      { id: taskId, text: trimmed },
      { onSuccess: () => setText('') }
    );
  };

  return (
    <div className="mt-3 flex gap-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder="Add a comment... (Cmd+Enter to send)"
        className="flex-1 px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
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
    const state = { title: '', priority: 'Medium', dueDate: defaultDue, accountName: '', goalId: '' };

    openDrawer({
      title: 'New Task',
      subtitle: 'Create a manual task',
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Title</span>
            <input
              autoFocus
              onChange={e => { state.title = e.target.value; }}
              placeholder="e.g. Follow up with Ørsted on PPA terms"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Priority</span>
              <select
                defaultValue="Medium"
                onChange={e => { state.priority = e.target.value as TaskPriority; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Due Date</span>
              <input
                type="date"
                defaultValue={defaultDue}
                onChange={e => { state.dueDate = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Account (optional)</span>
            <input
              onChange={e => { state.accountName = e.target.value; }}
              placeholder="e.g. Ørsted, Vattenfall"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          {goals.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Goal (optional)</span>
              <select
                defaultValue=""
                onChange={e => { state.goalId = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
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
            className="px-3.5 py-1.5 text-[12px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <button
            disabled={createTask.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                },
                {
                  onSuccess: () => {
                    addToast({ type: 'success', message: `Task created: ${state.title}` });
                    closeDrawer();
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
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Outcome</span>
              <select
                defaultValue={state.outcome}
                onChange={e => { state.outcome = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="Completed">Completed</option>
                <option value="Deferred">Deferred</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Notes</span>
              <textarea
                rows={3}
                defaultValue={state.notes}
                onChange={e => { state.notes = e.target.value; }}
                placeholder="Any notes on the outcome…"
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40 resize-none"
              />
            </label>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Follow-up Tasks</span>
              <div className="flex gap-1.5 mt-1">
                <input
                  id="followup-input"
                  placeholder="Follow-up title…"
                  className="flex-1 px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
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
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
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
                      <span className="text-[11px] flex-1">{fu}</span>
                      <button
                        className="text-[10px] text-danger hover:text-danger/80"
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
              className="px-3.5 py-1.5 text-[12px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
              onClick={closeDrawer}
            >
              Cancel
            </button>
            <button
              data-submit-complete
              disabled={completeTask.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
    };

    openDrawer({
      title: 'Edit Task',
      subtitle: t.title,
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Title</span>
            <input
              autoFocus
              defaultValue={state.title}
              onChange={e => { state.title = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Priority</span>
              <select
                defaultValue={state.priority}
                onChange={e => { state.priority = e.target.value as TaskPriority; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Due Date</span>
              <input
                type="date"
                defaultValue={state.dueDate}
                onChange={e => { state.dueDate = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Notes</span>
            <textarea
              defaultValue={state.notes}
              onChange={e => { state.notes = e.target.value; }}
              rows={3}
              placeholder="Add context or details..."
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Assignees</span>
            <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto">
              {teamMembers.map((m: any) => (
                <label key={m.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--hover)] cursor-pointer text-[12px]">
                  <input
                    type="checkbox"
                    defaultChecked={state.assigneeIds.includes(m.id)}
                    onChange={e => {
                      if (e.target.checked) state.assigneeIds = [...state.assigneeIds, m.id];
                      else state.assigneeIds = state.assigneeIds.filter((id: string) => id !== m.id);
                    }}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Reviewer</span>
            <select
              defaultValue={state.reviewerId ?? ''}
              onChange={e => { state.reviewerId = e.target.value || null; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
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
            className="px-3.5 py-1.5 text-[12px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <button
            disabled={updateTask.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            {t.dueDate && <span className={cn('text-[11px]', t.status !== 'Done' && isOverdue(t.dueDate) ? 'text-danger' : 'text-muted')}>Due {fDate(t.dueDate)}</span>}
          </div>
          <div>
            <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-1.5">Assigned To</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(t.assignees || [t.owner]).map(u => (
                <div key={u.id} className="flex items-center gap-1"><Avatar initials={u.initials} color={u.color} size="xs" /><span className="text-[11px]">{u.name}</span></div>
              ))}
            </div>
          </div>
          {t.reviewer && (
            <div>
              <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-1.5">Reviewer</div>
              <div className="flex items-center gap-1"><Avatar initials={t.reviewer.initials} color={t.reviewer.color} size="xs" /><span className="text-[11px]">{t.reviewer.name}</span></div>
            </div>
          )}
          {goal && (
            <div>
              <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-1.5">Goal</div>
              <div className="flex items-center gap-1.5"><span className="text-[10px]">🎯</span><span className="text-[12px] font-medium">{goal.title}</span></div>
              {siblings.length > 0 && (
                <div className="mt-1.5">{siblings.map(st => (
                  <div key={st.id} className="flex items-center gap-1.5 py-0.5 text-[11px] text-sub">
                    <span className={st.status === 'Done' ? 'text-brand' : 'text-muted'}>{st.status === 'Done' ? '✓' : '○'}</span>{st.title}
                  </div>
                ))}</div>
              )}
            </div>
          )}
          <div>
            <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-1.5">Comments</div>
            {(t.comments || []).length === 0 ? (
              <div className="text-[11px] text-muted py-2">No comments yet</div>
            ) : (t.comments || []).map((c, i) => (
              <div key={i} className="py-2 border-b border-[var(--border)] last:border-b-0 text-[11.5px]">
                <div className="flex items-center gap-1 mb-0.5"><Avatar initials={c.author.initials} color={c.author.color} size="xs" /><span className="text-[10.5px] font-medium">{c.author.name}</span><span className="text-[9px] text-muted">{fR(c.createdAt)}</span></div>
                <div className="text-sub">{c.text}</div>
              </div>
            ))}
            <CommentInput taskId={t.id} />
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12.5px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Close</button>
          {t.status !== 'Done' && (
            <button
              className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
              onClick={() => openEditTaskDrawer(t)}
            >
              Edit
            </button>
          )}
        </>
      ),
    });
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
          className={cn('w-5 h-5 sm:w-4 sm:h-4 rounded border-[1.5px] flex-shrink-0 flex items-center justify-center cursor-pointer touch-manipulation', done ? 'border-brand bg-brand-dim text-brand text-[9px]' : od ? 'border-danger' : 'border-[var(--border-strong)]')}
          onClick={e => { e.stopPropagation(); if (!done) openCompleteDrawer(t); }}
        >{done ? '✓' : ''}</div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openTaskDetail(t)}>
          <div className={cn('text-[12.5px] font-medium', done && 'line-through text-muted')}>{t.title}</div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {t.accountName && <span className="text-[10px] text-muted">{t.accountName}</span>}
            {t.source !== 'Manual' && <AgentTag name={t.source} className="!text-[8px]" />}
            {t.status === 'InReview' && <Badge variant="purple" className="!text-[8px]">In Review · {t.reviewer?.initials || '?'}</Badge>}
            {(t.comments || []).length > 0 && <span className="text-[9px] text-muted">💬 {t.comments!.length}</span>}
          </div>
        </div>
        <Badge variant={t.priority === 'High' ? 'err' : t.priority === 'Low' ? 'neutral' : 'warn'} className="!text-[9px]">{t.priority}</Badge>
        {!done && <span className={cn('font-mono text-[10.5px] flex-shrink-0', od ? 'text-danger' : 'text-sub')}>{od ? '⚠ ' : ''}{fDate(t.dueDate)}</span>}
        <Avatar initials={(t.assignees?.[0] || t.owner).initials} color={(t.assignees?.[0] || t.owner).color} size="xs" />
      </div>
    );
  }

  return (
    <div className="max-w-[900px] page-enter">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Tasks</h1>
          <p className="text-[12.5px] text-sub mt-0.5">
            {mine.filter(t => t.status !== 'Done').length} mine · {all.filter(t => t.status !== 'Done').length} total
            {overdue.length > 0 && <span className="text-danger"> · {overdue.length} overdue</span>}
          </p>
        </div>
        <button
          onClick={openNewTaskDrawer}
          className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110 transition-colors flex items-center gap-1 self-start sm:self-auto"
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
            'px-3 sm:px-3.5 py-2.5 sm:py-2 text-[12.5px] border-b-2 -mb-px transition-colors whitespace-nowrap',
            tab === t.k ? 'text-[var(--text)] border-brand font-medium' : 'text-sub border-transparent hover:text-[var(--text)]'
          )}>
            {t.l}
            {t.ct > 0 && <span className={cn('ml-1 text-[10px] font-semibold px-[5px] py-[1px] rounded-full', t.k === 'review' ? 'bg-purple/[.15] text-purple' : 'bg-[var(--surface)] text-muted')}>{t.ct}</span>}
          </button>
        ))}
      </div>

      {/* Search + completed toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2.5">
        <SearchInput value={search} onChange={setSearch} onDebouncedChange={setDebouncedSearch} placeholder="Search tasks..." className="w-full sm:max-w-[240px]" />
        <label className="flex items-center gap-1.5 text-[11px] text-sub cursor-pointer min-h-[44px] sm:min-h-0">
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
                  <span className="text-[10px] text-muted">{done}/{total}</span>
                  {g.accountName && <Badge variant="neutral" className="!text-[8px]">{g.accountName}</Badge>}
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
