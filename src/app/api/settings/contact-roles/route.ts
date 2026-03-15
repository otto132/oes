import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorized, forbidden, zodError, conflict } from '@/lib/api-errors';
import { createContactRoleSchema, updateContactRoleSchema } from '@/lib/schemas/contact-roles';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const roles = await db.contactRoleOption.findMany({
    orderBy: [{ isArchived: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
  });

  return NextResponse.json({ data: roles });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if ((session.user as { role?: string }).role !== 'ADMIN') return forbidden();

  const raw = await req.json();
  const parsed = createContactRoleSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const role = await db.contactRoleOption.create({
      data: parsed.data,
    });
    return NextResponse.json({ data: role }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return conflict('A role with that label already exists');
    }
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if ((session.user as { role?: string }).role !== 'ADMIN') return forbidden();

  const raw = await req.json();
  const parsed = updateContactRoleSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { id, ...data } = parsed.data;

  try {
    const role = await db.contactRoleOption.update({
      where: { id },
      data,
    });
    return NextResponse.json({ data: role });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return conflict('A role with that label already exists');
    }
    if (err?.code === 'P2025') {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Role not found' } }, { status: 404 });
    }
    throw err;
  }
}
