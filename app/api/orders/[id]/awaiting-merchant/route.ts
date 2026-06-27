import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await requireRole(['admin', 'data_entry']);
  if (authSession instanceof NextResponse) return authSession;

  const { id: orderId } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status === OrderStatus.submitted) {
      return NextResponse.json(
        { error: 'Submitted orders cannot be marked awaiting merchant reply' },
        { status: 409 }
      );
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.awaiting_merchant, reviewedBy: authSession.email },
      }),
      prisma.actionLog.create({
        data: {
          actor: authSession.email,
          action: 'order.awaiting_merchant',
          entity: 'order',
          entityId: orderId,
          meta: { previousStatus: order.status },
        },
      }),
    ]);

    return NextResponse.json({ success: true, status: OrderStatus.awaiting_merchant });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to mark order awaiting merchant reply',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
