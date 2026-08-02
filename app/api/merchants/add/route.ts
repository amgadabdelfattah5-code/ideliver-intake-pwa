import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { addMerchantDirect } from '@/lib/wp-client';

export async function POST(req: Request) {
  const auth = await requireRole(['admin']);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  try {
    const result = await addMerchantDirect(body);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg.includes('409') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
