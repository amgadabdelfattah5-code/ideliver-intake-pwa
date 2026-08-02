import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { fetchSettlementExport } from '@/lib/wp-client';

export async function GET(req: NextRequest) {
  const session = await requirePermission('settlement');
  if (session instanceof NextResponse) return session;
  const merchantId = Number(req.nextUrl.searchParams.get('merchant_id'));
  const type = (req.nextUrl.searchParams.get('type') ?? 'main') as 'main' | 'review';
  if (!merchantId) return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  try {
    const upstream = await fetchSettlementExport(merchantId, type);
    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
        'Content-Disposition': upstream.headers.get('Content-Disposition') ?? 'attachment',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
