'use client';
import { useRef, useEffect } from 'react';
import { cn, fR, clsLabel } from '@/lib/utils';
import { Badge } from '@/components/ui';
import type { EmailThread } from '@/lib/types';
import { Mail } from 'lucide-react';

const SENTIMENT_DOT: Record<string, string> = {
  positive_reply: 'bg-brand',
  question: 'bg-info',
  objection: 'bg-danger',
  meeting_request: 'bg-purple',
};

interface Props {
  thread: EmailThread | null;
}

export function ThreadView({ thread }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.threadId]);

  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="text-center">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a conversation to view</p>
          <p className="text-xs mt-1">Use j/k to navigate, Enter to open</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Thread header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">{thread.latestEmail.subject}</h2>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted">
          <span>{thread.emails.length} message{thread.emails.length > 1 ? 's' : ''}</span>
          {thread.classification && (
            <Badge variant="info" className="!text-3xs">
              {clsLabel[thread.classification] || thread.classification}
            </Badge>
          )}
          {thread.accountName && (
            <Badge variant="ok" className="!text-3xs">{thread.accountName}</Badge>
          )}
        </div>
      </div>

      {/* Email messages */}
      {thread.emails.map((email, i) => (
        <div key={email.id} className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] overflow-hidden">
          {/* Email header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn('w-2 h-2 rounded-full flex-shrink-0',
                SENTIMENT_DOT[email.classification] || 'bg-[var(--border)]')} />
              <span className="text-sm font-medium truncate">{email.fromName}</span>
              <span className="text-2xs text-muted truncate">&lt;{email.fromEmail}&gt;</span>
            </div>
            <span className="text-2xs text-muted flex-shrink-0 ml-2">{fR(email.receivedAt)}</span>
          </div>
          {/* Email body */}
          <div className="px-4 py-3">
            {email.bodyHtml ? (
              <div className="prose prose-sm max-w-none text-sub [&_a]:text-brand"
                   dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
            ) : email.body ? (
              <pre className="text-sm text-sub whitespace-pre-wrap font-sans">{email.body}</pre>
            ) : (
              <p className="text-sm text-sub">{email.preview}</p>
            )}
          </div>
          {/* Buying signal callout */}
          {email.classification === 'positive_reply' && (
            <div className="mx-4 mb-3 p-2.5 rounded-md bg-brand/[.04] border border-brand/[.12]">
              <span className="text-3xs font-semibold tracking-widest uppercase text-brand">Buying Signal</span>
              <p className="text-xs text-sub mt-0.5">Positive sentiment detected in this message.</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
