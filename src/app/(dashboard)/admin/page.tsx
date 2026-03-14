'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminStats } from '@/lib/queries/admin';
import { formatRelativeTime } from '@/lib/adapters';
import { Badge } from '@/components/ui';
import Link from 'next/link';
import {
  Database,
  Users,
  Building2,
  ListChecks,
  RefreshCw,
  Bot,
  AlertTriangle,
} from 'lucide-react';

export default function AdminPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'ADMIN';

  useEffect(() => {
    if (session && !isAdmin) router.replace('/');
  }, [session, isAdmin, router]);

  const { data: stats, isLoading } = useAdminStats();

  if (!isAdmin) return null;

  if (isLoading || !stats) {
    return (
      <div className="max-w-[900px] page-enter">
        <h1 className="text-[18px] font-semibold mb-6">System Health</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-elevated p-4 h-[100px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] page-enter">
      <h1 className="text-[18px] font-semibold mb-6">System Health</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Database Status */}
        <Card title="Database" icon={Database}>
          <Badge variant={stats.db === 'connected' ? 'ok' : 'err'}>
            {stats.db === 'connected' ? 'Connected' : 'Error'}
          </Badge>
        </Card>

        {/* Users */}
        <Card title="Users" icon={Users}>
          <Stat label="Total" value={stats.users.total} />
          <Stat label="Active (7d)" value={stats.users.active} />
        </Card>

        {/* Entity Counts */}
        <Card title="Records" icon={Building2}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Stat label="Accounts" value={stats.entities.accounts} />
            <Stat label="Leads" value={stats.entities.leads} />
            <Stat label="Opps" value={stats.entities.opportunities} />
            <Stat label="Tasks" value={stats.entities.tasks} />
            <Stat label="Contacts" value={stats.entities.contacts} />
          </div>
        </Card>

        {/* Queue Health */}
        <Card title="Queue" icon={ListChecks}>
          <div className="flex items-baseline gap-3">
            <Stat label="Pending" value={stats.queue.pending} />
            <Stat label="Total" value={stats.queue.total} />
          </div>
          {stats.queue.pending > 0 && (
            <Link href="/queue" className="text-[11px] text-brand hover:underline mt-1 inline-block">
              View queue →
            </Link>
          )}
        </Card>

        {/* Sync Status */}
        <Card title="Sync" icon={RefreshCw}>
          {stats.sync.lastRun ? (
            <>
              <Badge variant={stats.sync.lastRun.status === 'success' ? 'ok' : stats.sync.lastRun.status === 'partial' ? 'warn' : 'err'}>
                {stats.sync.lastRun.status}
              </Badge>
              <p className="text-[11px] text-sub mt-1">
                {formatRelativeTime(stats.sync.lastRun.completedAt)} · {stats.sync.lastRun.itemsSynced} items
                {stats.sync.lastRun.errors > 0 && ` · ${stats.sync.lastRun.errors} errors`}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-sub">No sync history — connect Outlook in Settings</p>
          )}
        </Card>

        {/* Agent Status */}
        <Card title="Agents" icon={Bot}>
          {stats.agents.lastRuns.length > 0 ? (
            <div className="space-y-1.5">
              {stats.agents.lastRuns.map((r: any) => (
                <div key={r.agentName} className="flex items-center gap-2">
                  <Badge variant={r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'err' : 'neutral'}>
                    {r.status}
                  </Badge>
                  <span className="text-[11px] text-main truncate">{r.agentName}</span>
                  {r.completedAt && (
                    <span className="text-[10px] text-sub ml-auto shrink-0">{formatRelativeTime(r.completedAt)}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-sub">No agent runs recorded yet</p>
          )}
        </Card>
      </div>

      {/* Recent Errors */}
      <div className="mt-6">
        <h2 className="text-[14px] font-medium mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-sub" />
          Recent Errors
        </h2>
        {stats.recentErrors.length > 0 ? (
          <div className="rounded-lg border border-border bg-elevated divide-y divide-border max-h-[300px] overflow-y-auto">
            {stats.recentErrors.map((err: any, i: number) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                <Badge variant={err.source === 'sync' ? 'warn' : 'purple'} className="mt-0.5 shrink-0">
                  {err.source}{err.agentName ? `: ${err.agentName}` : ''}
                </Badge>
                <span className="text-[12px] text-main break-all flex-1">{err.message}</span>
                <span className="text-[10px] text-sub shrink-0">{formatRelativeTime(err.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-elevated px-4 py-6 text-center">
            <Badge variant="ok">No recent errors</Badge>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper components ──────────────────────────── */

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-sub" />
        <span className="text-[12px] font-medium text-sub uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-[18px] font-semibold text-main">{value.toLocaleString()}</span>
      <span className="text-[11px] text-sub ml-1.5">{label}</span>
    </div>
  );
}
