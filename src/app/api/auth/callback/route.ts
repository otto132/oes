import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { exchangeCodeForTokens, getGraphUser } from '@/lib/integrations/microsoft-graph';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    console.error('OAuth error:', error, req.nextUrl.searchParams.get('error_description'));
    return NextResponse.redirect(new URL('/settings?error=auth_failed', req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', req.url));
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
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        userEmail: profile.mail,
      },
      create: {
        provider: 'microsoft',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        userEmail: profile.mail,
        userId: session.user.id,
      },
    });

    console.log(`Microsoft Graph connected for user ${session.user.id} (${profile.mail})`);
    return NextResponse.redirect(new URL('/settings?connected=microsoft', req.url));
  } catch (err) {
    console.error('OAuth token exchange failed:', err);
    return NextResponse.redirect(new URL('/settings?error=token_exchange', req.url));
  }
}
