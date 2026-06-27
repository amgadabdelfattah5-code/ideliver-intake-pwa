import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OrderStatus, SessionStatus } from '@prisma/client';

// GET /api/review/queue → sessions ready_for_review grouped by merchant with counts.
// orderCount reflects only orders still pending review (excludes submitted / awaiting_merchant),
// so the queue shrinks as data entry submits each shipment.
export async function GET() {
  const session = await requireRole(['admin', 'pickup', 'data_entry']);
  if (session instanceof NextResponse) return session;

  try {
    const sessions = await prisma.session.findMany({
      where: { status: SessionStatus.ready_for_review },
      include: {
        merchant: true,
        orders: {
          where: {
            status: { notIn: [OrderStatus.submitted, OrderStatus.awaiting_merchant] },
          },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by merchant; drop sessions whose orders are all submitted/awaiting.
    const byMerchant = new Map<number, typeof sessions>();
    for (const s of sessions) {
      if (s.orders.length === 0) continue;
      if (!byMerchant.has(s.merchant.wpUserId)) {
        byMerchant.set(s.merchant.wpUserId, []);
      }
      byMerchant.get(s.merchant.wpUserId)!.push(s);
    }

    const merchants = Array.from(byMerchant.entries()).map(([wpUserId, sess]) => ({
      wpUserId,
      merchantId: sess[0].merchant.merchantId,
      name: sess[0].merchant.name,
      sessions: sess.map((s) => ({
        id: s.id,
        photoCount: s.photoCount,
        createdAt: s.createdAt,
        orderCount: s.orders.length,
      })),
    }));

    return NextResponse.json({
      success: true,
      merchants,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'تعذّر تحميل قائمة المراجعة', details: error },
      { status: 500 }
    );
  }
}
