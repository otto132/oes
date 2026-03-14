import { describe, it, expect } from 'vitest';
import {
  SignalScoreSchema,
  LeadQualificationSchema,
  EmailClassificationSchema,
  EnrichmentResultSchema,
  RecoveryPlaybookSchema,
  OutreachDraftSchema,
  WinLossAnalysisSchema,
  PersonalProfileSchema,
} from '../schemas';

describe('Agent Zod Schemas', () => {
  it('SignalScoreSchema accepts valid data', () => {
    const data = {
      scores: [{
        signalIndex: 0,
        relevance: 75,
        reasoning: 'Strong PPA announcement match',
        category: 'ppa_announcement' as const,
        actionability: 'Reach out to discuss GoO sourcing',
        accountImpact: 'Aligns with their renewable target commitments',
        isCompetitorSignal: false,
        competitorName: null,
        defensiveAction: null,
      }],
    };
    expect(() => SignalScoreSchema.parse(data)).not.toThrow();
  });

  it('SignalScoreSchema rejects invalid category', () => {
    const data = {
      scores: [{
        signalIndex: 0, relevance: 75, reasoning: 'test',
        category: 'invalid_category',
        actionability: 'test', accountImpact: 'test',
        isCompetitorSignal: false, competitorName: null, defensiveAction: null,
      }],
    };
    expect(() => SignalScoreSchema.parse(data)).toThrow();
  });

  it('LeadQualificationSchema accepts valid data', () => {
    const data = {
      recommendation: 'qualify' as const,
      scores: { fit: 80, intent: 70, urgency: 60, access: 50, commercial: 90 },
      reasoning: 'Strong Nordic PPA buyer',
      gaps: ['No direct contact identified'],
      suggestedNextStep: 'Enrich contacts via LinkedIn',
      inferredFrom: { intent: 'Conference attendance signal' },
    };
    expect(() => LeadQualificationSchema.parse(data)).not.toThrow();
  });

  it('EmailClassificationSchema accepts valid data', () => {
    const data = {
      classifications: [{
        emailIndex: 0,
        intent: 'positive_reply' as const,
        sentiment: 'positive' as const,
        urgency: 'high' as const,
        buyingSignals: ['mentioned budget approval'],
        competitorMentions: [],
        suggestedResponse: 'Respond within 24h with discovery call offer',
        suggestedPriority: 'High' as const,
        accountLinkSuggestion: null,
      }],
    };
    expect(() => EmailClassificationSchema.parse(data)).not.toThrow();
  });

  it('PersonalProfileSchema accepts valid data', () => {
    const data = {
      interests: ['offshore wind', 'sustainability'],
      values: ['environmental impact', 'innovation'],
      communicationStyle: 'Technical and data-driven',
      rapportHooks: ['Former competitive sailor'],
      networkConnections: [{
        type: 'shared_affiliation' as const,
        teamMember: 'Mikko L.',
        throughContact: null,
        affiliation: 'Aalto University alumni',
        strength: 'Same graduating class',
        suggestedAction: 'Mikko can reference shared alma mater',
      }],
    };
    expect(() => PersonalProfileSchema.parse(data)).not.toThrow();
  });

  it('EnrichmentResultSchema accepts valid data', () => {
    const data = {
      contactData: {
        name: 'Anna Eriksson',
        title: 'Head of Energy Procurement',
        emailGuess: 'anna.eriksson@company.com',
        emailConfidence: 0.5,
        location: 'Stockholm, Sweden',
        headline: 'Renewable energy procurement leader',
      },
      personalProfile: {
        interests: ['offshore wind'],
        values: ['sustainability'],
        communicationStyle: 'Technical',
        rapportHooks: ['Nordic Clean Energy speaker'],
        networkConnections: [],
      },
      accountInsights: {
        pain: 'High certificate sourcing costs',
        whyNow: 'Current supplier contract expires Q3',
        stakeholders: [{ role: 'Decision Maker', identified: true, name: 'Anna Eriksson' }],
      },
      approachBrief: {
        recommendedChannel: 'warm_intro' as const,
        toneGuidance: 'Technical and data-driven',
        opener: 'Reference shared Aalto connection',
        talkingPoints: ['GoO cost reduction', 'Q3 contract renewal'],
        icebreakers: ['Nordic Clean Energy panel'],
        topicsToAvoid: ['Competitor pricing'],
        timingRationale: 'Contract renewal in 3 months',
        connectionPath: 'Ask Mikko for intro via Aalto alumni network',
      },
      confidence: { extraction: 0.9, emailGuess: 0.5, personalProfile: 0.6, accountInsights: 0.7 },
    };
    expect(() => EnrichmentResultSchema.parse(data)).not.toThrow();
  });

  it('RecoveryPlaybookSchema accepts valid data', () => {
    const data = {
      diagnosis: 'Deal stalled after proposal — no follow-up on pricing question',
      recoverySteps: [{
        action: 'Send pricing comparison (3yr vs 1yr)',
        rationale: 'Their last email asked about multi-year pricing',
        owner: null,
        deadline: 'within 48h',
      }],
      riskLevel: 'at_risk' as const,
      competitorThreat: 'CompetitorX seen at same conference',
    };
    expect(() => RecoveryPlaybookSchema.parse(data)).not.toThrow();
  });

  it('OutreachDraftSchema accepts valid data', () => {
    const data = {
      subjectA: 'GoO sourcing for Q3 renewal',
      subjectB: 'Quick question about your certificate procurement',
      body: 'Hi Anna, I noticed your contract renewal...',
      introRequestMessage: 'Hi Mikko, would you mind introducing me to Anna?',
      toneUsed: 'Technical, data-driven',
      personalizationHooks: ['Nordic Clean Energy panel reference', 'Q3 renewal timing'],
      reasoning: 'Warm intro via Aalto alumni, technical tone matches her communication style',
    };
    expect(() => OutreachDraftSchema.parse(data)).not.toThrow();
  });

  it('WinLossAnalysisSchema accepts valid data', () => {
    const data = {
      outcome: 'won' as const,
      keyFactors: ['Strong champion engagement', 'Competitive pricing'],
      whatWorked: ['Warm intro converted quickly', 'Technical deep-dive demo'],
      whatDidnt: ['Initial cold email ignored'],
      timingInsights: 'Engaged 2 months before contract renewal — ideal window',
      channelEffectiveness: 'Warm intro > LinkedIn DM > cold email',
      competitorInsight: 'Won against CompetitorX on implementation timeline',
      recommendations: ['Prioritize warm intros', 'Engage 2-3 months before renewal'],
    };
    expect(() => WinLossAnalysisSchema.parse(data)).not.toThrow();
  });
});
