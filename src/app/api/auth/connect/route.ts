import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/integrations/microsoft-graph';

// GET /api/auth/connect — redirect user to Microsoft login
export async function GET() {
  const url = getAuthUrl('outlook_connect');
  return NextResponse.redirect(url);
}
