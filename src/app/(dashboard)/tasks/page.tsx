'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { useTasksQuery } from '@/lib/queries/tasks';
import { Badge, Avatar, AgentTag, EmptyState } from '@/components/ui';
import { fDate, isOverdue, cn, fR } from '@/lib/utils';
import type { Task, Goal } from '@/lib/types';

export default function TasksPage() {
  const { openDrawer, closeDrawer } = useStore();
  const { data: session } = useSession();
  const [tab, setTab] = useState<'mine' | 'review' | 'all'>('mine');
  const [showCompleted, setShowCompleted] = useState(false);
  const [search, setSearch] = useState('');

  // Always fetch all tasks (including completed) so goal progress bars
  // can compute done/total correctly. Client-side filtering for the
  // showCompleted toggle happens below.
  const { data: resp } = useTasksQuery(true);
  const allTasks: Task[] = resp?.data?.tasks ?? [];
  const goals: Goal[] = resp?.data?.goals ?? [];
  const me = {
    id: session?.user?.id ?? '',
    name: session?.user?.name ?? '',
    ini: session?.user?.name ? session.user.name.split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2) : '??',
    role: session?.user?.role ?? '',
    ac: 'green',
  };

  // Apply showCompleted filter client-side
  const tasks = showCompleted ? allTasks : allTasks.filter(t => t.status !== 'Done');

  let all = tasks;
  if (search) all = all.filter(t => `${t.title} ${t.accName}`.toLowerCase().includes(search.toLowerCase()));
  const mine = all.filter(t => t.assignees?.some(u => u.id === me.id) || t.owner.id === me.id);
  const review = all.filter(t => t.status === 'In Review' && t.reviewer?.id === me.id);
  const visible = tab === 'mine' ? mine : tab === 'review' ? review : all;
  const overdue = visible.filter(t => t.status !== 'Done' && isOverdue(t.due));

  // Group by goals
  const goalTasks: Record<string, Task[]> = {};
  const ungrouped: Task[] = [];
  visible.forEach(t => {
    if (t.goalId) { if (!goalTasks[t.goalId]) goalTasks[t.goalId] = []; goalTasks[t.goalId].push(t); }
    else ungrouped.push(t);
  });

  const sorted = (arr: Task[]) => [...arr].sort((a, b) => {
    const ao = a.status === 'Done' ? 2 : isOverdue(a.due) ? 0 : 1;
    const bo = b.status === 'Done' ? 2 : isOverdue(b.due) ? 0 : 1;
    return ao !== bo ? ao - bo : new Date(a.due || '2099-01-01').getTime() - new Date(b.due || '2099-01-01').getTime();
  });

  function openTaskDetail(t: Task) {
    const goal = t.goalId ? goals.find(g => g.id === t.goalId) : null;
    const siblings = t.goalId ? tasks.filter(x => x.goalId === t.goalId && x.id !== t.id) : [];
    openDrawer({
      title: t.title,
      subtitle: t.accName || 'Task Detail',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant={t.pri === 'High' ? 'err' : t.pri === 'Low' ? 'neutral' : 'warn'}>{t.pri}</Badge>
            <Badge variant={t.status === 'Done' ? 'ok' : t.status === 'In Review' ? 'purple' : t.status === 'In Progress' ? 'info' : 'neutral'}>{t.status}</Badge>
            {t.src !== 'Manual' && <AgentTag name={t.src} />}
            {t.due && <span className={cn('text-[11px]', t.status !== 'Done' && isOverdue(t.due) ? 'text-danger' : 'text-muted')}>Due {fDate(t.due)}</span>}
          </div>
          <div>
            <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-1.5">Assigned To</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(t.assignees || [t.owner]).map(u => (
                <div key={u.id} className="flex items-center gap-1"><Avatar initials={u.ini} color={u.ac} size="xs" /><span className="text-[11px]">{u.name}</span></div>
              ))}
            </div>
          </div>
          {t.reviewer && (
            <div>
              <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-1.5">Reviewer</div>
              <div className="flex items-center gap-1"><Avatar initials={t.reviewer.ini} color={t.reviewer.ac} size="xs" /><span className="text-[11px]">{t.reviewer.name}</span></div>
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
                <div className="flex items-center gap-1 mb-0.5"><Avatar initials={c.by.ini} color={c.by.ac} size="xs" /><span className="text-[10.5px] font-medium">{c.by.name}</span><span className="text-[9px] text-muted">{fR(c.at)}</span></div>
                <div className="text-sub">{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      ),
      footer: (
        <button className="px-3.5 py-1.5 text-[12.5px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Close</button>
      ),
    });
  }

  function TaskRow({ t }: { t: Task }) {
    const od = t.status !== 'Done' && isOverdue(t.due);
    const done = t.status === 'Done';
    return (
      <div className={cn('flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[var(--elevated)] border border-[var(--border)] hover:bg-[var(--hover)] transition-colors', done && 'opacity-50')}>
        <div className={cn('w-4 h-4 rounded border-[1.5px] flex-shrink-0 flex items-center justify-center', done ? 'border-brand bg-brand-dim text-brand text-[9px]' : od ? 'border-danger' : 'border-[var(--border-strong)]')}>{done ? '✓' : ''}</div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openTaskDetail(t)}>
          <div className={cn('text-[12.5px] font-medium', done && 'line-through text-muted')}>{t.title}</div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {t.accName && <span className="text-[10px] text-muted">{t.accName}</span>}
            {t.src !== 'Manual' && <AgentTag name={t.src} className="!text-[8px]" />}
            {t.status === 'In Review' && <Badge variant="purple" className="!text-[8px]">In Review · {t.reviewer?.ini || '?'}</Badge>}
            {(t.comments || []).length > 0 && <span className="text-[9px] text-muted">💬 {t.comments!.length}</span>}
          </div>
        </div>
        <Badge variant={t.pri === 'High' ? 'err' : t.pri === 'Low' ? 'neutral' : 'warn'} className="!text-[9px]">{t.pri}</Badge>
        {!done && <span className={cn('font-mono text-[10.5px] flex-shrink-0', od ? 'text-danger' : 'text-sub')}>{od ? '⚠ ' : ''}{fDate(t.due)}</span>}
        <Avatar initials={(t.assignees?.[0] || t.owner).ini} color={(t.assignees?.[0] || t.owner).ac} size="xs" />
      </div>
    );
  }

  return (
    <div className="max-w-[900px] page-enter">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Tasks</h1>
          <p className="text-[12.5px] text-sub mt-0.5">
            {mine.filter(t => t.status !== 'Done').length} mine · {all.filter(t => t.status !== 'Done').length} total
            {overdue.length > 0 && <span className="text-danger"> · {overdue.length} overdue</span>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] mb-2.5 gap-0 overflow-x-auto">
        {([
          { k: 'mine' as const, l: 'My Tasks', ct: mine.filter(t => t.status !== 'Done').length },
          { k: 'review' as const, l: 'For Review', ct: review.length },
          { k: 'all' as const, l: 'All', ct: all.filter(t => t.status !== 'Done').length },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={cn(
            'px-3.5 py-2 text-[12.5px] border-b-2 -mb-px transition-colors whitespace-nowrap',
            tab === t.k ? 'text-[var(--text)] border-brand font-medium' : 'text-sub border-transparent hover:text-[var(--text)]'
          )}>
            {t.l}
            {t.ct > 0 && <span className={cn('ml-1 text-[10px] font-semibold px-[5px] py-[1px] rounded-full', t.k === 'review' ? 'bg-purple/[.15] text-purple' : 'bg-[var(--surface)] text-muted')}>{t.ct}</span>}
          </button>
        ))}
      </div>

      {/* Search + completed toggle */}
      <div className="flex items-center gap-2 mb-2.5">
        <input className="max-w-[240px] px-2.5 py-1.5 text-[12.5px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40 transition-colors" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        <label className="flex items-center gap-1 text-[11px] text-sub cursor-pointer">
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} /> Show completed
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="☑" title={tab === 'review' ? 'No reviews pending' : 'All tasks complete'} description={tab === 'review' ? 'Tasks assigned to you for review will appear here.' : 'Nice work. New tasks will appear from AI agents and pipeline hygiene.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Goal groups */}
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
                  <div className="w-20 h-[3px] rounded-full bg-[var(--surface)] overflow-hidden"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
                  <span className="text-[10px] text-muted">{done}/{total}</span>
                  {g.accName && <Badge variant="neutral" className="!text-[8px]">{g.accName}</Badge>}
                </div>
                <div className="p-1 flex flex-col gap-1">{sorted(gTasks).map(t => <TaskRow key={t.id} t={t} />)}</div>
              </div>
            );
          })}

          {/* Ungrouped */}
          {ungrouped.length > 0 && (
            <div className="flex flex-col gap-1">{sorted(ungrouped).map(t => <TaskRow key={t.id} t={t} />)}</div>
          )}
        </div>
      )}
    </div>
  );
}
