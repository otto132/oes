// ═══════════════════════════════════════════════════════════════
// Calendar Sync Service
// ═══════════════════════════════════════════════════════════════
// Fetches calendar events from Microsoft Graph, matches attendees
// to contacts/accounts, and stores in meetings table.

import { db } from '@/lib/db';
import { fetchUpcomingEvents, type GraphEvent } from './microsoft-graph';
import { runSync } from './run-sync';

// Match attendee email to a contact → account
async function matchAttendeeToAccount(email: string): Promise<{ accountId: string; accountName: string } | null> {
  const contact = await db.contact.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { account: { select: { id: true, name: true } } },
  });
  if (contact) return { accountId: contact.account.id, accountName: contact.account.name };
  return null;
}

export async function syncCalendar(): Promise<{ synced: number; errors: string[] }> {
  return runSync({
    type: 'calendar',
    syncFn: async (tokenRow, accessToken) => {
      let synced = 0;
      const errors: string[] = [];

      // Fetch next 14 days of events
      let events: GraphEvent[];
      try {
        events = await fetchUpcomingEvents(accessToken, 14);
      } catch (err) {
        errors.push(`Graph API error for ${tokenRow.userEmail}: ${err}`);
        return { synced, errors };
      }

      for (const ev of events) {
        try {
          if (ev.isAllDay) continue;

          const graphId = ev.id;

          // Parse start/end times
          const startTime = new Date(ev.start.dateTime);
          const endTime = new Date(ev.end.dateTime);
          const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

          // Date at midnight for consistent date-range queries
          const dateOnly = new Date(startTime);
          dateOnly.setUTCHours(0, 0, 0, 0);

          // Match attendees to accounts
          const externalAttendees = ev.attendees.filter(a => a.type !== 'organizer');
          const attendeeNames = externalAttendees.map(a => a.emailAddress.name);
          const attendeeEmails = externalAttendees.map(a => a.emailAddress.address);
          let accountMatch: { accountId: string; accountName: string } | null = null;

          for (const att of externalAttendees) {
            const match = await matchAttendeeToAccount(att.emailAddress.address);
            if (match) { accountMatch = match; break; }
          }

          const meetingData = {
            title: ev.subject,
            startTime,
            duration,
            date: dateOnly,
            attendees: attendeeNames,
            attendeeEmails,
            prepStatus: 'draft' as const,
            accountId: accountMatch?.accountId || null,
            accountName: accountMatch?.accountName || null,
          };

          // Dedup by externalId using upsert (race-condition safe)
          if (graphId) {
            const result = await db.meeting.upsert({
              where: { externalId: graphId },
              update: {},  // no-op on duplicate
              create: { externalId: graphId, ...meetingData },
            });
            if (result.createdAt.getTime() >= new Date(Date.now() - 5000).getTime()) {
              synced++;
            }
          } else {
            // Fallback dedup by title + date
            const startOfDay = new Date(dateOnly);
            const endOfDay = new Date(dateOnly); endOfDay.setUTCHours(23, 59, 59, 999);
            const existing = await db.meeting.findFirst({
              where: { title: ev.subject, date: { gte: startOfDay, lte: endOfDay } },
            });
            if (existing) continue;

            await db.meeting.create({ data: meetingData });
            synced++;
          }
        } catch (err) {
          errors.push(`Failed to sync event "${ev.subject}": ${err}`);
        }
      }

      return { synced, errors };
    },
  });
}
