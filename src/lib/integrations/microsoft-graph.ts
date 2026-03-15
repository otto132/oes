// ═══════════════════════════════════════════════════════════════
// Microsoft Graph Integration
// ═══════════════════════════════════════════════════════════════
// Handles OAuth2 flow, email sync, and calendar sync.
//
// Setup:
//   1. Register app at https://entra.microsoft.com/#blade/Microsoft_AAD_RegisteredApps
//   2. Set redirect URI to http://localhost:3000/api/auth/callback (dev)
//   3. Add API permissions: Mail.Read, Calendars.Read, User.Read
//   4. Create client secret
//   5. Copy values to .env
//
// Flow:
//   User clicks "Connect Outlook" →
//   Redirected to Microsoft login →
//   Callback saves tokens →
//   Sync job runs on schedule

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';

export const GRAPH_CONFIG = {
  clientId: process.env.MICROSOFT_CLIENT_ID || '',
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
  redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
  scopes: ['openid', 'profile', 'email', 'Mail.Read', 'Mail.Send', 'Calendars.Read', 'User.Read', 'offline_access'],
};

// ── Auth URLs ────────────────────────────────────

export function getAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GRAPH_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: GRAPH_CONFIG.redirectUri,
    scope: GRAPH_CONFIG.scopes.join(' '),
    response_mode: 'query',
    ...(state ? { state } : {}),
  });
  return `${AUTH_BASE}/authorize?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GRAPH_CONFIG.clientId,
      client_secret: GRAPH_CONFIG.clientSecret,
      code,
      redirect_uri: GRAPH_CONFIG.redirectUri,
      grant_type: 'authorization_code',
      scope: GRAPH_CONFIG.scopes.join(' '),
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GRAPH_CONFIG.clientId,
      client_secret: GRAPH_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: GRAPH_CONFIG.scopes.join(' '),
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json();
}

// ── Graph API Helpers ────────────────────────────

async function graphGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Graph API ${path}: ${res.status}`);
  return res.json();
}

// ── Email Sync ───────────────────────────────────

export interface GraphEmail {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  receivedDateTime: string;
  bodyPreview: string;
  isRead: boolean;
}

export async function fetchRecentEmails(accessToken: string, since?: Date): Promise<GraphEmail[]> {
  const filter = since
    ? `&$filter=receivedDateTime ge ${since.toISOString()}`
    : '';
  const data = await graphGet(
    `/me/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview,isRead${filter}`,
    accessToken
  );
  return data.value || [];
}

// ── Calendar Sync ────────────────────────────────

export interface GraphEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: { emailAddress: { name: string; address: string }; type: string }[];
  isAllDay: boolean;
}

export async function fetchUpcomingEvents(accessToken: string, days: number = 7): Promise<GraphEvent[]> {
  const start = new Date().toISOString();
  const end = new Date(Date.now() + days * 864e5).toISOString();
  const data = await graphGet(
    `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=50&$orderby=start/dateTime&$select=id,subject,start,end,attendees,isAllDay`,
    accessToken
  );
  return data.value || [];
}

// ── User Profile ─────────────────────────────────

export async function getGraphUser(accessToken: string): Promise<{ displayName: string; mail: string }> {
  return graphGet('/me?$select=displayName,mail', accessToken);
}

// ── Send Mail ─────────────────────────────────────

export async function sendMail(
  accessToken: string,
  to: string[],
  subject: string,
  bodyHtml: string,
): Promise<void> {
  const message = {
    subject,
    body: { contentType: 'HTML', content: bodyHtml },
    toRecipients: to.map((email) => ({ emailAddress: { address: email } })),
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (res.status === 401) {
    throw new Error('TOKEN_EXPIRED');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed: ${res.status} ${text}`);
  }
}
