'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Badge, FIUACBars, Skeleton, SkeletonText } from '@/components/ui';
import { fR } from '@/lib/utils';
import type { Account, Contact, Opportunity, Activity } from '@/lib/types';
import { Building2, User, Briefcase, Clock } from 'lucide-react';

interface Props {
  accountId?: string;
  contactEmail?: string;
}

export function InboxContext({ accountId, contactEmail }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['accounts', accountId],
    queryFn: () => api.accounts.detail(accountId!),
    enabled: !!accountId,
  });

  if (!accountId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Building2 className="w-8 h-8 text-muted opacity-30 mb-2" />
        <p className="text-sm text-muted">No account linked</p>
        <p className="text-xs text-muted mt-1">Link this email to an account to see context</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <SkeletonText />
        <SkeletonText />
      </div>
    );
  }

  const account: Account | undefined = data?.data;
  const contacts: Contact[] = data?.contacts ?? [];
  const activities: Activity[] = data?.activities ?? [];
  const opportunities: Opportunity[] = data?.opportunities ?? [];

  if (!account) return null;

  return (
    <div className="overflow-y-auto h-full p-3 space-y-4">
      {/* Account card */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-4 h-4 text-muted" />
          <span className="text-sm font-semibold">{account.name}</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="neutral">{account.type}</Badge>
          <Badge variant={account.status === 'Active' ? 'ok' : 'neutral'}>{account.status}</Badge>
        </div>
        {account.scores && <FIUACBars scores={account.scores} />}
      </div>

      {/* Primary contact */}
      {contacts.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <User className="w-3.5 h-3.5" />
            Contacts
          </div>
          {contacts.slice(0, 3).map(c => (
            <div key={c.id} className="flex items-center justify-between py-1.5 text-sm">
              <div>
                <span className="font-medium">{c.name}</span>
                <span className="text-2xs text-muted ml-1.5">{c.role}</span>
              </div>
              <Badge variant={c.warmth === 'Strong' ? 'ok' : c.warmth === 'Warm' ? 'info' : 'neutral'} className="!text-3xs">
                {c.warmth}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <Briefcase className="w-3.5 h-3.5" />
            Opportunities
          </div>
          {opportunities.map(o => (
            <div key={o.id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="truncate">{o.name}</span>
              <Badge variant="info" className="!text-3xs">{o.stage}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Recent activity */}
      {activities.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            Recent Activity
          </div>
          {activities.slice(0, 5).map(a => (
            <div key={a.id} className="py-1.5 border-b border-[var(--border)] last:border-0">
              <div className="text-xs">{a.summary}</div>
              <div className="text-2xs text-muted">{fR(a.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
