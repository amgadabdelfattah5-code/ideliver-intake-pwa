import { NextRequest, NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth';
import { storePhoto } from '@/lib/photo-storage';
import { prisma } from '@/lib/prisma';
import { getDriverOrders, submitDeliveryVisit } from '@/lib/wp-client';

const allowedStatuses = [
  'shipment-rec',
  'shipped',
  'delivered',
  'on-hold',
  'postponed',
  'cancelled',
  'refunded',
  'failed',
];

const allowedReasons = [
  'delivered',
  'customer_unavailable',
  'refused',
  'wrong_address',
  'postponed',
];

interface VisitPhoto {
  bytes: Buffer;
  contentType: string;
}

function parsePhoto(dataUrl: unknown): VisitPhoto | null {
  if (dataUrl == null) return null;
  if (typeof dataUrl !== 'string') {
    throw new Error('صيغة الصورة غير صحيحة');
  }

  const match = dataUrl.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
  );
  if (!match) {
    throw new Error('يجب أن تكون الصورة بصيغة JPEG أو PNG أو WebP');
  }

  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
    throw new Error('حجم الصورة أكبر من 8 ميجابايت');
  }

  return { bytes, contentType: `image/${match[1]}` };
}

export async function POST(req: NextRequest) {
  const session = await requireRole(['admin', 'driver']);
  if (session instanceof NextResponse) return session;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'بيانات الطلب غير صحيحة' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صحيحة' }, { status: 400 });
  }

  const orderId = Number(body.orderId);
  const status = typeof body.status === 'string' ? body.status : '';
  const reasonCode = typeof body.reasonCode === 'string' ? body.reasonCode : '';
  const note = body.note == null ? undefined : body.note;

  if (
    !Number.isInteger(orderId) ||
    orderId <= 0 ||
    !allowedStatuses.includes(status) ||
    !allowedReasons.includes(reasonCode) ||
    (note !== undefined && typeof note !== 'string') ||
    (typeof note === 'string' && note.length > 2000)
  ) {
    return NextResponse.json({ error: 'بيانات الطلب غير صحيحة' }, { status: 400 });
  }

  let photo: VisitPhoto | null;
  try {
    photo = parsePhoto(body.photoDataUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  try {
    if (session.role === 'driver') {
      const assignedOrders = await getDriverOrders(session.wpUserId);
      if (!assignedOrders.some((order) => order.orderId === orderId)) {
        return NextResponse.json(
          { error: 'هذا الطلب غير مُسند إليك' },
          { status: 403 }
        );
      }
    }

    let visit = await prisma.deliveryVisit.create({
      data: {
        shipmentId: String(orderId),
        driverId: session.wpUserId,
        driverName: session.username,
        status,
        reasonCode,
        note,
      },
    });

    if (photo) {
      const storedPhoto = await storePhoto({
        orderId: visit.id,
        bytes: photo.bytes,
        contentType: photo.contentType,
      });
      visit = await prisma.deliveryVisit.update({
        where: { id: visit.id },
        data: { photoUrl: storedPhoto.photoUrl },
      });
    }

    await prisma.actionLog.create({
      data: {
        action: 'order.driver_visit',
        entity: 'order',
        entityId: String(orderId),
        actor: session.email,
        meta: {
          visitId: visit.id,
          driverId: session.wpUserId,
          status,
          reasonCode,
          note,
          hasPhoto: photo !== null,
        },
      },
    });

    let synced = false;
    try {
      await submitDeliveryVisit({
        orderId,
        driverId: session.wpUserId,
        status,
        reasonCode,
        note,
        photoDataUrl:
          typeof body.photoDataUrl === 'string' ? body.photoDataUrl : undefined,
      });
      await prisma.deliveryVisit.update({
        where: { id: visit.id },
        data: { syncedAt: new Date() },
      });
      synced = true;
    } catch {
      // Local visit and audit rows are the fallback; syncedAt stays null.
    }

    return NextResponse.json({ success: true, synced });
  } catch (error) {
    // Log internally; don't leak Prisma/filesystem error details to the client.
    console.error('driver visit failed', error);
    return NextResponse.json({ error: 'تعذّر تسجيل الزيارة' }, { status: 500 });
  }
}
