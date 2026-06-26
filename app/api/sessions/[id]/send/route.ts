import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runStubExtraction } from '@/lib/extraction-stub';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@prisma/client';

// POST /api/sessions/:id/send → status awaiting_extraction; enqueue + trigger Hermes
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
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
      return NextResponse.json({ error: 'Cannot send a session with no photos' }, { status: 400 });
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

    const stubbedOrders = await runStubExtraction(id);

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
        mode: 'stub',
        ordersProcessed: stubbedOrders,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send session', details: error },
      { status: 500 }
    );
  }
}
