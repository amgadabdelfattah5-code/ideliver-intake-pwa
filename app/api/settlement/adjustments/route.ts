import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getSettlementAdjustments } from '@/lib/wp-client';

export async function GET(req: NextRequest) {
  const session = await requirePermission('settlement');
  if (session instanceof NextResponse) return session;
  const merchantId = Number(req.nextUrl.searchParams.get('merchant_id'));
  const claimed = req.nextUrl.searchParams.get('claimed') === '1';
  if (!merchantId) return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  try {
    return NextResponse.json(await getSettlementAdjustments(merchantId, claimed));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
