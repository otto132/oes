import { z } from 'zod';

// ── Signal Hunter ──────────────────────────────────────────────
export const SignalScoreSchema = z.object({
  scores: z.array(z.object({
    signalIndex: z.number(),
    relevance: z.number().min(0).max(100),
    reasoning: z.string(),
    category: z.enum([
      'ppa_announcement', 'renewable_target', 'market_entry',
      'job_posting', 'conference', 'registry_pain',
    ]),
    actionability: z.string(),
    accountImpact: z.string(),
    isCompetitorSignal: z.boolean(),
    competitorName: z.string().nullable(),
    defensiveAction: z.string().nullable(),
  })),
});

// ── Lead Qualifier ─────────────────────────────────────────────
export const LeadQualificationSchema = z.object({
  recommendation: z.enum(['qualify', 'disqualify', 'review']),
  scores: z.object({
    fit: z.number().min(0).max(100),
    intent: z.number().min(0).max(100),
    urgency: z.number().min(0).max(100),
    access: z.number().min(0).max(100),
    commercial: z.number().min(0).max(100),
  }),
  reasoning: z.string(),
  gaps: z.array(z.string()),
  suggestedNextStep: z.string(),
  inferredFrom: z.record(z.string(), z.string()),
});

// ── Inbox Classifier ───────────────────────────────────────────
export const EmailClassificationSchema = z.object({
  classifications: z.array(z.object({
    emailIndex: z.number(),
    intent: z.enum([
      'positive_reply', 'question', 'objection', 'meeting_request',
      'bounce', 'unsubscribe', 'new_domain', 'auto_reply', 'internal', 'spam',
    ]),
    sentiment: z.enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative']),
    urgency: z.enum(['immediate', 'high', 'normal', 'low']),
    buyingSignals: z.array(z.string()),
    competitorMentions: z.array(z.string()),
    suggestedResponse: z.string(),
    suggestedPriority: z.enum(['High', 'Normal']),
    accountLinkSuggestion: z.string().nullable(),
  })),
});

// ── Account Enricher ───────────────────────────────────────────
export const PersonalProfileSchema = z.object({
  interests: z.array(z.string()),
  values: z.array(z.string()),
  communicationStyle: z.string(),
  rapportHooks: z.array(z.string()),
  networkConnections: z.array(z.object({
    type: z.enum(['direct_connection', 'shared_contact', 'shared_affiliation']),
    teamMember: z.string().nullable(),
    throughContact: z.string().nullable(),
    affiliation: z.string().nullable(),
    strength: z.string(),
    suggestedAction: z.string(),
  })),
});

export const ApproachBriefSchema = z.object({
  recommendedChannel: z.enum(['warm_intro', 'linkedin_dm', 'cold_email', 'phone', 'event']),
  toneGuidance: z.string(),
  opener: z.string(),
  talkingPoints: z.array(z.string()),
  icebreakers: z.array(z.string()),
  topicsToAvoid: z.array(z.string()),
  timingRationale: z.string(),
  connectionPath: z.string().nullable(),
});

export const EnrichmentResultSchema = z.object({
  contactData: z.object({
    name: z.string(),
    title: z.string(),
    emailGuess: z.string().nullable(),
    emailConfidence: z.number(),
    location: z.string().nullable(),
    headline: z.string().nullable(),
  }),
  personalProfile: PersonalProfileSchema,
  accountInsights: z.object({
    pain: z.string(),
    whyNow: z.string(),
    stakeholders: z.array(z.object({
      role: z.string(),
      identified: z.boolean(),
      name: z.string().nullable(),
    })),
  }),
  approachBrief: ApproachBriefSchema,
  confidence: z.object({
    extraction: z.number(),
    emailGuess: z.number(),
    personalProfile: z.number(),
    accountInsights: z.number(),
  }),
});

// ── Pipeline Hygiene ───────────────────────────────────────────
export const RecoveryPlaybookSchema = z.object({
  diagnosis: z.string(),
  recoverySteps: z.array(z.object({
    action: z.string(),
    rationale: z.string(),
    owner: z.string().nullable(),
    deadline: z.string(),
  })),
  riskLevel: z.enum(['recoverable', 'at_risk', 'likely_lost']),
  competitorThreat: z.string().nullable(),
});

// ── Outreach Drafter ───────────────────────────────────────────
export const OutreachDraftSchema = z.object({
  subjectA: z.string(),
  subjectB: z.string(),
  body: z.string(),
  introRequestMessage: z.string().nullable(),
  toneUsed: z.string(),
  personalizationHooks: z.array(z.string()),
  reasoning: z.string(),
});

// ── Win/Loss Analysis ──────────────────────────────────────────
export const WinLossAnalysisSchema = z.object({
  outcome: z.enum(['won', 'lost']),
  keyFactors: z.array(z.string()),
  whatWorked: z.array(z.string()),
  whatDidnt: z.array(z.string()),
  timingInsights: z.string(),
  channelEffectiveness: z.string(),
  competitorInsight: z.string().nullable(),
  recommendations: z.array(z.string()),
});

// ── Meeting Analyst ────────────────────────────────────────────
export const MeetingAnalysisSchema = z.object({
  summary: z.string().describe('Structured narrative summary of the meeting'),
  actionItems: z.array(z.object({
    title: z.string(),
    suggestedOwner: z.string().optional(),
    suggestedDueDate: z.string().optional(),
    accountName: z.string().optional(),
  })).describe('Extracted action items from the notes'),
  followUpMeetings: z.array(z.object({
    topic: z.string(),
    suggestedDate: z.string().optional(),
    attendees: z.array(z.string()),
  })).describe('Follow-up meetings detected in notes'),
  enrichmentSuggestions: z.array(z.object({
    field: z.string().describe('Account field to update (e.g., pain, whyNow, competitors)'),
    currentValue: z.string().optional(),
    suggestedValue: z.string(),
    reasoning: z.string(),
  })).describe('Account data that could be updated from meeting notes'),
  contactIntelligence: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
    sentiment: z.string().optional().describe('positive | neutral | negative'),
    isNew: z.boolean().describe('Whether this is a new contact not yet in the CRM'),
  })).describe('Contact information mentioned in notes'),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
});

// ── Weekly Digest ──────────────────────────────────────────────
export const DigestNarrativeSchema = z.object({
  pipelineSummary: z.string().describe('2-3 sentence narrative of pipeline changes this week'),
  accountParagraphs: z.array(z.object({
    accountId: z.string(),
    accountName: z.string(),
    narrative: z.string().describe('One paragraph summarizing this account\'s week'),
  })),
  weekAheadSummary: z.string().describe('1-2 sentence preview of the upcoming week'),
});
