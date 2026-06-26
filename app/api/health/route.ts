import { NextResponse } from 'next/server';

// Simple health check (DB connectivity check will be added once Prisma is wired)
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'iDeliver Intake PWA',
    timestamp: new Date().toISOString(),
    db: 'pending', // Will become 'connected' after Prisma client is integrated
  });
}
