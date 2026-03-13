'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccountDetail, useCreateContact, useUpdateContact, useDeleteContact, useUpdateAccount } from '@/lib/queries/accounts';
import { Pencil, Trash2 } from 'lucide-react';
import { useTeamQuery } from '@/lib/queries/settings';
import { useSession } from 'next-auth/react';
import { useCreateOpportunity } from '@/lib/queries/opportunities';
import { useLogActivity } from '@/lib/queries/activities';
import { useStore } from '@/lib/store';
import { KANBAN_STAGES, STAGE_PROB } from '@/lib/types';
import type { Account, AccountStatus, Opportunity, Activity, Task, Goal } from '@/lib/types';
import { api } from '@/lib/api-client';
import { fmt, fRelative, fDate, isOverdue, cn, confNum } from '@/lib/utils';
import { Badge, ScorePill, FIUACBars, ConfBadge, AgentTag, Avatar, StageBadge, HealthBar, SectionTitle, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';

const ACT_COLOR: Record<string, string> = { Email: '#5b9cf6', Meeting: '#33a882', Call: '#33a882', Note: '#e8a838' };

function OpportunityCreateForm({
  prefilledAccountId,
  prefilledAccountName,
  onSubmit,
  registerSubmit,
}: {
  prefilledAccountId?: string;
  prefilledAccountName?: string;
  onSubmit: (data: { name: string; accountId: string; stage: string; amount: number; closeDate: string }) => void;
  registerSubmit: (fn: () => void) => void;
}) {
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(prefilledAccountId || '');
  const [accountQuery, setAccountQuery] = useState(prefilledAccountName || '');
  const [accountResults, setAccountResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedAccountName, setSelectedAccountName] = useState(prefilledAccountName || '');
  const [stage, setStage] = useState('Contacted');
  const [amount, setAmount] = useState(0);
  const defaultClose = new Date(Date.now() + 90 * 864e5).toISOString().split('T')[0];
  const [closeDate, setCloseDate] = useState(defaultClose);

  useEffect(() => {
    if (prefilledAccountId || !accountQuery.trim() || accountQuery === selectedAccountName) {
      setAccountResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.accounts.list({ q: accountQuery });
        const results = (res?.data ?? []).slice(0, 5);
        setAccountResults(results);
        setShowDropdown(results.length > 0);
      } catch {
        setAccountResults([]);
        setShowDropdown(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [accountQuery, prefilledAccountId, selectedAccountName]);

  const handleSubmit = () => {
    onSubmit({ name, accountId, stage, amount, closeDate });
  };

  useEffect(() => { registerSubmit(handleSubmit); });

  const prob = STAGE_PROB[stage] ?? 0;

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(); }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Opportunity Name *</span>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Ørsted PPA Deal 2026"
          className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
        />
      </label>

      <label className="flex flex-col gap-1 relative">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Account *</span>
        {prefilledAccountId ? (
          <div className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]">
            {prefilledAccountName}
          </div>
        ) : (
          <>
            <input
              value={accountQuery}
              onChange={e => { setAccountQuery(e.target.value); setAccountId(''); setSelectedAccountName(''); }}
              placeholder="Search for an account..."
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            />
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 z-10 mt-0.5 rounded-md bg-[var(--elevated)] border border-[var(--border)] shadow-lg max-h-[160px] overflow-y-auto">
                {accountResults.map((acc: any) => (
                  <button
                    key={acc.id}
                    type="button"
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-[var(--hover)] transition-colors flex items-center gap-1.5"
                    onMouseDown={e => {
                      e.preventDefault();
                      setAccountId(acc.id);
                      setAccountQuery(acc.name);
                      setSelectedAccountName(acc.name);
                      setShowDropdown(false);
                    }}
                  >
                    <span className="text-[var(--text)]">{acc.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--muted)]">{acc.type}</span>
                  </button>
                ))}
              </div>
            )}
            {accountQuery && !accountId && !showDropdown && accountQuery !== selectedAccountName && (
              <span className="text-[10px] text-warn">No account selected — search and pick one</span>
            )}
          </>
        )}
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Stage</span>
          <select
            value={stage}
            onChange={e => setStage(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          >
            {KANBAN_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-[10px] text-[var(--muted)]">Probability: {prob}%</span>
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Amount</span>
          <input
            type="number"
            value={amount || ''}
            onChange={e => setAmount(Number(e.target.value) || 0)}
            placeholder="0"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Close Date</span>
        <input
          type="date"
          value={closeDate}
          onChange={e => setCloseDate(e.target.value)}
          className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
        />
      </label>
    </div>
  );
}

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error, refetch } = useAccountDetail(id);
  const [tab, setTab] = useState('overview');
  const logActivity = useLogActivity();
  const createOpp = useCreateOpportunity();
  const createContact = useCreateContact(id);
  const updateContact = useUpdateContact(id);
  const deleteContact = useDeleteContact(id);
  const { openDrawer, closeDrawer, addToast } = useStore();
  const updateAccount = useUpdateAccount(id);
  const { data: teamData } = useTeamQuery();
  const teamMembers = (teamData?.data ?? []).filter((u: any) => u.isActive);
  const { data: session } = useSession();

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="max-w-[1100px] page-enter">
        <SkeletonCard className="p-[18px] mb-3">
          <div className="flex gap-3.5 items-start flex-col md:flex-row">
            <Skeleton className="w-11 h-11 rounded-lg flex-shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <div className="flex items-center gap-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <Skeleton className="h-5 w-16 mb-1 ml-auto" />
              <Skeleton className="h-3 w-24 mb-1 ml-auto" />
              <Skeleton className="h-3 w-20 ml-auto" />
            </div>
          </div>
          <div className="flex gap-2 mt-3.5 pt-3 border-t border-[var(--border)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="flex-1 min-w-[80px] p-2">
                <Skeleton className="h-2 w-12 mb-1.5" />
                <Skeleton className="h-4 w-16" />
              </SkeletonCard>
            ))}
          </div>
        </SkeletonCard>
        <div className="flex border-b border-[var(--border)] mb-4 gap-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3.5 py-2">
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
          <SkeletonCard className="p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mb-3">
                <Skeleton className="h-2 w-24 mb-1.5" />
                <SkeletonText />
              </div>
            ))}
          </SkeletonCard>
          <SkeletonCard className="p-3.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                <Skeleton className="w-[26px] h-[26px] rounded-full flex-shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-2 w-32" />
                </div>
              </div>
            ))}
          </SkeletonCard>
        </div>
      </div>
    );
  }

  /* ── Error / not found ── */
  if (error || !data?.data) {
    return (
      <div className="max-w-[1100px] page-enter">
        <ErrorState
          message={error ? 'Failed to load account.' : 'Account not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const a: Account = data.data;
  const accOpps: Opportunity[] = data.opportunities ?? [];
  const accActs: Activity[] = (data.activities ?? []).sort((x: Activity, y: Activity) => new Date(y.date).getTime() - new Date(x.date).getTime());
  const accTasks: Task[] = data.tasks ?? [];
  const accGoals: Goal[] = data.goals ?? [];
  const openPipe = accOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage)).reduce((s, o) => s + o.amt, 0);
  const stale = (Date.now() - new Date(a.lastAct).getTime()) / 864e5 > 14;
  const conf = confNum(a.aiConf);

  function openLogActivityDrawer(preselectedType?: string) {
    const state = { type: preselectedType || 'Note', summary: '', detail: '' };

    openDrawer({
      title: 'Log Activity',
      subtitle: `${a.name}`,
      body: (
        <div
          className="flex flex-col gap-3"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-activity]') as HTMLButtonElement)?.click(); }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
            <select
              defaultValue={state.type}
              onChange={e => { state.type = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="Note">Note</option>
              <option value="Call">Call</option>
              <option value="Meeting">Meeting</option>
              <option value="Email">Email</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Summary *</span>
            <input
              autoFocus
              onChange={e => { state.summary = e.target.value; }}
              placeholder="Brief summary of the activity"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Detail</span>
            <textarea
              rows={4}
              onChange={e => { state.detail = e.target.value; }}
              placeholder="Additional details..."
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
            />
          </label>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
          <button
            data-submit-activity
            disabled={logActivity.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.summary.trim()) {
                addToast({ type: 'error', message: 'Summary is required' });
                return;
              }
              logActivity.mutate(
                { type: state.type, summary: state.summary.trim(), detail: state.detail || undefined, accountId: id, source: 'Manual' },
                {
                  onSuccess: () => { addToast({ type: 'success', message: 'Activity logged' }); closeDrawer(); },
                  onError: (err) => addToast({ type: 'error', message: err.message }),
                }
              );
            }}
          >
            Log Activity
          </button>
        </>
      ),
    });
  }

  function openAddContactDrawer() {
    const state = { name: '', title: '', role: 'Influencer', warmth: 'Cold', email: '', phone: '' };

    openDrawer({
      title: 'Add Contact',
      subtitle: a.name,
      body: (
        <div
          className="flex flex-col gap-3"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-contact]') as HTMLButtonElement)?.click(); }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Name *</span>
            <input
              autoFocus
              onChange={e => { state.name = e.target.value; }}
              placeholder="Full name"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Job Title</span>
            <input
              onChange={e => { state.title = e.target.value; }}
              placeholder="e.g. VP of Energy Trading"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Role</span>
              <select
                defaultValue="Influencer"
                onChange={e => { state.role = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="Champion">Champion</option>
                <option value="EconomicBuyer">Economic Buyer</option>
                <option value="TechnicalBuyer">Technical Buyer</option>
                <option value="Influencer">Influencer</option>
                <option value="Blocker">Blocker</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Warmth</span>
              <select
                defaultValue="Cold"
                onChange={e => { state.warmth = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="Strong">Strong</option>
                <option value="Warm">Warm</option>
                <option value="Cold">Cold</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Email</span>
            <input
              type="email"
              onChange={e => { state.email = e.target.value; }}
              placeholder="email@company.com"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Phone</span>
            <input
              type="tel"
              onChange={e => { state.phone = e.target.value; }}
              placeholder="+358 40 123 4567"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
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
            data-submit-contact
            disabled={createContact.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.name.trim()) {
                addToast({ type: 'error', message: 'Name is required' });
                return;
              }
              createContact.mutate(
                {
                  name: state.name.trim(),
                  title: state.title.trim() || undefined,
                  role: state.role,
                  warmth: state.warmth,
                  email: state.email.trim() || undefined,
                  phone: state.phone.trim() || undefined,
                },
                {
                  onSuccess: () => { addToast({ type: 'success', message: `Contact added: ${state.name}` }); closeDrawer(); },
                  onError: () => addToast({ type: 'error', message: 'Failed to add contact' }),
                }
              );
            }}
          >
            Add Contact
          </button>
        </>
      ),
    });
  }

  function openEditContactDrawer(c: { id: string; name: string; title: string; role: string; warmth: string; email: string; phone?: string }) {
    // Map display role back to enum value for the select
    const ROLE_DISPLAY_TO_ENUM: Record<string, string> = { 'Economic Buyer': 'EconomicBuyer', 'Technical Buyer': 'TechnicalBuyer' };
    const roleEnum = ROLE_DISPLAY_TO_ENUM[c.role] ?? c.role;

    const state = { name: c.name, title: c.title, role: roleEnum, warmth: c.warmth, email: c.email, phone: c.phone || '' };

    openDrawer({
      title: 'Edit Contact',
      subtitle: a.name,
      body: (
        <div
          className="flex flex-col gap-3"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-edit-contact]') as HTMLButtonElement)?.click(); }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Name *</span>
            <input
              autoFocus
              defaultValue={state.name}
              onChange={e => { state.name = e.target.value; }}
              placeholder="Full name"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Job Title</span>
            <input
              defaultValue={state.title}
              onChange={e => { state.title = e.target.value; }}
              placeholder="e.g. VP of Energy Trading"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Role</span>
              <select
                defaultValue={state.role}
                onChange={e => { state.role = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="Champion">Champion</option>
                <option value="EconomicBuyer">Economic Buyer</option>
                <option value="TechnicalBuyer">Technical Buyer</option>
                <option value="Influencer">Influencer</option>
                <option value="Blocker">Blocker</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Warmth</span>
              <select
                defaultValue={state.warmth}
                onChange={e => { state.warmth = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="Strong">Strong</option>
                <option value="Warm">Warm</option>
                <option value="Cold">Cold</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Email</span>
            <input
              type="email"
              defaultValue={state.email}
              onChange={e => { state.email = e.target.value; }}
              placeholder="email@company.com"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Phone</span>
            <input
              type="tel"
              defaultValue={state.phone}
              onChange={e => { state.phone = e.target.value; }}
              placeholder="+358 40 123 4567"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
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
            data-submit-edit-contact
            disabled={updateContact.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.name.trim()) {
                addToast({ type: 'error', message: 'Name is required' });
                return;
              }
              updateContact.mutate(
                {
                  contactId: c.id,
                  data: {
                    name: state.name.trim(),
                    title: state.title.trim(),
                    role: state.role,
                    warmth: state.warmth,
                    email: state.email.trim(),
                    phone: state.phone.trim() || undefined,
                  },
                },
                {
                  onSuccess: () => { addToast({ type: 'success', message: `Contact updated: ${state.name}` }); closeDrawer(); },
                  onError: (err) => addToast({ type: 'error', message: err.message }),
                }
              );
            }}
          >
            Save Changes
          </button>
        </>
      ),
    });
  }

  function openDeleteContactDrawer(c: { id: string; name: string }) {
    openDrawer({
      title: 'Delete Contact',
      subtitle: a.name,
      body: (
        <div className="flex flex-col gap-3 py-2">
          <p className="text-[13px] text-[var(--text)]">
            Are you sure you want to delete <span className="font-semibold">{c.name}</span>?
          </p>
          <p className="text-[11.5px] text-[var(--sub)]">This action cannot be undone.</p>
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
            disabled={deleteContact.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-[#ef4444] text-white rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              deleteContact.mutate(c.id, {
                onSuccess: () => { addToast({ type: 'success', message: `Contact deleted: ${c.name}` }); closeDrawer(); },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              });
            }}
          >
            Delete
          </button>
        </>
      ),
    });
  }

  function openEditDrawer() {
    const state = {
      name: a.name,
      type: a.type,
      country: a.country,
      status: a.status,
      pain: a.pain || '',
      whyNow: a.whyNow || '',
      moduleFit: (a.fit || []).join(', '),
      competitors: a.competitors || '',
    };

    openDrawer({
      title: 'Edit Account',
      subtitle: a.name,
      body: (
        <div
          className="flex flex-col gap-3"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-edit]') as HTMLButtonElement)?.click(); }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Name *</span>
            <input
              autoFocus
              defaultValue={state.name}
              onChange={e => { state.name = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>

          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
              <select
                defaultValue={state.type}
                onChange={e => { state.type = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                {['Unknown', 'PPA Buyer', 'Certificate Trader', 'Corporate Offtaker'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Country</span>
              <select
                defaultValue={state.country}
                onChange={e => { state.country = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                {['Finland', 'Denmark', 'Sweden', 'Norway', 'Germany', 'Netherlands', 'UK', 'US', 'Other'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Status</span>
            <select
              defaultValue={state.status}
              onChange={e => { state.status = e.target.value as AccountStatus; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              {['Prospect', 'Active', 'Partner', 'Churned'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Pain Hypothesis</span>
            <textarea
              rows={3}
              defaultValue={state.pain}
              onChange={e => { state.pain = e.target.value; }}
              placeholder="What pain point does this account have?"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Why Now</span>
            <textarea
              rows={3}
              defaultValue={state.whyNow}
              onChange={e => { state.whyNow = e.target.value; }}
              placeholder="Why is now the right time?"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Module Fit</span>
            <input
              defaultValue={state.moduleFit}
              onChange={e => { state.moduleFit = e.target.value; }}
              placeholder="e.g. PPA, GoO, Carbon (comma-separated)"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Competitors</span>
            <input
              defaultValue={state.competitors}
              onChange={e => { state.competitors = e.target.value; }}
              placeholder="e.g. Pexapark, Zeigo (comma-separated)"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
          <button
            data-submit-edit
            disabled={updateAccount.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.name.trim()) {
                addToast({ type: 'error', message: 'Name is required' });
                return;
              }
              const moduleFit = state.moduleFit.split(',').map(s => s.trim()).filter(Boolean);
              updateAccount.mutate(
                {
                  name: state.name.trim(),
                  type: state.type,
                  country: state.country,
                  status: state.status,
                  pain: state.pain.trim() || undefined,
                  whyNow: state.whyNow.trim() || undefined,
                  moduleFit,
                  competitors: state.competitors.trim() || undefined,
                },
                {
                  onSuccess: () => { addToast({ type: 'success', message: 'Account updated' }); closeDrawer(); },
                  onError: (err: Error) => addToast({ type: 'error', message: err.message }),
                }
              );
            }}
          >
            Save Changes
          </button>
        </>
      ),
    });
  }

  function openNewOppDrawer() {
    const submitRef = { current: () => {} };
    const DISPLAY_TO_PRISMA: Record<string, string> = { 'Solution Fit': 'SolutionFit', 'Verbal Commit': 'VerbalCommit' };

    openDrawer({
      title: 'New Opportunity',
      subtitle: `For ${a.name}`,
      body: (
        <OpportunityCreateForm
          prefilledAccountId={id}
          prefilledAccountName={a.name}
          onSubmit={(data) => {
            if (!data.name.trim()) { addToast({ type: 'error', message: 'Name is required' }); return; }
            const prismaStage = DISPLAY_TO_PRISMA[data.stage] ?? data.stage;
            createOpp.mutate(
              { name: data.name.trim(), accountId: id, stage: prismaStage, amount: data.amount, closeDate: data.closeDate || undefined },
              {
                onSuccess: () => { addToast({ type: 'success', message: `Opportunity created: ${data.name}` }); closeDrawer(); },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              }
            );
          }}
          registerSubmit={(fn) => { submitRef.current = fn; }}
        />
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
          <button disabled={createOpp.isPending} className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => submitRef.current()}>Create Opportunity</button>
        </>
      ),
    });
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'contacts', label: 'Contacts', count: a.contacts.length },
    { key: 'opps', label: 'Opportunities', count: accOpps.length },
    { key: 'activity', label: 'Activity', count: accActs.length },
    { key: 'tasks', label: 'Tasks', count: accTasks.filter(t => t.status !== 'Done').length },
  ];

  return (
    <div className="max-w-[1100px] page-enter">
      {/* ── Header card ── */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-[18px] mb-3">
        <div className="flex gap-3.5 items-start flex-col md:flex-row">
          <div className="w-11 h-11 rounded-lg bg-brand/[.08] border border-brand/20 text-brand flex items-center justify-center text-lg font-semibold flex-shrink-0">
            {a.name[0]}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-semibold tracking-tight">{a.name}</h1>
              <button
                onClick={openEditDrawer}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--sub)] hover:bg-[var(--hover)] transition-colors"
              >
                Edit
              </button>
            </div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <Badge variant={a.status === 'Active' ? 'ok' : a.status === 'Partner' ? 'purple' : 'info'}>{a.status}</Badge>
              <Badge variant="neutral">{a.type} · {a.country}</Badge>
              {a.schemes.map(s => <Badge key={s} variant="neutral" className="!text-[9px]">{s}</Badge>)}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 justify-end">
              <ScorePill scores={a.scores} />
              <span className="text-[10px] text-muted">FIUAC</span>
            </div>
            <div className="mt-1"><FIUACBars scores={a.scores} /></div>
            <div className={cn('text-[10.5px] mt-1', stale ? 'text-warn' : 'text-muted')}>
              {stale && '\u26A0 '}Last: {fRelative(a.lastAct)}
            </div>
          </div>
        </div>

        {/* Stat row */}
        <div className="flex gap-2 mt-3.5 pt-3 border-t border-[var(--border)] flex-wrap">
          {[
            { l: 'Pipeline', v: fmt(openPipe) },
            { l: 'Open Opps', v: accOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage)).length },
            { l: 'Contacts', v: a.contacts.length },
            { l: 'Confidence', v: `${Math.round(conf * 100)}%` },
            { l: 'Owner', v: a.owner?.name ?? 'Unassigned' },
          ].map(s => (
            <div key={s.l} className="flex-1 min-w-[80px] p-2 rounded-md bg-[var(--surface)] border border-[var(--border)]">
              <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-muted mb-0.5">{s.l}</div>
              <div className="text-[14px] font-semibold font-mono">{s.v}</div>
            </div>
          ))}
        </div>
        {session?.user?.role === 'ADMIN' && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Reassign Owner</span>
            <select
              value={a.ownerId}
              onChange={(e) => {
                updateAccount.mutate(
                  { ownerId: e.target.value },
                  {
                    onSuccess: () => addToast({ type: 'success', message: 'Owner reassigned' }),
                    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
                  },
                );
              }}
              className="px-2 py-1 text-[11px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
            >
              {teamMembers.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-[var(--border)] mb-4 gap-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-3.5 py-2 text-[12.5px] border-b-2 -mb-px whitespace-nowrap transition-colors',
              tab === t.key
                ? 'text-[var(--text)] border-brand font-medium'
                : 'text-sub border-transparent hover:text-[var(--text)]'
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1 text-[10px] font-semibold font-mono px-[5px] py-px rounded-full bg-[var(--surface)] text-muted">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
          {/* AI brief */}
          <div className="ai-box">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1.5">AI Account Brief</div>
            <div className="flex flex-col gap-2.5">
              <div>
                <SectionTitle>Pain Hypothesis</SectionTitle>
                <p className="text-[12.5px] leading-relaxed">{a.pain || 'Not yet assessed'}</p>
              </div>
              <div>
                <SectionTitle>Why Now</SectionTitle>
                <p className="text-[12.5px] leading-relaxed">{a.whyNow || 'No why-now signal yet'}</p>
              </div>
              <div>
                <SectionTitle>Module Fit</SectionTitle>
                <div className="flex flex-wrap gap-1">
                  {(a.fit || []).map(m => <Badge key={m} variant="ok">{m}</Badge>)}
                  {!a.fit?.length && <span className="text-[12px] text-muted">{'\u2014'}</span>}
                </div>
              </div>
              {a.competitors && (
                <div>
                  <SectionTitle>Competitive Landscape</SectionTitle>
                  <p className="text-[12.5px] leading-relaxed text-warn">{a.competitors}</p>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <AgentTag name="Account Enricher" />
              <ConfBadge value={conf} />
              <span className="text-[10px] text-muted">Last updated {fRelative(a.lastAct)}</span>
            </div>
          </div>

          {/* Buying committee sidebar */}
          <div>
            <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>Buying Committee</SectionTitle>
                <Badge variant="ai" className="!text-[8px]">AI Mapped</Badge>
              </div>
              {a.contacts.length === 0 ? (
                <div className="text-[12px] text-muted text-center py-3">No contacts</div>
              ) : (
                a.contacts.map(c => (
                  <div key={c.id} className="group flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                    <Avatar initials={c.name.split(' ').map(w => w[0]).join('')} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] font-medium truncate">{c.name}</div>
                      <div className="text-[9.5px] text-muted truncate">{c.title}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditContactDrawer(c)} className="p-0.5 rounded hover:bg-[var(--hover)] text-[var(--muted)] hover:text-[var(--text)] transition-colors" title="Edit contact"><Pencil size={12} /></button>
                        <button onClick={() => openDeleteContactDrawer(c)} className="p-0.5 rounded hover:bg-[var(--hover)] text-[var(--muted)] hover:text-danger transition-colors" title="Delete contact"><Trash2 size={12} /></button>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <Badge variant={c.role === 'Champion' ? 'ok' : c.role === 'Economic Buyer' ? 'info' : 'neutral'} className="!text-[8.5px]">{c.role}</Badge>
                        <span className={cn('text-[9px]', c.warmth === 'Strong' ? 'text-brand' : c.warmth === 'Warm' ? 'text-warn' : 'text-info')}>{c.warmth}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Contacts ── */}
      {tab === 'contacts' && (
        <>
        <div className="flex justify-end mb-2">
          <button
            onClick={openAddContactDrawer}
            className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
          >
            + Add Contact
          </button>
        </div>
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
          {a.contacts.length === 0 ? (
            <EmptyState icon="\uD83D\uDC65" title="No contacts" description="Add contacts to build the buying committee map." />
          ) : (
            a.contacts.map(c => (
              <div key={c.id} className="group flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
                <Avatar initials={c.name.split(' ').map(w => w[0]).join('')} size="lg" color="green" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium">{c.name}</div>
                  <div className="text-[10.5px] text-sub">{c.title}</div>
                  {c.email && <div className="text-[10.5px] text-info mt-0.5">{c.email}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditContactDrawer(c)} className="p-1 rounded hover:bg-[var(--hover)] text-[var(--muted)] hover:text-[var(--text)] transition-colors" title="Edit contact"><Pencil size={14} /></button>
                    <button onClick={() => openDeleteContactDrawer(c)} className="p-1 rounded hover:bg-[var(--hover)] text-[var(--muted)] hover:text-danger transition-colors" title="Delete contact"><Trash2 size={14} /></button>
                  </div>
                  <Badge variant={c.role === 'Champion' ? 'ok' : c.role === 'Economic Buyer' ? 'info' : 'neutral'}>{c.role}</Badge>
                  <Badge variant={c.warmth === 'Strong' ? 'ok' : c.warmth === 'Warm' ? 'warn' : 'info'}>{c.warmth}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
        </>
      )}

      {/* ── Opportunities ── */}
      {tab === 'opps' && (
        <>
          <div className="flex justify-end mb-2">
            <button
              onClick={openNewOppDrawer}
              className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
            >
              + New Opportunity
            </button>
          </div>
          {accOpps.length === 0 ? (
            <EmptyState icon="\uD83D\uDCCA" title="No opportunities" description="Create one or convert a qualified lead." />
          ) : (
          <div className="flex flex-col gap-2">
            {accOpps.map(o => (
              <Link key={o.id} href={`/pipeline/${o.id}`}>
                <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5 cursor-pointer hover:border-[var(--border-strong)] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-semibold">{o.name}</span>
                    <StageBadge stage={o.stage} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{fmt(o.amt)}</span>
                    <div className="flex items-center gap-2">
                      <HealthBar health={o.health} />
                      <span className="text-[10.5px] text-sub">Close: {fDate(o.close)}</span>
                    </div>
                  </div>
                  {o.next && <div className="text-[10.5px] text-muted mt-1">{'\u2192'} {o.next}</div>}
                </div>
              </Link>
            ))}
          </div>
          )}
        </>
      )}

      {/* ── Activity ── */}
      {tab === 'activity' && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => openLogActivityDrawer()}
              className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
            >
              + Log Note
            </button>
            <div className="flex gap-1">
              {[
                { type: 'Call', icon: '\uD83D\uDCDE' },
                { type: 'Email', icon: '\uD83D\uDCE7' },
                { type: 'Meeting', icon: '\uD83E\uDD1D' },
              ].map(({ type, icon }) => (
                <button
                  key={type}
                  onClick={() => openLogActivityDrawer(type)}
                  className="px-2 py-1 text-[11px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--sub)] hover:bg-[var(--hover)] transition-colors"
                >
                  {icon} {type}
                </button>
              ))}
            </div>
          </div>
          {accActs.length === 0 ? (
            <EmptyState icon="\uD83D\uDCC5" title="No activity" description="Activity from emails, meetings, and notes will appear here." />
          ) : (
            <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-0 bottom-0 w-px bg-[var(--border)]" />
                {accActs.map(x => (
                  <div key={x.id} className="relative pb-4 last:pb-0">
                    <div
                      className="absolute -left-[13px] top-[3px] w-2 h-2 rounded-full border-2 border-[var(--elevated)]"
                      style={{ background: ACT_COLOR[x.type] || '#4f576b' }}
                    />
                    <div
                      className="text-[9px] font-semibold uppercase tracking-wide mb-0.5 flex items-center gap-1.5"
                      style={{ color: ACT_COLOR[x.type] || '#4f576b' }}
                    >
                      {x.type}
                      <Badge variant="neutral" className="!text-[8.5px]">{x.src}</Badge>
                    </div>
                    <div className="text-[12.5px] font-medium mb-0.5">{x.sum}</div>
                    <div className="text-[11.5px] text-sub leading-relaxed">{x.detail}</div>
                    <div className="text-[10px] text-muted mt-0.5">{x.who.name} · {fRelative(x.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Tasks ── */}
      {tab === 'tasks' && (
        <div className="flex flex-col gap-1.5">
          {accTasks.filter(t => t.status !== 'Done').length === 0 ? (
            <EmptyState icon="\u2611" title="No open tasks" description="Tasks for this account will appear here." />
          ) : (
            accTasks.filter(t => t.status !== 'Done').map(t => {
              const od = isOverdue(t.due);
              return (
                <div key={t.id} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[var(--elevated)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors">
                  <div className={cn('w-3.5 h-3.5 rounded border-[1.5px] flex-shrink-0', od ? 'border-danger' : 'border-[var(--border-strong)]')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium truncate">{t.title}</div>
                  </div>
                  <Badge variant={t.pri === 'High' ? 'err' : 'neutral'} className="!text-[9px]">{t.pri}</Badge>
                  <span className={cn('font-mono text-[10.5px] flex-shrink-0', od ? 'text-danger' : 'text-sub')}>{fDate(t.due)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
