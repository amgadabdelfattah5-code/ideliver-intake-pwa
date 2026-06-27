import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await requireRole(['admin', 'pickup', 'data_entry']);
  if (session instanceof NextResponse) return session;

  const searchParams = req.nextUrl.searchParams;
  const merchantQuery = searchParams.get('merchant')?.trim() || '';
  const limit = Math.min(Number(searchParams.get('limit') || 30), 100);

  if (!merchantQuery) {
    return NextResponse.json({ error: 'اسم التاجر مطلوب' }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.submitted,
      session: {
        merchant: {
          name: { contains: merchantQuery },
        },
      },
    },
    include: {
      session: {
        include: { merchant: true },
      },
    },
    orderBy: { submittedAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({
    success: true,
    count: orders.length,
    orders: orders.map((order) => ({
      orderId: order.id,
      sessionId: order.sessionId,
      sequence: order.sequence,
      merchant: order.session.merchant.name,
      status: order.status,
      shipmentId: order.shipmentId,
      submittedAt: order.submittedAt,
      reviewedBy: order.reviewedBy,
      correctedFields: order.correctedFields,
    })),
  });
}
