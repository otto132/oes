import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAnthropicClient, MODEL_SONNET } from '@/lib/agents/ai';
import { sendMail } from '@/lib/integrations/microsoft-graph';

// Triggered daily at 6 PM by Vercel Cron
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59, 999);

  const meetings = await db.meeting.findMany({
    where: { date: { gte: tomorrowStart, lte: tomorrowEnd } },
  });

  let sent = 0;
  for (const meeting of meetings) {
    if (!meeting.accountId) continue;

    const [account, lastMeeting] = await Promise.all([
      db.account.findUnique({ where: { id: meeting.accountId } }),
      db.meeting.findFirst({
        where: { accountId: meeting.accountId, id: { not: meeting.id }, outcomeRecordedAt: { not: null } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL_SONNET,
      max_tokens: 512,
      system: 'Write a brief email-friendly meeting prep summary. 3-5 bullet points. Be specific.',
      messages: [{
        role: 'user',
        content: JSON.stringify({
          meeting: { title: meeting.title, date: meeting.date, attendees: meeting.attendees },
          account: account ? { name: account.name, pain: (account as any).pain } : null,
          lastMeeting: lastMeeting ? { title: lastMeeting.title, outcome: (lastMeeting as any).outcomeSummary } : null,
        }),
      }],
    });

    const prepText = response.content[0].type === 'text' ? response.content[0].text : '';

    const users = await db.user.findMany({
      include: { integrationTokens: { where: { provider: 'microsoft' } } },
      take: 1,
    });
    const token = (users[0] as any)?.integrationTokens?.[0]?.accessToken;
    const userEmail = users[0]?.email;

    if (token && userEmail) {
      try {
        await sendMail(token, [userEmail], `Prep: ${meeting.title} tomorrow`, `
          <div style="font-family: -apple-system, sans-serif; max-width: 500px;">
            <h3>${meeting.title}</h3>
            <p><strong>When:</strong> ${meeting.date.toLocaleDateString()}</p>
            <p><strong>With:</strong> ${meeting.attendees?.join(', ') || 'TBD'}</p>
            <hr/>
            ${prepText.replace(/\n/g, '<br/>')}
          </div>
        `);
        sent++;
      } catch { /* best effort */ }
    }
  }

  return NextResponse.json({ data: { meetingsFound: meetings.length, nudgesSent: sent } });
}
