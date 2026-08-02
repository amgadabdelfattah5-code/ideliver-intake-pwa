import { NextRequest, NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth';
import { getLiquidShipBase } from '@/lib/wp-client';

export async function GET(req: NextRequest) {
  const session = await requirePermission('orders');
  if (session instanceof NextResponse) return session;

  const page = req.nextUrl.searchParams.get('page') || '1';
  const auth = Buffer.from(
    `${process.env.WP_APP_USER || 'amged.mohammed@gmail.com'}:${process.env.WP_APP_PASSWORD || ''}`
  ).toString('base64');

  const res = await fetch(
    `${getLiquidShipBase()}/admin-orders?page=${encodeURIComponent(page)}&per_page=50`,
    { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' }
  );
  if (!res.ok) {
    return NextResponse.json({ error: 'تعذّر تحميل الطلبات' }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
