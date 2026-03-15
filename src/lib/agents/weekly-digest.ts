import { Prisma } from '@prisma/client';
import { db as prisma } from '@/lib/db';
import { sendMail } from '@/lib/integrations/microsoft-graph';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_SONNET } from './ai';
import { DigestNarrativeSchema } from './schemas';
import type { Agent, AgentContext, AgentResult, AgentError } from './types';

// ── Helper: group array by key ──────────────────────────────────
function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

// ── Helper: render simple HTML email template ───────────────────
function renderDigestHtml(
  narrative: {
    pipelineSummary: string;
    accountParagraphs: { accountId: string; accountName: string; narrative: string }[];
    weekAheadSummary: string;
  },
  pipeline: {
    openCount: number;
    totalValue: number;
    newThisWeek: number;
    closedWon: number;
    closedLost: number;
  },
  weekAhead: {
    meetingCount: number;
    tasksDue: number;
    overdueTasks: number;
  }
): string {
  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents);

  const accountSections = narrative.accountParagraphs
    .map(
      (p) => `
    <div style="margin-bottom:16px;">
      <h3 style="margin:0 0 6px;font-size:14px;color:#374151;">${p.accountName}</h3>
      <p style="margin:0;color:#6B7280;font-size:14px;line-height:1.6;">${p.narrative}</p>
    </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Weekly CRM Digest</title></head>
<body style="font-family:system-ui,sans-serif;background:#F9FAFB;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#1D4ED8;padding:24px;color:#fff;">
      <h1 style="margin:0;font-size:20px;font-weight:700;">Weekly CRM Digest</h1>
    </div>
    <div style="padding:24px;">

      <h2 style="margin:0 0 12px;font-size:16px;color:#111827;">Pipeline</h2>
      <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:120px;background:#EFF6FF;border-radius:6px;padding:12px;">
          <div style="font-size:24px;font-weight:700;color:#1D4ED8;">${pipeline.openCount}</div>
          <div style="font-size:12px;color:#6B7280;">Open Deals</div>
        </div>
        <div style="flex:1;min-width:120px;background:#F0FDF4;border-radius:6px;padding:12px;">
          <div style="font-size:24px;font-weight:700;color:#15803D;">${formatCurrency(pipeline.totalValue)}</div>
          <div style="font-size:12px;color:#6B7280;">Pipeline Value</div>
        </div>
        <div style="flex:1;min-width:120px;background:#FFF7ED;border-radius:6px;padding:12px;">
          <div style="font-size:24px;font-weight:700;color:#C2410C;">+${pipeline.newThisWeek}</div>
          <div style="font-size:12px;color:#6B7280;">New This Week</div>
        </div>
        <div style="flex:1;min-width:120px;background:#F0FDF4;border-radius:6px;padding:12px;">
          <div style="font-size:20px;font-weight:700;color:#15803D;">${pipeline.closedWon}W / ${pipeline.closedLost}L</div>
          <div style="font-size:12px;color:#6B7280;">Closed</div>
        </div>
      </div>
      <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">${narrative.pipelineSummary}</p>

      ${
        accountSections
          ? `<h2 style="margin:0 0 12px;font-size:16px;color:#111827;">Account Highlights</h2>
      <div style="margin-bottom:24px;">${accountSections}</div>`
          : ''
      }

      <h2 style="margin:0 0 12px;font-size:16px;color:#111827;">Week Ahead</h2>
      <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:100px;background:#F5F3FF;border-radius:6px;padding:12px;">
          <div style="font-size:20px;font-weight:700;color:#7C3AED;">${weekAhead.meetingCount}</div>
          <div style="font-size:12px;color:#6B7280;">Meetings</div>
        </div>
        <div style="flex:1;min-width:100px;background:#EFF6FF;border-radius:6px;padding:12px;">
          <div style="font-size:20px;font-weight:700;color:#1D4ED8;">${weekAhead.tasksDue}</div>
          <div style="font-size:12px;color:#6B7280;">Tasks Due</div>
        </div>
        ${
          weekAhead.overdueTasks > 0
            ? `<div style="flex:1;min-width:100px;background:#FFF1F2;border-radius:6px;padding:12px;">
          <div style="font-size:20px;font-weight:700;color:#BE123C;">${weekAhead.overdueTasks}</div>
          <div style="font-size:12px;color:#6B7280;">Overdue</div>
        </div>`
            : ''
        }
      </div>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${narrative.weekAheadSummary}</p>

    </div>
    <div style="background:#F3F4F6;padding:16px;text-align:center;font-size:12px;color:#9CA3AF;">
      Generated by eco-insight CRM agent
    </div>
  </div>
</body>
</html>`;
}

