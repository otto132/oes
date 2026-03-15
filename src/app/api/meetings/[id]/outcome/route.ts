import { NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { runAgent } from '@/lib/agents/runner';
import { getAgent } from '@/lib/agents/registry';
import { z } from 'zod';

const outcomeSchema = z.object({
  rawNotes: z.string().min(1).max(10000),
});

export const POST = withHandler(outcomeSchema, async (req, ctx) => {
  const id = req.nextUrl.pathname.split('/').at(-2)!; // Extract [id] from URL

  const meeting = await ctx.db.meeting.findUnique({ where: { id } });
  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  // Run meeting-analyst agent synchronously (user is waiting for results in the UI)
  const agent = getAgent('meeting_analyst');
  if (agent) {
    await runAgent(agent, 'event', {
      id: crypto.randomUUID(),
      event: 'meeting_outcome_pasted',
      payload: { meetingId: id, rawNotes: ctx.body.rawNotes },
    });
  }

  // Refetch the updated meeting with outcome summary
  const updated = await ctx.db.meeting.findUnique({ where: { id } });

  return NextResponse.json({ data: { status: 'complete', meeting: updated } });
});
