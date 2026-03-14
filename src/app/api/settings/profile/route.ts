import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { resolveTenantDb } from '@/lib/tenant';
import { unauthorized, zodError } from '@/lib/api-errors';

const DEFAULT_PREFS = { emailAlerts: true, queueAlerts: true };

const profileSelect = {
  id: true,
  name: true,
  email: true,
  initials: true,
  role: true,
  notificationPrefs: true,
  lastLoginAt: true,
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: profileSelect,
  });

  if (!user) return unauthorized();

  return NextResponse.json({
    data: {
      ...user,
      notificationPrefs: (user.notificationPrefs as Record<string, boolean>) ?? DEFAULT_PREFS,
    },
  });
}

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  initials: z.string().min(1).max(3).optional(),
  notificationPrefs: z
    .object({
      emailAlerts: z.boolean(),
      queueAlerts: z.boolean(),
    })
    .optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const raw = await req.json();
  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: profileSelect,
  });

  return NextResponse.json({
    data: {
      ...updated,
      notificationPrefs: (updated.notificationPrefs as Record<string, boolean>) ?? DEFAULT_PREFS,
    },
  });
}
