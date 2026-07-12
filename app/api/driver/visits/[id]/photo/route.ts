import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth';
import { readStoredPhoto } from '@/lib/photo-storage';
import { prisma } from '@/lib/prisma';

// Mirrors app/api/photos/[id]/route.ts, but looks up DeliveryVisit instead of Order —
// storePhoto() in the visits route is keyed by DeliveryVisit.id, not Order.id, so the
// generic /api/photos/:id route (which only queries Order) 404s on these in file mode.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const visit = await prisma.deliveryVisit.findUnique({
    where: { id },
    select: { id: true, photoUrl: true },
  });

  if (!visit || !visit.photoUrl) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  if (visit.photoUrl.startsWith('data:')) {
    const match = visit.photoUrl.match(/^data:([^;]+);base64,(.+)$/);
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

  const photo = await readStoredPhoto(visit.id);
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
