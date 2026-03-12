// ═══════════════════════════════════════════════════════════════
// Calendar Sync Service
// ═══════════════════════════════════════════════════════════════
// Fetches calendar events from Microsoft Graph, matches attendees
// to contacts/accounts, and stores in meetings table.

import { db } from '@/lib/db';
import { fetchUpcomingEvents, refreshAccessToken, type GraphEvent } from './microsoft-graph';

// Match attendee email to a contact → account
async function matchAttendeeToAccount(email: string): Promise<{ accountId: string; accountName: string } | null> {
  const contact = await db.contact.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { account: { select: { id: true, name: true } } },
  });
  if (contact) return { accountId: contact.account.id, accountName: contact.account.name };
  return null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(start: string, end: string): string {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export async function syncCalendar(): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];

  // Get stored tokens
  const tokenRow = await db.integrationToken.findFirst({ where: { provider: 'microsoft' } });
  if (!tokenRow) return { synced: 0, errors: ['No Microsoft token — connect Outlook first'] };

  // Refresh if expired
  let accessToken = tokenRow.accessToken;
  if (tokenRow.expiresAt < new Date()) {
    try {
      const refreshed = await refreshAccessToken(tokenRow.refreshToken);
      accessToken = refreshed.access_token;
      await db.integrationToken.update({
        where: { id: tokenRow.id },
        data: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        },
      });
    } catch {
      return { synced: 0, errors: ['Token refresh failed — reconnect Outlook'] };
    }
  }

  // Fetch next 14 days of events
  let events: GraphEvent[];
  try {
    events = await fetchUpcomingEvents(accessToken, 14);
  } catch (err) {
    return { synced: 0, errors: [`Graph API error: ${err}`] };
  }

  let synced = 0;

  for (const ev of events) {
    try {
      if (ev.isAllDay) continue; // Skip all-day events

      // Dedup by subject + date
      const evDate = new Date(ev.start.dateTime);
      const startOfDay = new Date(evDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(evDate); endOfDay.setHours(23, 59, 59, 999);

      const existing = await db.meeting.findFirst({
        where: { title: ev.subject, date: { gte: startOfDay, lte: endOfDay } },
      });
      if (existing) continue;

      // Match attendees to accounts
      const externalAttendees = ev.attendees.filter(a => a.type !== 'organizer');
      const attendeeNames = externalAttendees.map(a => a.emailAddress.name);
      let accountMatch: { accountId: string; accountName: string } | null = null;

      for (const att of externalAttendees) {
        const match = await matchAttendeeToAccount(att.emailAddress.address);
        if (match) { accountMatch = match; break; }
      }

      await db.meeting.create({
        data: {
          title: ev.subject,
          startTime: formatTime(ev.start.dateTime),
          duration: formatDuration(ev.start.dateTime, ev.end.dateTime),
          date: new Date(ev.start.dateTime),
          attendees: attendeeNames,
          prepStatus: 'draft',
          accountId: accountMatch?.accountId || null,
          accountName: accountMatch?.accountName || null,
        },
      });
      synced++;
    } catch (err) {
      errors.push(`Failed to sync event "${ev.subject}": ${err}`);
    }
  }

  return { synced, errors };
}