const SYSTEM_PROMPT = `You are a weekly CRM analyst for a B2B sales team in the GoO (Guarantees of Origin) and renewable certificates market. Synthesize the past week's activity into a concise, informative digest. Write in a professional but approachable tone. Focus on meaningful patterns, momentum shifts, and upcoming priorities.`;

export const weeklyDigestAgent: Agent = {
  name: 'weekly_digest',
  triggers: [{ type: 'cron', schedule: '0 18 * * 0' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    // Skip if paused or disabled
    if (ctx.config.status === 'paused' || ctx.config.status === 'disabled') {
      return {
        items: [],
        metrics: { scanned: 0, matched: 0, skipped: 1 },
        errors: [],
      };
    }

    const errors: AgentError[] = [];

    // ── Date windows ────────────────────────────────────────────
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(now);
    weekEnd.setHours(23, 59, 59, 999);

    const nextWeekEnd = new Date(now);
    nextWeekEnd.setDate(now.getDate() + 7);
    nextWeekEnd.setHours(23, 59, 59, 999);

    // ── Past 7 days: gather data ─────────────────────────────────
    const [
      opportunities,
      pipelineAggregate,
      emails,
      meetings,
      tasks,
      queueItems,
      contacts,
    ] = await Promise.all([
      prisma.opportunity.findMany({
        where: { stage: { notIn: ['ClosedWon', 'ClosedLost'] } },
        include: {
          account: { select: { id: true, name: true } },
        },
      }),
      prisma.opportunity.aggregate({
        where: { stage: { notIn: ['ClosedWon', 'ClosedLost'] } },
        _sum: { amount: true },
      }),
      prisma.inboxEmail.findMany({
        where: { receivedAt: { gte: weekStart, lte: weekEnd } },
        select: { id: true, fromEmail: true, subject: true, receivedAt: true },
      }),
      prisma.meeting.findMany({
        where: { date: { gte: weekStart, lte: weekEnd } },
        select: { id: true, title: true, date: true, accountId: true },
      }),
      prisma.task.findMany({
        where: { createdAt: { gte: weekStart, lte: weekEnd } },
        select: { id: true, title: true, status: true, dueDate: true },
      }),
      prisma.queueItem.findMany({
        where: { createdAt: { gte: weekStart, lte: weekEnd } },
        select: { id: true, type: true, title: true, status: true, accName: true },
      }),
      prisma.contact.findMany({
        where: { createdAt: { gte: weekStart, lte: weekEnd } },
        select: { id: true, name: true, accountId: true },
      }),
    ]);

    // ── Upcoming week: meetings + tasks ──────────────────────────
    const [upcomingMeetings, upcomingTasks, overdueTasks, newOpps, closedWon, closedLost] = await Promise.all([
      prisma.meeting.findMany({
        where: { date: { gt: now, lte: nextWeekEnd } },
        select: { id: true, title: true, date: true, accountId: true },
      }),
      prisma.task.findMany({
        where: { dueDate: { gt: now, lte: nextWeekEnd }, status: { not: 'Done' } },
        select: { id: true, title: true, dueDate: true },
      }),
      prisma.task.findMany({
        where: { dueDate: { lt: now }, status: { not: 'Done' } },
        select: { id: true, title: true, dueDate: true },
      }),
      prisma.opportunity.findMany({
        where: { createdAt: { gte: weekStart, lte: weekEnd } },
        select: { id: true, name: true, amount: true, stage: true },
      }),
      prisma.opportunity.findMany({
        where: { stage: 'ClosedWon', updatedAt: { gte: weekStart, lte: weekEnd } },
        select: { id: true, name: true, amount: true },
      }),
      prisma.opportunity.findMany({
        where: { stage: 'ClosedLost', updatedAt: { gte: weekStart, lte: weekEnd } },
        select: { id: true, name: true },
      }),
    ]);

    // ── Pipeline snapshot ────────────────────────────────────────
    const pipelineSnapshot = {
      openCount: opportunities.length,
      totalValue: pipelineAggregate._sum.amount ?? 0,
      newThisWeek: newOpps.length,
      closedWon: closedWon.length,
      closedLost: closedLost.length,
    };

    // ── Account highlights ───────────────────────────────────────
    const meetingsByAccount = groupBy(
      meetings.filter((m) => m.accountId),
      (m) => m.accountId!
    );

    const accountIds = [...new Set([
      ...meetings.filter((m) => m.accountId).map((m) => m.accountId as string),
      ...contacts.filter((c) => c.accountId).map((c) => c.accountId as string),
    ])];

    const accountHighlights = accountIds.map((accountId) => ({
      accountId,
      meetingCount: (meetingsByAccount[accountId] ?? []).length,
      newContacts: contacts.filter((c) => c.accountId === accountId).length,
    }));

    // ── Week ahead structure ─────────────────────────────────────
    const weekAhead = {
      meetingCount: upcomingMeetings.length,
      tasksDue: upcomingTasks.length,
      overdueTasks: overdueTasks.length,
    };

    // ── AI narrative synthesis ───────────────────────────────────
    let narrative: {
      pipelineSummary: string;
      accountParagraphs: { accountId: string; accountName: string; narrative: string }[];
      weekAheadSummary: string;
    };

    try {
      const client = getAnthropicClient();

      const oppsByAccount = groupBy(
        opportunities.filter((o) => o.account),
        (o) => o.account!.id
      );

      const accountSummaries = Object.entries(oppsByAccount)
        .slice(0, 10)
        .map(([accountId, opps]) => {
          const accountName = opps[0]?.account?.name ?? 'Unknown';
          const meetCount = (meetingsByAccount[accountId] ?? []).length;
          return `${accountName}: ${opps.length} open deal(s), ${meetCount} meeting(s) this week`;
        })
        .join('\n');

      const userPrompt = `Summarize this week's CRM activity for the GoO/renewable certificates team:

PIPELINE:
- Open deals: ${pipelineSnapshot.openCount} (total value: €${Math.round(pipelineSnapshot.totalValue / 100).toLocaleString()})
- New this week: ${pipelineSnapshot.newThisWeek}
- Closed Won: ${pipelineSnapshot.closedWon}
- Closed Lost: ${pipelineSnapshot.closedLost}

ACTIVITY:
- Emails received: ${emails.length}
- Meetings held: ${meetings.length}
- Tasks created: ${tasks.length}
- New contacts: ${contacts.length}
- Queue items actioned: ${queueItems.length}

TOP ACCOUNTS:
${accountSummaries || 'No active accounts this week'}

WEEK AHEAD:
- Meetings scheduled: ${upcomingMeetings.length}
- Tasks due: ${upcomingTasks.length}
- Overdue tasks: ${overdueTasks.length}

Closed Won this week:
${closedWon.map((o) => `- ${o.name}`).join('\n') || 'None'}

Closed Lost this week:
${closedLost.map((o) => `- ${o.name}`).join('\n') || 'None'}

Write pipelineSummary (2-3 sentences), accountParagraphs for any notable accounts, and weekAheadSummary (1-2 sentences).`;

      const response = await client.messages.parse({
        model: MODEL_SONNET,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        output_config: { format: zodOutputFormat(DigestNarrativeSchema) },
        messages: [{ role: 'user', content: userPrompt }],
      });

      if (!response.parsed_output) throw new Error('No parsed output from AI');
      narrative = response.parsed_output;
    } catch (err) {
      errors.push({
        message: `AI synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
      // Fallback narrative
      narrative = {
        pipelineSummary: `This week had ${pipelineSnapshot.openCount} open deals worth €${Math.round(pipelineSnapshot.totalValue / 100).toLocaleString()}. ${pipelineSnapshot.closedWon} deals were won and ${pipelineSnapshot.closedLost} were lost.`,
        accountParagraphs: [],
        weekAheadSummary: `${weekAhead.meetingCount} meetings and ${weekAhead.tasksDue} tasks are scheduled for the week ahead.`,
      };
    }

    // ── Render HTML ──────────────────────────────────────────────
    const renderedHtml = renderDigestHtml(narrative, pipelineSnapshot, weekAhead);

    // ── Persist digest to DB ─────────────────────────────────────
    try {
      const tenant = await prisma.tenant.findFirst();
      if (!tenant) throw new Error('No tenant found');

      await prisma.weeklyDigest.create({
        data: {
          weekStart,
          weekEnd,
          pipelineSnapshot: pipelineSnapshot as Prisma.InputJsonValue,
          accountHighlights: accountHighlights as Prisma.InputJsonValue,
          weekAhead: weekAhead as Prisma.InputJsonValue,
          renderedHtml,
          tenantId: tenant.id,
        },
      });
    } catch (err) {
      errors.push({
        message: `Failed to persist digest: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: false,
      });
    }

    // Send digest email to all active users
    try {
      const users = await prisma.user.findMany({
        where: { role: { not: 'VIEWER' } },
        include: { integrationTokens: { where: { provider: 'microsoft' } } },
      });

      for (const user of users) {
        const token = (user as any).integrationTokens?.[0];
        if (!token?.accessToken || !user.email) continue;

        try {
          await sendMail(token.accessToken, [user.email], `Weekly Digest — ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()}`, renderedHtml);
        } catch (err) {
          console.error(`Failed to send digest email to ${user.email}:`, err);
        }
      }
    } catch (err) {
      console.error('Failed to query users for digest delivery:', err);
    }

    return {
      items: [],
      metrics: {
        scanned: opportunities.length + emails.length + meetings.length + tasks.length,
        matched: 0,
        skipped: 0,
      },
      errors,
    };
  },
};
