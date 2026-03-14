import { Prisma } from '@prisma/client';
import { db as prisma } from '@/lib/db';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_SONNET } from './ai';
import { WinLossAnalysisSchema } from './schemas';

const SYSTEM_PROMPT = `You are a deal analyst for a B2B sales team in the GoO (Guarantees of Origin) and renewable certificates market. Analyze closed deals (won or lost) to extract actionable learnings. Focus on what tactics, timing, and channels were most effective, and provide specific recommendations that can improve future deal execution.`;

export async function analyzeWinLoss(opportunityId: string): Promise<void> {
  const client = getAnthropicClient();

  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      account: { select: { id: true, name: true, pain: true, whyNow: true } },
    },
  });

  if (!opp || !['ClosedWon', 'ClosedLost'].includes(opp.stage)) return;

  const signals = opp.account
    ? await prisma.signal.findMany({
        where: { companies: { has: opp.account.name } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
    : [];

  const activities = opp.account
    ? await prisma.activity.findMany({
        where: { accountId: opp.account.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : [];

  const queueItems = await prisma.queueItem.findMany({
    where: { accId: opp.account?.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const outcome = opp.stage === 'ClosedWon' ? 'won' : 'lost';
  const dealDuration = opp.createdAt
    ? Math.floor((Date.now() - opp.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const userPrompt = `Analyze this ${outcome} deal:

Deal: ${opp.name}
Account: ${opp.account?.name || 'Unknown'}
Duration: ${dealDuration} days
Pain: ${opp.account?.pain || 'Unknown'}
WhyNow: ${opp.account?.whyNow || 'Unknown'}

Signals (${signals.length}):
${signals.map((s) => `- ${s.title} (${s.createdAt.toISOString().slice(0, 10)})`).join('\n') || 'None'}

Activities (${activities.length}):
${activities.map((a) => `- ${a.type}: ${a.summary || ''} (${a.createdAt.toISOString().slice(0, 10)})`).join('\n') || 'None'}

Agent actions (${queueItems.length}):
${queueItems.map((q) => `- ${q.type}: ${q.title} — ${q.status} (${q.createdAt.toISOString().slice(0, 10)})`).join('\n') || 'None'}`;

  const response = await client.messages.parse({
    model: MODEL_SONNET,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(WinLossAnalysisSchema) },
    messages: [{ role: 'user', content: userPrompt }],
  });

  await prisma.winLossAnalysis.create({
    data: {
      opportunityId,
      outcome,
      analysis: response.parsed_output as Prisma.InputJsonValue,
    },
  });
}
