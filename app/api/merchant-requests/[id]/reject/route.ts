import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { rejectRequest } from '@/lib/wp-client';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission('merchants');
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const numId = Number(id);
  if (!numId || numId < 1) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const result = await rejectRequest(numId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg.includes('409') || msg.includes('not pending') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
