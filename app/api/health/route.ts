import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'ok',
      app: 'iDeliver Intake PWA',
      timestamp: new Date().toISOString(),
      db: 'connected',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        app: 'iDeliver Intake PWA',
        timestamp: new Date().toISOString(),
        db: 'unavailable',
        error: error instanceof Error ? error.message : 'Unknown database error',
      },
      { status: 503 }
    );
  }
}
