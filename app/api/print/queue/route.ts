import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/print/queue → submitted orders still pending print, grouped by merchant.
// Mirrors /api/review/queue but for OrderStatus.submitted && printQueueRemovedAt IS NULL.
// With ?merchantId=<local Merchant.id> → flat list of that merchant's pending-print orders.
export async function GET(req: NextRequest) {
  const session = await requireRole(['admin', 'pickup', 'data_entry']);
  if (session instanceof NextResponse) return session;

  const merchantId = req.nextUrl.searchParams.get('merchantId')?.trim() || '';

  try {
    const orders = await prisma.order.findMany({
      where: {
        status: OrderStatus.submitted,
        printQueueRemovedAt: null,
        ...(merchantId ? { session: { merchantId } } : {}),
      },
      include: { session: { include: { merchant: true } } },
      orderBy: { submittedAt: 'desc' },
    });

    if (merchantId) {
      return NextResponse.json({
        success: true,
        merchant: orders[0]?.session.merchant.name || '',
        orders: orders.map((order) => ({
          orderId: order.id,
          shipmentId: order.shipmentId,
          submittedAt: order.submittedAt,
          merchant: order.session.merchant.name,
          correctedFields: order.correctedFields,
        })),
      });
    }

    const byMerchant = new Map<
      string,
      { id: string; wpUserId: number; merchantId: string; name: string; orders: typeof orders }
    >();

    for (const order of orders) {
      const merchant = order.session.merchant;
      const key = merchant.id;
      if (!byMerchant.has(key)) {
        byMerchant.set(key, {
          id: merchant.id,
          wpUserId: merchant.wpUserId,
          merchantId: merchant.merchantId,
          name: merchant.name,
          orders: [],
        });
      }
      byMerchant.get(key)!.orders.push(order);
    }

    const merchants = Array.from(byMerchant.values()).map((m) => ({
      id: m.id,
      wpUserId: m.wpUserId,
      merchantId: m.merchantId,
      name: m.name,
      orderCount: m.orders.length,
    }));

    return NextResponse.json({ success: true, merchants });
  } catch (error) {
    return NextResponse.json(
      { error: 'تعذّر تحميل قائمة الطباعة', details: error },
      { status: 500 }
    );
  }
}

// POST /api/print/queue → dismiss one or more orders from the print queue.
// Non-destructive: sets printQueueRemovedAt; never deletes the order.
// Body: { orderIds: string[] }
export async function POST(req: NextRequest) {
  const session = await requireRole(['admin', 'pickup', 'data_entry']);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const orderIds: unknown = body?.orderIds;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'orderIds مطلوب' }, { status: 400 });
    }

    const safeIds = orderIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (safeIds.length === 0) {
      return NextResponse.json({ error: 'orderIds غير صالح' }, { status: 400 });
    }

    const now = new Date();
    const result = await prisma.order.updateMany({
      where: {
        id: { in: safeIds },
        status: OrderStatus.submitted,
        printQueueRemovedAt: null,
      },
      data: { printQueueRemovedAt: now },
    });

    await prisma.actionLog.create({
      data: {
        actor: session.email,
        action: 'order.print_queue_remove',
        entity: 'order',
        entityId: safeIds.join(','),
        meta: { count: result.count, orderIds: safeIds },
      },
    });

    return NextResponse.json({ success: true, removed: result.count });
  } catch (error) {
    return NextResponse.json(
      { error: 'تعذّر تحديث قائمة الطباعة', details: error },
      { status: 500 }
    );
  }
}
