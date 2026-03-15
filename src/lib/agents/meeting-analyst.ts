import { db as prisma } from '@/lib/db';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_SONNET } from './ai';
import { MeetingAnalysisSchema } from './schemas';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const SYSTEM_PROMPT = `You are a meeting analyst for a B2B sales team in the GoO (Guarantees of Origin) and renewable certificates market. When given raw meeting notes, extract a structured summary, action items, follow-up meeting needs, account enrichment suggestions, and contact intelligence. Be specific and actionable — reference exact commitments, names, dates, and any signals that reveal account status or buyer intent.`;

export const meetingAnalystAgent: Agent = {
  name: 'meeting_analyst',
  triggers: [{ type: 'event', event: 'meeting_outcome_pasted' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    if (ctx.config.status === 'paused' || ctx.config.status === 'disabled') {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 0 }, errors: [] };
    }

    const payload = ctx.triggerEvent?.payload ?? {};
    const meetingId = payload.meetingId as string | undefined;
    const rawNotes = payload.rawNotes as string | undefined;

    if (!meetingId || !rawNotes) {
      return {
        items: [],
        metrics: { scanned: 0, matched: 0, skipped: 1 },
        errors: [{ message: 'Missing meetingId or rawNotes in event payload', recoverable: false }],
      };
    }

    let client: ReturnType<typeof getAnthropicClient>;
    try {
      client = getAnthropicClient();
    } catch {
      return {
        items: [],
        metrics: { scanned: 1, matched: 0, skipped: 1 },
        errors: [{ message: 'ANTHROPIC_API_KEY not configured', recoverable: false }],
      };
    }

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      return {
        items: [],
        metrics: { scanned: 1, matched: 0, skipped: 1 },
        errors: [{ message: `Meeting ${meetingId} not found`, recoverable: false }],
      };
    }

    const account = meeting.accountId
      ? await prisma.account.findUnique({ where: { id: meeting.accountId } })
      : null;

    const accName = account?.name ?? (meeting as Record<string, unknown>).accountName as string ?? '';
    const accId = account?.id ?? meeting.accountId ?? null;

    const userPrompt = `Analyze these meeting notes and extract structured information:

Meeting: ${meeting.title}
Account: ${accName}
Attendees: ${((meeting as Record<string, unknown>).attendees as string[] | undefined)?.join(', ') ?? 'Unknown'}
${account?.pain ? `Account pain: ${account.pain}` : ''}

Raw notes:
${rawNotes}`;

    const errors: AgentError[] = [];
    let analysis: Awaited<ReturnType<typeof client.messages.parse>>['parsed_output'];

    try {
      const response = await client.messages.parse({
        model: MODEL_SONNET,
        max_tokens: 2048,
        cache_control: { type: 'ephemeral' },
        system: SYSTEM_PROMPT,
        output_config: { format: zodOutputFormat(MeetingAnalysisSchema) },
        messages: [{ role: 'user', content: userPrompt }],
      });
      analysis = response.parsed_output;
    } catch (err) {
      return {
        items: [],
        metrics: { scanned: 1, matched: 0, skipped: 1 },
        errors: [{
          message: `AI analysis failed: ${err instanceof Error ? err.message : String(err)}`,
          source: meetingId,
          recoverable: true,
        }],
      };
    }

    if (!analysis) {
      return {
        items: [],
        metrics: { scanned: 1, matched: 0, skipped: 1 },
        errors: [{ message: 'No parsed output from AI', source: meetingId, recoverable: true }],
      };
    }

    // Save summary directly to meeting record
    try {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { summary: analysis.summary },
      });
    } catch (err) {
      errors.push({
        message: `Failed to save summary to meeting: ${err instanceof Error ? err.message : String(err)}`,
        source: meetingId,
        recoverable: true,
      });
    }

    const items: NewQueueItem[] = [];
    const sentimentConfidence = analysis.sentiment === 'positive' ? 0.85 : analysis.sentiment === 'negative' ? 0.9 : 0.7;

    // Action items → task_creation
    for (const actionItem of analysis.actionItems) {
      items.push({
        type: 'task_creation',
        title: actionItem.title,
        accName,
        accId,
        agent: 'meeting_analyst',
        confidence: sentimentConfidence,
        confidenceBreakdown: {
          meetingContext: 0.9,
          sentiment: sentimentConfidence,
        },
        sources: [{ name: 'Meeting Notes', url: null }],
        payload: {
          meetingId,
          suggestedOwner: actionItem.suggestedOwner ?? null,
          suggestedDueDate: actionItem.suggestedDueDate ?? null,
          meetingTitle: meeting.title,
          sentiment: analysis.sentiment,
        },
        reasoning: `Action item extracted from meeting "${meeting.title}": ${actionItem.title}${actionItem.suggestedOwner ? ` — owner: ${actionItem.suggestedOwner}` : ''}`,
        priority: analysis.sentiment === 'positive' ? 'Normal' : 'High',
      });
    }

    // Enrichment suggestions → enrichment
    for (const suggestion of analysis.enrichmentSuggestions) {
      items.push({
        type: 'enrichment',
        title: `Update ${suggestion.field} for ${accName}`,
        accName,
        accId,
        agent: 'meeting_analyst',
        confidence: 0.8,
        confidenceBreakdown: {
          meetingContext: 0.9,
          fieldRelevance: 0.75,
        },
        sources: [{ name: 'Meeting Notes', url: null }],
        payload: {
          meetingId,
          field: suggestion.field,
          currentValue: suggestion.currentValue ?? null,
          suggestedValue: suggestion.suggestedValue,
          reasoning: suggestion.reasoning,
        },
        reasoning: suggestion.reasoning,
        priority: 'Normal',
      });
    }

    // Follow-up meetings → meeting_scheduling
    for (const followUp of analysis.followUpMeetings) {
      items.push({
        type: 'meeting_scheduling',
        title: `Schedule: ${followUp.topic}`,
        accName,
        accId,
        agent: 'meeting_analyst',
        confidence: 0.75,
        confidenceBreakdown: {
          meetingContext: 0.85,
          explicitRequest: 0.8,
        },
        sources: [{ name: 'Meeting Notes', url: null }],
        payload: {
          meetingId,
          topic: followUp.topic,
          suggestedDate: followUp.suggestedDate ?? null,
          attendees: followUp.attendees,
        },
        reasoning: `Follow-up meeting identified in notes for "${meeting.title}": ${followUp.topic}`,
        priority: 'Normal',
      });
    }

    // Contact intelligence → enrichment
    for (const contact of analysis.contactIntelligence) {
      if (contact.isNew) {
        items.push({
          type: 'enrichment',
          title: `New contact: ${contact.name}`,
          accName,
          accId,
          agent: 'meeting_analyst',
          confidence: 0.7,
          confidenceBreakdown: {
            meetingContext: 0.85,
            newContact: 1.0,
          },
          sources: [{ name: 'Meeting Notes', url: null }],
          payload: {
            meetingId,
            contactName: contact.name,
            contactRole: contact.role ?? null,
            sentiment: contact.sentiment ?? null,
            isNew: true,
          },
          reasoning: `New contact ${contact.name}${contact.role ? ` (${contact.role})` : ''} identified in meeting "${meeting.title}"`,
          priority: 'Normal',
        });
      } else if (contact.sentiment) {
        items.push({
          type: 'enrichment',
          title: `Contact update: ${contact.name}`,
          accName,
          accId,
          agent: 'meeting_analyst',
          confidence: 0.65,
          confidenceBreakdown: {
            meetingContext: 0.8,
            sentimentSignal: 0.7,
          },
          sources: [{ name: 'Meeting Notes', url: null }],
          payload: {
            meetingId,
            contactName: contact.name,
            contactRole: contact.role ?? null,
            sentiment: contact.sentiment,
            isNew: false,
          },
          reasoning: `Contact ${contact.name} showed ${contact.sentiment} sentiment in meeting "${meeting.title}"`,
          priority: 'Normal',
        });
      }
    }

    return {
      items,
      metrics: { scanned: 1, matched: items.length, skipped: items.length === 0 ? 1 : 0 },
      errors,
    };
  },
};
