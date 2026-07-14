import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth';
import { getDriverOrders } from '@/lib/wp-client';

export async function GET() {
  const session = await requireRole(['admin', 'data_entry', 'driver']);
  if (session instanceof NextResponse) return session;

  try {
    const orders = await getDriverOrders(
      session.role === 'driver' ? session.wpUserId : undefined
    );
    return NextResponse.json({ orders });
  } catch (error) {
    console.error('driver orders load failed', error);
    return NextResponse.json({ error: 'تعذّر تحميل قائمة الطلبات' }, { status: 500 });
  }
}
