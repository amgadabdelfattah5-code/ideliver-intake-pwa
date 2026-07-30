import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { postSettlementAdjustment } from '@/lib/wp-client';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await requireRole(['admin']);
  if (session instanceof NextResponse) return session;
  const body = await req.json();
  try {
    const result = await postSettlementAdjustment(body);
    await prisma.actionLog.create({ data: {
      actor:    session.email,
      action:   'settlement.adjustment',
      entity:   'settlement',
      entityId: String(body.merchant_id),
      meta:     { op: body.op, merchantId: body.merchant_id, amount: body.amount, reason: body.reason },
    }});
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
