import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
import { deleteStoredPhoto } from '@/lib/photo-storage';
import { prisma } from '@/lib/prisma';

// DELETE /api/sessions/:id → cancel a session and hard-delete its unsubmitted orders/photos.
// Sessions containing any submitted order are rejected so submitted shipments are never orphaned.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await requireRole(['admin', 'pickup', 'data_entry']);
  if (authSession instanceof NextResponse) return authSession;

  const { id } = await params;

  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        merchant: { select: { name: true } },
        orders: { select: { id: true, status: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 });
    }

    if (session.orders.some((order) => order.status === OrderStatus.submitted)) {
      return NextResponse.json(
        { error: 'لا يمكن إلغاء جلسة تحتوي على طلبات تم إرسالها.' },
        { status: 409 }
      );
    }

    const orderIds = session.orders.map((order) => order.id);

    // No onDelete cascade in schema → delete children before parents, in order.
    await prisma.$transaction([
      prisma.correction.deleteMany({ where: { orderId: { in: orderIds } } }),
      prisma.extraction.deleteMany({ where: { orderId: { in: orderIds } } }),
      prisma.order.deleteMany({ where: { sessionId: id } }),
      prisma.session.delete({ where: { id } }),
      prisma.actionLog.create({
        data: {
          actor: authSession.email,
          action: 'session.cancel',
          entity: 'session',
          entityId: id,
          meta: { orderCount: orderIds.length, merchantName: session.merchant.name },
        },
      }),
    ]);

    // Best-effort photo cleanup after the DB commit.
    await Promise.all(orderIds.map((orderId) => deleteStoredPhoto(orderId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'فشل إلغاء الجلسة', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
