import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/auth';
import { updateOrderStatus } from '@/lib/wp-client';

const ALLOWED = ['delivered', 'returned-full', 'returned-partial', 'failed'];

export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(['settlement']);
  if (session instanceof NextResponse) return session;

  const { order_id, status } = await req.json() as { order_id: number; status: string };
  if (!order_id || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  try {
    await updateOrderStatus(order_id, status);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'خطأ' }, { status: 500 });
  }
}
