'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAccountsQuery, useCreateAccount, useImportAccounts } from '@/lib/queries/accounts';
import { useStore } from '@/lib/store';
import { compositeScore } from '@/lib/types';
import type { Account } from '@/lib/types';
import { fmt, fRelative, cn } from '@/lib/utils';
import { ScorePill, FIUACBars, Badge, Avatar, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';

function AccountsSkeleton() {
  return (
    <div className="page-enter space-y-4">
      <div className="flex gap-3 items-center">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            <div className="flex-1 space-y-1.5">
              <SkeletonText className="w-1/3" />
              <SkeletonText className="w-1/5 h-2" />
            </div>
            <Skeleton className="h-4 w-12" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense>
      <AccountsPageInner />
    </Suspense>
  );
}

function AccountsPageInner() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'me'>('all');
  const { data: resp, isLoading, isError, refetch } = useAccountsQuery(search || undefined, typeFilter !== 'all' ? typeFilter : undefined, ownerFilter === 'me' ? 'me' : undefined);
  const searchParams = useSearchParams();
  const createAccount = useCreateAccount();
  const importAccounts = useImportAccounts();
  const { openDrawer, closeDrawer, addToast } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoCreateFired = useRef(false);
  const pendingIds = usePendingMutations(['accounts']);
  const failedMutations = useFailedMutations(['accounts']);

  const ACCOUNT_TYPES: { value: string; label: string }[] = [
    { value: 'Unknown', label: 'Unknown' },
    { value: 'Utility', label: 'Utility' },
    { value: 'Trader', label: 'Trader' },
    { value: 'Retailer', label: 'Retailer' },
    { value: 'Industrial', label: 'Industrial' },
    { value: 'Developer', label: 'Developer' },
  ];
  const COUNTRIES = ['Finland', 'Denmark', 'Sweden', 'Norway', 'Germany', 'Netherlands', 'UK', 'US'];

  function openNewAccountDrawer() {
    const state = { name: '', type: 'Unknown', country: '', notes: '' };

    openDrawer({
      title: 'New Account',
      subtitle: 'Add a new account to the CRM',
      body: (
        <div
          className="flex flex-col gap-3"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-account]') as HTMLButtonElement)?.click(); }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Company Name *</span>
            <input
              autoFocus
              onChange={e => { state.name = e.target.value; }}
              placeholder="e.g. Ørsted, Vattenfall"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>

          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
              <select
                defaultValue="Unknown"
                onChange={e => { state.type = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Country</span>
              <select
                defaultValue=""
                onChange={e => { state.country = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="">Select...</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Notes / Pain Hypothesis</span>
            <textarea
              rows={3}
              onChange={e => { state.notes = e.target.value; }}
              placeholder="Initial pain hypothesis or notes..."
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
            />
          </label>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
          <button
            data-submit-account
            disabled={createAccount.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.name.trim()) {
                addToast({ type: 'error', message: 'Company name is required' });
                return;
              }
              createAccount.mutate(
                { name: state.name.trim(), type: state.type, country: state.country || undefined, notes: state.notes || undefined },
                {
                  onSuccess: () => { addToast({ type: 'success', message: `Account created: ${state.name}` }); closeDrawer(); },
                  onError: (err) => addToast({ type: 'error', message: err.message }),
                }
              );
            }}
          >
            Create Account
          </button>
        </>
      ),
    });
  }

  function handleImportFile(file: File) {
    importAccounts.mutate(
      { file },
      {
        onSuccess: (res: any) => {
          const d = res.data;
          const parts: string[] = [];
          if (d.created) parts.push(`${d.created} created`);
          if (d.skipped) parts.push(`${d.skipped} skipped`);
          if (d.errors) parts.push(`${d.errors} errors`);
          addToast({ type: d.created > 0 ? 'success' : 'info', message: `Import: ${parts.join(', ')}` });
          // Show detailed results in drawer if there were issues
          if (d.skipped > 0 || d.errors > 0) {
            const issues = (d.results || []).filter((r: any) => r.status !== 'created');
            openDrawer({
              title: 'Import Results',
              subtitle: `${d.created} created, ${d.skipped} skipped, ${d.errors} errors`,
              body: (
                <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto">
                  {issues.map((r: any, i: number) => (
                    <div key={i} className={cn('px-2.5 py-1.5 rounded-md text-[11.5px] border', r.status === 'skipped' ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-600' : 'bg-red-500/5 border-red-500/20 text-red-500')}>
                      <span className="font-medium">Row {r.row}: {r.name || 'Unknown'}</span> — {r.error}
                    </div>
                  ))}
                </div>
              ),
              footer: (
                <button className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors" onClick={closeDrawer}>Done</button>
              ),
            });
          }
        },
        onError: (err) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  // Auto-open create drawer when navigated with ?create=1 (from command palette)
  useEffect(() => {
    if (searchParams.get('create') === '1' && !autoCreateFired.current) {
      autoCreateFired.current = true;
      openNewAccountDrawer();
    }
  });

  if (isLoading) return <AccountsSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const accounts: Account[] = resp?.data ?? [];

  const sorted = [...accounts].sort((a, b) => compositeScore(b.scores) - compositeScore(a.scores));
  const types = [...new Set(accounts.map(a => a.type))];

  return (
    <div className="max-w-[1200px] page-enter">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Accounts</h1>
          <p className="text-[12px] text-[var(--sub)] mt-0.5">{sorted.length} account{sorted.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importAccounts.isPending}
            className="px-3 py-1.5 text-[12px] font-medium bg-[var(--surface)] text-[var(--sub)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
          >
            {importAccounts.isPending ? 'Importing...' : 'Import CSV'}
          </button>
          <button
            onClick={openNewAccountDrawer}
            className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
          >
            + New Account
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        <input className="max-w-[240px] min-w-[140px] px-2.5 py-1.5 text-[12.5px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1">
          {['all', ...types].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={cn('px-2 py-1 text-[11.5px] rounded-md transition-colors', typeFilter === t ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]')}>{t === 'all' ? 'All' : t}</button>
          ))}
        </div>
        <button
          onClick={() => setOwnerFilter(ownerFilter === 'all' ? 'me' : 'all')}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
            ownerFilter === 'me'
              ? 'bg-brand/10 border-brand/30 text-brand'
              : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--sub)]'
          }`}
        >
          {ownerFilter === 'me' ? 'My Accounts' : 'All Accounts'}
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>{['Account', 'Type', 'Score', 'FIUAC', 'Pipeline', 'Last Activity', 'Owner', ''].map(h => (
              <th key={h} className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)] text-left px-3.5 py-2 bg-[var(--surface)] border-b border-[var(--border)] whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {sorted.map(a => {
              const stale = (Date.now() - new Date(a.lastActivityAt).getTime()) / 864e5 > 14;
              const isPending = pendingIds.has(a.id);
              const failedInfo = failedMutations.get(a.id);
              return (
                <tr key={a.id} className={cn('hover:bg-[var(--hover)] cursor-pointer transition-colors', isPending && 'opacity-60 animate-pulse', failedInfo && 'border-l-2 border-l-red-500')} onClick={() => window.location.href = `/accounts/${a.id}`}>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <div className="w-[26px] h-[26px] rounded-md bg-brand/[.06] border border-brand/40 text-brand flex items-center justify-center text-[10px] font-semibold flex-shrink-0">{a.name[0]}</div>
                      <div><div className="font-medium text-[12.5px]">{a.name}</div><div className="text-[10px] text-[var(--muted)]">{a.countryCode} · {a.region}</div></div>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><Badge className="!text-[9.5px]">{a.type}</Badge></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><ScorePill scores={a.scores} /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><FIUACBars scores={a.scores} /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><span className="font-mono font-semibold text-[12px]">{a.pipelineValue > 0 ? fmt(a.pipelineValue) : '\u2014'}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><span className={cn('text-[11.5px]', stale ? 'text-warn' : 'text-[var(--sub)]')}>{fRelative(a.lastActivityAt)}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><Avatar initials={a.owner.initials} color={a.owner.color} size="xs" /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)] text-[var(--muted)] text-[11px]">{'\u2192'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="md:hidden flex flex-col gap-1.5">
        {sorted.map(a => (
          <Link key={a.id} href={`/accounts/${a.id}`}>
            <div className="rounded-lg p-3 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12.5px] font-medium">{a.name}</span><ScorePill scores={a.scores} />
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <Badge className="!text-[9px]">{a.type}</Badge>
                <span className="text-[10px] text-[var(--muted)]">{a.countryCode} · {a.region}</span>
                {a.pipelineValue > 0 && <span className="font-mono font-semibold text-[10px]">{fmt(a.pipelineValue)}</span>}
              </div>
              <FIUACBars scores={a.scores} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
