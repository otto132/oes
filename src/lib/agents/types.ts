import type { QueueItemType, QueuePriority } from '@prisma/client';
import type { AgentConfig } from '@prisma/client';

export interface Agent {
  name: string;
  triggers: AgentTrigger[];
  analyze(context: AgentContext): Promise<AgentResult>;
}

export interface AgentContext {
  config: AgentConfig;
  userId: string;
  triggerEvent?: AgentEventData;
}

export interface AgentEventData {
  id: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface AgentResult {
  items: NewQueueItem[];
  metrics: { scanned: number; matched: number; skipped: number };
  errors: AgentError[];
}

export interface AgentError {
  message: string;
  source?: string;
  recoverable: boolean;
}

export type AgentTrigger =
  | { type: 'cron'; schedule: string }
  | { type: 'event'; event: string }
  | { type: 'chain'; afterApproval: QueueItemType | string };

export interface NewQueueItem {
  type: QueueItemType;
  title: string;
  accName: string;
  accId: string | null;
  agent: string;
  confidence: number;
  confidenceBreakdown: Record<string, number>;
  sources: { name: string; url: string | null }[];
  payload: Record<string, unknown>;
  reasoning: string;
  priority: QueuePriority;
}

export interface ContextBundle {
  signals?: { title: string; relevance: string; source: string }[];
  qualification?: {
    scores: Record<string, number>;
    reasoning: string;
    gaps: string[];
  };
  enrichment?: {
    pain: string;
    whyNow: string;
    approachBrief: string;
    personalProfile: Record<string, unknown>;
  };
  emailSentiment?: { trend: string; lastClassification: string };
  competitorActivity?: { competitor: string; activity: string }[];
}
