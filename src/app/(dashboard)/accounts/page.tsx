'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAccountsQuery } from '@/lib/queries/accounts';
import { compositeScore } from '@/lib/types';
import type { Account } from '@/lib/types';
import { fmt, fRelative, cn } from '@/lib/utils';
import { ScorePill, FIUACBars, Badge, Avatar } from '@/components/ui';

export default function AccountsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const { data: resp } = useAccountsQuery(search || undefined, typeFilter !== 'all' ? typeFilter : undefined);
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
      </div>

      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        <input className="max-w-[240px] min-w-[140px] px-2.5 py-1.5 text-[12.5px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1">
          {['all', ...types].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={cn('px-2 py-1 text-[11.5px] rounded-md transition-colors', typeFilter === t ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]' : 'text-[var(--muted)] hover:bg-[var(--hover)]')}>{t === 'all' ? 'All' : t}</button>
          ))}
        </div>
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
              const stale = (Date.now() - new Date(a.lastAct).getTime()) / 864e5 > 14;
              return (
                <tr key={a.id} className="hover:bg-[var(--hover)] cursor-pointer transition-colors" onClick={() => window.location.href = `/accounts/${a.id}`}>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <div className="w-[26px] h-[26px] rounded-md bg-brand/[.06] border border-brand/40 text-brand flex items-center justify-center text-[10px] font-semibold flex-shrink-0">{a.name[0]}</div>
                      <div><div className="font-medium text-[12.5px]">{a.name}</div><div className="text-[10px] text-[var(--muted)]">{a.cc} · {a.region}</div></div>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><Badge className="!text-[9.5px]">{a.type}</Badge></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><ScorePill scores={a.scores} /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><FIUACBars scores={a.scores} /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><span className="font-mono font-semibold text-[12px]">{a.pipe > 0 ? fmt(a.pipe) : '\u2014'}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><span className={cn('text-[11.5px]', stale ? 'text-warn' : 'text-[var(--sub)]')}>{fRelative(a.lastAct)}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><Avatar initials={a.owner.ini} color={a.owner.ac} size="xs" /></td>
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
                <span className="text-[10px] text-[var(--muted)]">{a.cc} · {a.region}</span>
                {a.pipe > 0 && <span className="font-mono font-semibold text-[10px]">{fmt(a.pipe)}</span>}
              </div>
              <FIUACBars scores={a.scores} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
