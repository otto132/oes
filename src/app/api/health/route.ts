import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      version: '0.2.0',
      dbLatencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1048576),
        heap: Math.round(process.memoryUsage().heapUsed / 1048576),
      },
    });
  } catch {
    return NextResponse.json(
      { status: 'error', db: 'disconnected', version: '0.2.0' },
      { status: 503 },
    );
  }
}

export async function HEAD() {
  try {
    await db.$queryRaw`SELECT 1`;
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
