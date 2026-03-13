# Personal Data Inventory

> Last updated: 2026-03-13

This document inventories all personally identifiable information (PII), security credentials, and business-sensitive data stored by Eco-Insight Revenue OS. It is structured to support future GDPR compliance work.

## Data Inventory

| Model | Field | Type | Purpose | Source |
|-------|-------|------|---------|--------|
| User | name | String | Display name for team member | user-input |
| User | email | String | Login identity, unique identifier | user-input |
| User | initials | String | Avatar fallback display | derived |
| Contact | name | String | Contact person at customer account | user-input |
| Contact | title | String | Job title | user-input |
| Contact | email | String | Business email for outreach | user-input |
| Contact | phone | String? | Phone number | user-input |
| Contact | linkedinUrl | String? | LinkedIn profile URL | user-input |
| InboxEmail | fromEmail | String | Sender email address | microsoft-sync |
| InboxEmail | fromName | String | Sender display name | microsoft-sync |
| InboxEmail | subject | String | Email subject line | microsoft-sync |
| InboxEmail | preview | String | First ~200 chars of email body | microsoft-sync |
| InboxEmail | domain | String? | Sender domain for new-domain detection | derived |
| Meeting | attendees | String[] | Names of meeting participants | microsoft-sync |
| Meeting | title | String | Calendar event title | microsoft-sync |
| Meeting | accountName | String? | Denormalized account name | derived |
| IntegrationToken | userEmail | String | Email of user who connected the integration | user-input |
| IntegrationToken | accessToken | String | OAuth access token (sensitive) | microsoft-sync |
| IntegrationToken | refreshToken | String | OAuth refresh token (sensitive) | microsoft-sync |
| Invitation | email | String | Invited user's email address | admin-action |
| Invitation | token | String | Invitation acceptance credential (sensitive) | system-generated |
| Activity | summary | String | Activity description (may reference people) | user-input |
| Activity | detail | String | Free-text notes (may contain PII) | user-input |
| QueueItem | payload | Json | Type-specific data (may contain contact details, outreach text) | ai-generated |
| QueueItem | originalPayload | Json? | Snapshot before edit (may contain PII) | ai-generated |
| QueueItem | accName | String | Denormalized account name | derived |
| QueueItem | reasoning | String | AI reasoning text (may reference people/companies) | ai-generated |
| TaskComment | text | String | Free-text comment (may contain PII) | user-input |
| TaskComment | mentions | String[] | User IDs referenced in comment | user-input |
| AgentConfig | parameters | Json | Agent-specific configuration (content varies) | admin-action |
| Opportunity | winNotes | String? | Notes on won deals (business-sensitive) | user-input |
| Opportunity | lossNotes | String? | Notes on lost deals (business-sensitive) | user-input |
| Opportunity | lossReason | String? | Why the deal was lost (competitive intelligence) | user-input |

**Source values:** `user-input` (entered by team members), `microsoft-sync` (pulled from Graph API), `ai-generated` (created by AI agents), `admin-action` (administrative operations), `derived` (computed from other fields), `system-generated` (created by application logic).

> **Note:** Activity records may also originate from `microsoft-sync` (Outlook Sync, Calendar Sync) depending on the Activity's `source` field — not exclusively `user-input`.

## Data Flow Summary

PII enters the system through four channels:

- **User input** — contacts added manually, notes, task comments, account briefs
- **Microsoft sync** — emails and calendar events pulled via Graph API every 15 minutes
- **AI-generated** — queue items created by agents containing contact/account context and outreach drafts
- **Admin actions** — user invitations with email addresses

## Third-Party Data Flows

| Third Party | Data Sent | Data Received | Storage |
|-------------|-----------|---------------|---------|
| Microsoft Graph API | OAuth tokens (access + refresh) | Emails, calendar events, attendee names | IntegrationToken, InboxEmail, Meeting |
| Vercel | Application code, env vars | — | Standard request logs only (no PII stored) |
| Neon | — | — | All PII resides in Neon-hosted PostgreSQL |

## Sensitive Data Notes

- **OAuth tokens** (`accessToken`, `refreshToken`) stored as plain text in the `IntegrationToken` table. Known risk — see backlog item S-03 for planned encryption.
- **Invitation tokens** stored as plain text in the `Invitation` table.
- **Security headers** configured in `next.config.ts`:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `X-DNS-Prefetch-Control: on`
- **Known gap:** no `Content-Security-Policy` header configured yet.
- No PII is passed in URL parameters.
- `CRON_SECRET` protects the `/api/sync` endpoint from unauthorized invocation.

<!-- TODO before launch with EU customers -->

## Legal Basis per Data Category

| Data Category | Legal Basis | Justification |
|---------------|-------------|---------------|
| Team member data (User) | _TBD_ | _TBD_ |
| Customer contact data (Contact) | _TBD_ | _TBD_ |
| Synced communications (InboxEmail, Meeting) | _TBD_ | _TBD_ |
| AI-generated content (QueueItem) | _TBD_ | _TBD_ |

## Retention Periods

| Data Category | Retention Period | Deletion Trigger |
|---------------|-----------------|------------------|
| _TBD_ | _TBD_ | _TBD_ |

## Data Subject Rights

- **Right of access** — _TBD: procedure for exporting a user's data_
- **Right to erasure** — _TBD: procedure for deleting a user's data across all tables_
- **Right to portability** — _TBD: export format and delivery method_
- **Right to rectification** — _TBD: procedure for correcting inaccurate data_

## Deletion Procedures

_TBD: Document cascade behavior when deleting a User, Contact, or Account. Reference Prisma schema `onDelete` settings._
