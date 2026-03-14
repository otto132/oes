import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { exchangeCodeForTokens, getGraphUser } from '@/lib/integrations/microsoft-graph';
import { encrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    logger.error('OAuth error', { error, description: req.nextUrl.searchParams.get('error_description') });
    return NextResponse.redirect(new URL('/settings?error=auth_failed', req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', req.url));
  }

  // CSRF prevention: validate state parameter
  const state = req.nextUrl.searchParams.get('state');
  if (state !== 'outlook_connect') {
    return NextResponse.redirect(new URL('/settings?error=invalid_state', req.url));
  }

  // Require active session
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login?callbackUrl=/settings', req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getGraphUser(tokens.access_token);

    await db.integrationToken.upsert({
      where: { provider_userId: { provider: 'microsoft', userId: session.user.id } },
      update: {
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        userEmail: profile.mail,
      },
      create: {
        provider: 'microsoft',
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        userEmail: profile.mail,
        userId: session.user.id,
      },
    });

    auditLog({
      userId: session.user.id,
      action: AUDIT_ACTIONS.INTEGRATION_CONNECTED,
      entityType: 'IntegrationToken',
      entityId: 'microsoft',
      metadata: { provider: 'microsoft' },
    });

    logger.info('Microsoft Graph connected', { userId: session.user.id, email: profile.mail });
    return NextResponse.redirect(new URL('/settings?connected=microsoft', req.url));
  } catch (err) {
    logger.error('OAuth token exchange failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.redirect(new URL('/settings?error=token_exchange', req.url));
  }
}
