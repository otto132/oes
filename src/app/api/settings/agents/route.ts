import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

const DEFAULT_AGENTS = [
  {
    name: 'signal_hunter',
    displayName: 'Signal Hunter',
    description: 'Monitors news, LinkedIn, registries for GoO market signals',
    status: 'active',
    parameters: {
      sources: 'Reuters, Bloomberg, LinkedIn, Montel, AIB, ENTSO-E',
      scan_frequency: 'Every 4 hours',
      min_relevance_threshold: '60/100',
      auto_dismiss_below: '30/100',
    },
  },
  {
    name: 'lead_qualifier',
    displayName: 'Lead Qualifier',
    description: 'Scores new leads using FIUAC dimensions',
    status: 'active',
    parameters: {
      auto_qualify_threshold: 'FIUAC ≥ 70',
      auto_disqualify: 'FIUAC ≤ 25',
      route_to_queue: '25 < FIUAC < 70',
    },
  },
  {
    name: 'account_enricher',
    displayName: 'Account Enricher',
    description: 'Updates account briefs with new intelligence',
    status: 'active',
    parameters: {
      refresh_cycle: 'Weekly',
      sources: 'Signals, email sync, LinkedIn',
      min_confidence_auto_update: '85%',
      below_85: 'Route to Queue',
    },
  },
  {
    name: 'outreach_drafter',
    displayName: 'Outreach Drafter',
    description: 'Generates personalized outreach using account context',
    status: 'active',
    parameters: {
      always_route_to_queue: 'Yes',
      template_style: 'Consultative',
      personalization_sources: 'Pain, WhyNow, Signals',
      max_sequence_length: '4 steps',
    },
  },
  {
    name: 'pipeline_hygiene',
    displayName: 'Pipeline Hygiene',
    description: 'Monitors deal health and flags stale opportunities',
    status: 'active',
    parameters: {
      stale_threshold: '7 days no activity',
      auto_decay: '5 pts/week engagement',
      alert_threshold: 'health < 40',
    },
  },
  {
    name: 'inbox_classifier',
    displayName: 'Inbox Classifier',
    description: 'Classifies incoming emails by intent',
    status: 'active',
    parameters: {
      classification_types: 'Positive, Question, Objection, Meeting, OOO, New Domain',
      auto_link_by_domain: 'Enabled',
      new_domain_detection: 'Enabled',
      min_classification_confidence: '70%',
    },
  },
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const count = await db.agentConfig.count();
  if (count === 0) {
    await db.agentConfig.createMany({ data: DEFAULT_AGENTS });
  }

  const agents = await db.agentConfig.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: agents });
}
