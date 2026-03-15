'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAccountsQuery, useCreateAccount, useImportAccounts } from '@/lib/queries/accounts';
import { useStore } from '@/lib/store';
import { compositeScore } from '@/lib/types';
import type { Account } from '@/lib/types';
import { fmt, fRelative, cn } from '@/lib/utils';
import { ScorePill, FIUACBars, Badge, Avatar, Skeleton, SkeletonCard, SkeletonText, ErrorState, Spinner } from '@/components/ui';
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
import { SearchInput } from '@/components/ui/SearchInput';

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
  const searchParams = useSearchParams();
  const router = useRouter();

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') || '');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'me'>((searchParams.get('owner') as 'all' | 'me') || 'all');
  const { data: resp, isLoading, isError, refetch } = useAccountsQuery(debouncedSearch || undefined, typeFilter !== 'all' ? typeFilter : undefined, ownerFilter === 'me' ? 'me' : undefined);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      const defaults: Record<string, string> = { type: 'all', owner: 'all', q: '' };
      if (value === defaults[key] || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }
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

  const REGIONS = ['Nordics', 'DACH', 'Benelux', 'Iberia', 'UK & Ireland', 'CEE', 'SEE', 'North America', 'APAC'];

  function openNewAccountDrawer() {
    const state = {
      name: '', type: 'Unknown', country: '', region: '', notes: '',
      certMgmtType: '', etrmSystem: '', gtrmSystem: '',
      certRegistries: '' as string, itIntegrations: '' as string, certPainPoints: '',
    };

    const inputCls = "px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40";

    openDrawer({
      title: 'New Account',
      subtitle: 'Add a new account to the CRM',
      body: (
        <div
          className="flex flex-col gap-3"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-account]') as HTMLButtonElement)?.click(); }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Company Name *</span>
            <input autoFocus onChange={e => { state.name = e.target.value; }} placeholder="e.g. Ørsted, Vattenfall" className={inputCls} />
          </label>

          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
              <select defaultValue="Unknown" onChange={e => { state.type = e.target.value; }} className={inputCls}>
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Country</span>
              <select defaultValue="" onChange={e => { state.country = e.target.value; }} className={inputCls}>
                <option value="">Select...</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Region</span>
            <select defaultValue="" onChange={e => { state.region = e.target.value; }} className={inputCls}>
              <option value="">Select...</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Notes / Pain Hypothesis</span>
            <textarea rows={2} onChange={e => { state.notes = e.target.value; }} placeholder="Initial pain hypothesis or notes..." className={inputCls + " resize-none"} />
          </label>

          {/* Cert Management Section */}
          <div className="border-t border-[var(--border)] pt-3 mt-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Certificate Management</span>
            <div className="flex gap-2 mt-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-2xs text-[var(--sub)]">Current System</span>
                <select defaultValue="" onChange={e => { state.certMgmtType = e.target.value; }} className={inputCls}>
                  <option value="">Unknown</option>
                  <option value="ETRM">ETRM</option>
                  <option value="GTRM">GTRM</option>
                  <option value="Excel">Excel</option>
                  <option value="None">None</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-2xs text-[var(--sub)]">ETRM System</span>
                <select defaultValue="" onChange={e => { state.etrmSystem = e.target.value; }} className={inputCls}>
                  <option value="">—</option>
                  <option value="Molecule">Molecule</option>
                  <option value="Brady">Brady</option>
                  <option value="OpenLink Endur">OpenLink Endur</option>
                  <option value="Allegro">Allegro</option>
                  <option value="FIS Aligne">FIS Aligne</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2 mt-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-2xs text-[var(--sub)]">GTRM System</span>
                <select defaultValue="" onChange={e => { state.gtrmSystem = e.target.value; }} className={inputCls}>
                  <option value="">—</option>
                  <option value="CerQlar">CerQlar</option>
                  <option value="Unicorn">Unicorn</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-2xs text-[var(--sub)]">Cert Registries</span>
                <input onChange={e => { state.certRegistries = e.target.value; }} placeholder="Grexel, Statnett, UBA…" className={inputCls} />
              </label>
            </div>
            <label className="flex flex-col gap-1 mt-2">
              <span className="text-2xs text-[var(--sub)]">IT Integrations</span>
              <input onChange={e => { state.itIntegrations = e.target.value; }} placeholder="SAP, Bloomberg, custom…" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 mt-2">
              <span className="text-2xs text-[var(--sub)]">Cert Pain Points</span>
              <textarea onChange={e => { state.certPainPoints = e.target.value; }} rows={2} placeholder="Pain points related to cert management…" className={inputCls + " resize-none"} />
            </label>
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
          <button
            data-submit-account
            disabled={createAccount.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.name.trim()) {
                addToast({ type: 'error', message: 'Company name is required' });
                return;
              }
              const registries = state.certRegistries.split(',').map(s => s.trim()).filter(Boolean);
              const integrations = state.itIntegrations.split(',').map(s => s.trim()).filter(Boolean);
              createAccount.mutate(
                {
                  name: state.name.trim(), type: state.type, country: state.country || undefined,
                  region: state.region || undefined, notes: state.notes || undefined,
                  certMgmtType: state.certMgmtType || undefined,
                  etrmSystem: state.etrmSystem || undefined,
                  gtrmSystem: state.gtrmSystem || undefined,
                  certRegistries: registries.length ? registries : undefined,
                  itIntegrations: integrations.length ? integrations : undefined,
                  certPainPoints: state.certPainPoints || undefined,
                },
                {
                  onSuccess: () => { addToast({ type: 'success', message: `Account created: ${state.name}` }); closeDrawer(); },
                  onError: (err: unknown) => addToast({ type: 'error', message: err instanceof Error ? err.message : 'An error occurred' }),
                }
              );
            }}
          >
            {createAccount.isPending && <Spinner className="h-3 w-3" />}Create Account
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
                    <div key={i} className={cn('px-2.5 py-1.5 rounded-md text-xs border', r.status === 'skipped' ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-600' : 'bg-red-500/5 border-red-500/20 text-red-500')}>
                      <span className="font-medium">Row {r.row}: {r.name || 'Unknown'}</span> — {r.error}
                    </div>
                  ))}
                </div>
              ),
              footer: (
                <button className="px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors" onClick={closeDrawer}>Done</button>
              ),
            });
          }
        },
        onError: (err: unknown) => addToast({ type: 'error', message: err instanceof Error ? err.message : 'An error occurred' }),
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
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-[var(--sub)] mt-0.5">{sorted.length} account{sorted.length !== 1 ? 's' : ''}</p>
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[var(--surface)] text-[var(--sub)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
          >
            {importAccounts.isPending && <Spinner className="h-3 w-3" />}{importAccounts.isPending ? 'Importing...' : 'Import CSV'}
          </button>
          <button
            onClick={openNewAccountDrawer}
            className="px-3 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors"
          >
            + New Account
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        <SearchInput value={search} onChange={setSearch} onDebouncedChange={(v: string) => { setDebouncedSearch(v); updateParams({ q: v }); }} placeholder="Search accounts..." className="max-w-[240px] min-w-[140px]" />
        <div className="flex gap-1">
          {['all', ...types].map(t => (
            <button key={t} onClick={() => { setTypeFilter(t); updateParams({ type: t }); }} className={cn('px-2 py-1 text-xs rounded-md transition-colors', typeFilter === t ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]')}>{t === 'all' ? 'All' : t}</button>
          ))}
        </div>
        <button
          onClick={() => { const next = ownerFilter === 'all' ? 'me' : 'all'; setOwnerFilter(next); updateParams({ owner: next }); }}
          className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
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
              <th key={h} className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)] text-left px-3.5 py-2 bg-[var(--surface)] border-b border-[var(--border)] whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {sorted.map(a => {
              const stale = (Date.now() - new Date(a.lastActivityAt).getTime()) / 864e5 > 14;
              const isPending = pendingIds.has(a.id);
              const failedInfo = failedMutations.get(a.id);
              return (
                <tr key={a.id} className={cn('hover:bg-[var(--hover)] cursor-pointer transition-colors', isPending && 'opacity-60 animate-pulse', failedInfo && 'border-l-2 border-l-red-500')} onClick={() => router.push(`/accounts/${a.id}`)}>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <div className="w-[26px] h-[26px] rounded-md bg-brand/[.06] border border-brand/40 text-brand flex items-center justify-center text-2xs font-semibold flex-shrink-0">{a.name[0]}</div>
                      <div><div className="font-medium text-sm">{a.name}</div><div className="text-2xs text-[var(--muted)]">{a.countryCode} · {a.region}</div></div>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><Badge className="!text-2xs">{a.type}</Badge></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><ScorePill scores={a.scores} /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><FIUACBars scores={a.scores} /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><span className="font-mono font-semibold text-sm">{a.pipelineValue > 0 ? fmt(a.pipelineValue) : '\u2014'}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><span className={cn('text-xs', stale ? 'text-warn' : 'text-[var(--sub)]')}>{fRelative(a.lastActivityAt)}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><Avatar initials={a.owner.initials} color={a.owner.color} size="xs" /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)] text-[var(--muted)] text-xs">{'\u2192'}</td>
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
                <span className="text-sm font-medium">{a.name}</span><ScorePill scores={a.scores} />
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <Badge className="!text-3xs">{a.type}</Badge>
                <span className="text-2xs text-[var(--muted)]">{a.countryCode} · {a.region}</span>
                {a.pipelineValue > 0 && <span className="font-mono font-semibold text-2xs">{fmt(a.pipelineValue)}</span>}
              </div>
              <FIUACBars scores={a.scores} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
