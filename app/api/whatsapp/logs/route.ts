import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getWALogs } from '@/lib/wp-client';

export async function GET(req: Request) {
  const auth = await requirePermission('whatsapp');
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  const data = await getWALogs({
    limit: Number(searchParams.get('limit') ?? 50),
    offset: Number(searchParams.get('offset') ?? 0),
    status: searchParams.get('status') ?? undefined,
  });
  return NextResponse.json(data);
}
