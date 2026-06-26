import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OrderStatus, SessionStatus } from '@prisma/client';

// POST /api/sessions/:id/photos (multipart) → store photo, increment photoCount
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  try {
    const formData = await req.formData();
    const file = formData.get('photo') as File;

    if (!file) {
      return NextResponse.json({ error: 'photo file required' }, { status: 400 });
    }

    // For slice: store photo in a local volume or object storage (TODO)
    // For now, store as base64 data URL (inefficient but works for slice)
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const photoUrl = `data:${file.type};base64,${base64}`;

    // Increment photoCount
    const updatedSession = await prisma.session.update({
      where: { id },
      data: {
        photoCount: { increment: 1 },
      },
      select: { photoCount: true },
    });

    // Create an Order record for this photo
    const newOrder = await prisma.order.create({
      data: {
        sessionId: id,
        sequence: updatedSession.photoCount, // 1-based sequence
        photoUrl,
        status: OrderStatus.captured,
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: newOrder.id,
        sequence: newOrder.sequence,
        photoUrl,
        status: newOrder.status,
      },
      sessionPhotoCount: updatedSession.photoCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to store photo', details: error },
      { status: 500 }
    );
  }
}
