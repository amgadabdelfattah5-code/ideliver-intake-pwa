import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
import { storePhoto } from '@/lib/photo-storage';
import { prisma } from '@/lib/prisma';

interface UploadedPhoto {
  bytes: Buffer;
  contentType: string;
}

function getBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] || match?.[2] || null;
}

async function readPhoto(req: NextRequest): Promise<UploadedPhoto> {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await req.json();
    const dataUrl = String(body.photoDataUrl || '');
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      throw new Error('صيغة الصورة غير صحيحة');
    }

    return {
      bytes: Buffer.from(match[2], 'base64'),
      contentType: match[1],
    };
  }

  if (!contentType.includes('multipart/form-data')) {
    throw new Error('صيغة رفع الصورة غير مدعومة');
  }

  const boundary = getBoundary(contentType);
  if (!boundary) {
    throw new Error('بيانات رفع الصورة غير مكتملة');
  }

  const body = Buffer.from(await req.arrayBuffer());
  const marker = Buffer.from(`--${boundary}`);
  let cursor = body.indexOf(marker);

  while (cursor !== -1) {
    const next = body.indexOf(marker, cursor + marker.length);
    if (next === -1) break;

    const part = body.subarray(cursor + marker.length, next);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));

    if (headerEnd !== -1) {
      const headerText = part.subarray(0, headerEnd).toString('utf8');

      if (/name="photo"/i.test(headerText)) {
        const typeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
        const dataStart = headerEnd + 4;
        const dataEnd = part.subarray(dataStart).lastIndexOf(Buffer.from('\r\n'));
        const bytes = part.subarray(
          dataStart,
          dataEnd >= 0 ? dataStart + dataEnd : part.length
        );

        if (bytes.length === 0) {
          throw new Error('ملف الصورة فارغ');
        }

        return {
          bytes,
          contentType: typeMatch?.[1]?.trim() || 'application/octet-stream',
        };
      }
    }

    cursor = next;
  }

  throw new Error('ملف الصورة مطلوب');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(['admin', 'pickup']);
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  let photo: UploadedPhoto;
  try {
    photo = await readPhoto(req);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  try {
    const updatedSession = await prisma.session.update({
      where: { id },
      data: {
        photoCount: { increment: 1 },
      },
      select: { photoCount: true },
    });

    const newOrder = await prisma.order.create({
      data: {
        sessionId: id,
        sequence: updatedSession.photoCount,
        photoUrl: '',
        status: OrderStatus.captured,
      },
    });
    const storedPhoto = await storePhoto({
      orderId: newOrder.id,
      bytes: photo.bytes,
      contentType: photo.contentType,
    });
    const orderWithPhoto = await prisma.order.update({
      where: { id: newOrder.id },
      data: { photoUrl: storedPhoto.photoUrl },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: orderWithPhoto.id,
        sequence: orderWithPhoto.sequence,
        photoUrl: orderWithPhoto.photoUrl,
        status: orderWithPhoto.status,
      },
      sessionPhotoCount: updatedSession.photoCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'فشل حفظ الصورة',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
