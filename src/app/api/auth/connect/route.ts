import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthUrl } from '@/lib/integrations/microsoft-graph';

// GET /api/auth/connect — redirect user to Microsoft login
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    // Return to connect flow after signing in
    return NextResponse.redirect(new URL('/auth/signin?callbackUrl=/api/auth/connect', process.env.NEXTAUTH_URL || 'http://localhost:3000'));
  }

  const url = getAuthUrl('outlook_connect');
  return NextResponse.redirect(url);
}
