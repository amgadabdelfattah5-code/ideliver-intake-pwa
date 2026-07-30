import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getSettlementPayouts } from '@/lib/wp-client';

export async function GET(req: NextRequest) {
  const session = await requireRole(['admin']);
  if (session instanceof NextResponse) return session;
  const merchantId = Number(req.nextUrl.searchParams.get('merchant_id'));
  if (!merchantId) return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  try {
    return NextResponse.json(await getSettlementPayouts(merchantId));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
