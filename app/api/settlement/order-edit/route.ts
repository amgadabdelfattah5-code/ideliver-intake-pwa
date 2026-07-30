import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { postSettlementOrderEdit } from '@/lib/wp-client';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await requireRole(['admin']);
  if (session instanceof NextResponse) return session;
  const body = await req.json();
  try {
    const result = await postSettlementOrderEdit(body);
    await prisma.actionLog.create({ data: {
      actor:    session.email,
      action:   'settlement.order_edit',
      entity:   'order',
      entityId: String(body.order_id),
      meta:     { orderId: body.order_id, merchantId: body.merchant_id },
    }});
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
