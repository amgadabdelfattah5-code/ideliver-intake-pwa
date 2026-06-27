import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth';
import { readStoredPhoto } from '@/lib/photo-storage';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, photoUrl: true },
  });

  if (!order) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  if (order.photoUrl.startsWith('data:')) {
    const match = order.photoUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Photo data is invalid' }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(Buffer.from(match[2], 'base64')), {
      headers: {
        'Content-Type': match[1],
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  const photo = await readStoredPhoto(order.id);
  if (!photo) {
    return NextResponse.json({ error: 'Stored photo file not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
