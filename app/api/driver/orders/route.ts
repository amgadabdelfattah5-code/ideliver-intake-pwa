import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth';
import { getDriverOrders } from '@/lib/wp-client';

export async function GET() {
  const session = await requireRole(['admin', 'driver']);
  if (session instanceof NextResponse) return session;

  try {
    const orders = await getDriverOrders(
      session.role === 'driver' ? session.wpUserId : undefined
    );
    return NextResponse.json({ orders });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'تعذّر تحميل قائمة الطلبات',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
