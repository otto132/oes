'use client';
import { useState } from 'react';
import { useDigestsQuery } from '@/lib/queries/digest';
import { DigestCard } from '@/components/digest/DigestCard';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { FileText } from 'lucide-react';
import type { WeeklyDigest } from '@/lib/types';

export default function DigestPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: resp, isLoading, isError, refetch } = useDigestsQuery();

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)]">
        <div className="w-72 border-r border-[var(--border)] p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
        <div className="flex-1 p-6"><Skeleton className="h-96 w-full" /></div>
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const digests: WeeklyDigest[] = resp?.data ?? [];
  const selected = digests.find(d => d.id === selectedId) ?? digests[0] ?? null;

  if (digests.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <EmptyState
          icon="📊"
          title="No digests yet"
          description="Your first digest will be generated Sunday evening."
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Archive list */}
      <div className="w-72 border-r border-[var(--border)] bg-[var(--elevated)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand" /> Weekly Digest
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {digests.map(d => (
            <DigestCard
              key={d.id}
              digest={d}
              expanded={false}
              onClick={() => setSelectedId(d.id)}
            />
          ))}
        </div>
      </div>

      {/* Selected digest */}
      <div className="flex-1 overflow-y-auto p-6">
        {selected && <DigestCard digest={selected} expanded />}
      </div>
    </div>
  );
}
