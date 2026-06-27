import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { runSessionExtraction } from '@/lib/extraction-provider';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@prisma/client';

// POST /api/sessions/:id/send → status awaiting_extraction; enqueue + trigger Hermes
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(['admin', 'pickup']);
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  try {
    const updatedSession = await prisma.session.update({
      where: { id },
      data: {
        status: SessionStatus.awaiting_extraction,
        sentAt: new Date(),
      },
      include: {
        orders: {
          select: { id: true, sequence: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (updatedSession.orders.length === 0) {
      return NextResponse.json({ error: 'لا يمكن إرسال جلسة بدون صور' }, { status: 400 });
    }

    await prisma.actionLog.create({
      data: {
        actor: session.email,
        action: 'session.send',
        entity: 'session',
        entityId: id,
        meta: { orderCount: updatedSession.orders.length },
      },
    });

    const extraction = await runSessionExtraction(id);

    return NextResponse.json({
      success: true,
      session: {
        id: updatedSession.id,
        status: SessionStatus.ready_for_review,
        photoCount: updatedSession.photoCount,
        sentAt: updatedSession.sentAt,
      },
      orderCount: updatedSession.orders.length,
      extraction: {
        provider: extraction.provider,
        ordersProcessed: extraction.ordersProcessed,
      },
    });
  } catch (error) {
    await prisma.actionLog.create({
      data: {
        actor: session.email,
        action: 'session.extraction_failed',
        entity: 'session',
        entityId: id,
        meta: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
    }).catch(() => undefined);

    return NextResponse.json(
      {
        error: 'فشل إرسال الجلسة لاستخراج البيانات',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
