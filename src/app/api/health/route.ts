import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const version = "0.2.0";

  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "connected", version },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { status: "error", db: "disconnected", version },
      { status: 503 },
    );
  }
}
