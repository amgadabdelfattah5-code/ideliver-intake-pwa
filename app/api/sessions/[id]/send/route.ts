import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@prisma/client';

// POST /api/sessions/:id/send → status awaiting_extraction; enqueue + trigger Hermes
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  try {
    // Update session status
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

    // TODO: Enqueue job and trigger Hermes webhook
    // For slice: stub the Hermes trigger
    console.log('[STUB] Would trigger Hermes for session:', id, 'orders:', updatedSession.orders.length);

    return NextResponse.json({
      success: true,
      session: {
        id: updatedSession.id,
        status: updatedSession.status,
        photoCount: updatedSession.photoCount,
        sentAt: updatedSession.sentAt,
      },
      orderCount: updatedSession.orders.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send session', details: error },
      { status: 500 }
    );
  }
}
