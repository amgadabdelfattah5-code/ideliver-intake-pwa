import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@prisma/client';

// GET /api/review/queue → sessions ready_for_review grouped by merchant with counts
export async function GET() {
  const session = await requireRole(['admin', 'pickup', 'data_entry']);
  if (session instanceof NextResponse) return session;

  try {
    const sessions = await prisma.session.findMany({
      where: { status: SessionStatus.ready_for_review },
      include: {
        merchant: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by merchant
    const byMerchant = new Map<number, typeof sessions>();
    for (const s of sessions) {
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
        orderCount: s._count.orders,
      })),
    }));

    return NextResponse.json({
      success: true,
      merchants,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch queue', details: error },
      { status: 500 }
    );
  }
}
