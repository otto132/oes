import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getGraphUser } from '@/lib/integrations/microsoft-graph';
import { db } from '@/lib/db';

// This route handles the Microsoft OAuth callback after user grants permissions.
// URL: /api/auth/callback?code=xxx&state=xxx

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

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user profile to identify who connected
    const profile = await getGraphUser(tokens.access_token);

    // Store tokens using Prisma model
    await db.integrationToken.upsert({
      where: { provider_userEmail: { provider: 'microsoft', userEmail: profile.mail } },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      create: {
        provider: 'microsoft',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        userEmail: profile.mail,
      },
    });

    console.log(`✓ Microsoft Graph connected for ${profile.mail}`);
    return NextResponse.redirect(new URL('/settings?connected=microsoft', req.url));
  } catch (err) {
    console.error('OAuth token exchange failed:', err);
    return NextResponse.redirect(new URL('/settings?error=token_exchange', req.url));
  }
}
