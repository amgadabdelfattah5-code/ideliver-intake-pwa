import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
import { deleteStoredPhoto } from '@/lib/photo-storage';
import { prisma } from '@/lib/prisma';

// DELETE /api/orders/:id → hard-delete a single unsubmitted order/photo.
// Submitted orders are rejected. Returns remainingInSession (non-submitted) so the
// frontend can decide whether to advance to the next photo or return to the queue.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await requireRole(['admin', 'pickup', 'data_entry']);
  if (authSession instanceof NextResponse) return authSession;

  const { id: orderId } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, sessionId: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
    }

    if (order.status === OrderStatus.submitted) {
      return NextResponse.json(
        { error: 'لا يمكن حذف طلب تم إرساله.' },
        { status: 409 }
      );
    }

    await prisma.$transaction([
      prisma.correction.deleteMany({ where: { orderId } }),
      prisma.extraction.deleteMany({ where: { orderId } }),
      prisma.order.delete({ where: { id: orderId } }),
      prisma.actionLog.create({
        data: {
          actor: authSession.email,
          action: 'order.photo_delete',
          entity: 'order',
          entityId: orderId,
          meta: { sessionId: order.sessionId },
        },
      }),
    ]);

    await deleteStoredPhoto(orderId);

    const remaining = await prisma.order.count({
      where: {
        sessionId: order.sessionId,
        status: { notIn: [OrderStatus.submitted, OrderStatus.awaiting_merchant] },
      },
    });

    return NextResponse.json({ success: true, remainingInSession: remaining });
  } catch (error) {
    return NextResponse.json(
      { error: 'فشل حذف الصورة', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
