import { NextRequest, NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth';
import { storePhoto } from '@/lib/photo-storage';
import { prisma } from '@/lib/prisma';
import { getDriverOrders, submitDeliveryVisit } from '@/lib/wp-client';

// Deliberately excludes financial/admin-only statuses (e.g. refunded) — matches the
// WP-side STATUS_MAP in class-liquidship-driver-api.php; keep the two in sync.
const allowedStatuses = [
  'shipment-rec',
  'shipped',
  'delivered',
  'on-hold',
  'postponed',
  'cancelled',
  'failed',
];

const allowedReasons = [
  'delivered',
  'customer_unavailable',
  'refused',
  'wrong_address',
  'postponed',
  'not_provided',
];

interface VisitPhoto {
  bytes: Buffer;
  contentType: string;
}

// Matches decoded bytes against the declared type's magic number — the regex above only
// checks the data-URL label and base64 alphabet, not the actual file content. Mirrors the
// getimagesizefromstring() check on the WP side; kept in sync with STATUS_MAP's sibling.
function matchesImageSignature(bytes: Buffer, type: 'jpeg' | 'png' | 'webp'): boolean {
  if (type === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'png') {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(pngSignature);
  }
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
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

  const type = match[1] as 'jpeg' | 'png' | 'webp';
  if (!matchesImageSignature(bytes, type)) {
    throw new Error('محتوى الصورة لا يطابق نوعها المعلن');
  }

  return { bytes, contentType: `image/${type}` };
}

function parseMoneyOrUndefined(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new Error('invalid_money_field');

  // Treat a blank string as an explicit zero rather than invalid — see the
  // note below on why the ported /review math can legitimately produce an
  // empty field for a valid zero-value case.
  const candidate = value === '' ? '0' : value;

  // Either comma-grouped in valid thousands positions ("1,000", "1,000,000")
  // or plain digits with no commas at all ("1000") — anchored, so anything
  // else (negative sign, scientific notation, malformed grouping like
  // "1,,000" or "10,00", letters) is rejected outright, not silently
  // stripped and re-parsed.
  if (!/^(?:\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?$/.test(candidate)) {
    throw new Error('invalid_money_field');
  }

  const withoutCommas = candidate.replace(/,/g, '');
  const normalized = Number(withoutCommas);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error('invalid_money_field');
  }
  return withoutCommas; // canonical, comma-free — this exact value is what
                         // gets stored locally AND forwarded to WP; no
                         // second normalization step anywhere downstream.
}

function parseLocationUrlOrUndefined(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new Error('invalid_location_field');

  // Only accept the exact shape this feature generates — a Google Maps
  // coordinate link — not an arbitrary URL, since this value round-trips
  // into a WP order note without further sanitization on the Next.js side
  // (WP-side esc_url_raw() is still the real safety net, but rejecting
  // non-matching shapes here fails fast on obviously-wrong client input).
  const match = value.match(/^https:\/\/maps\.google\.com\/\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error('invalid_location_field');
  }

  // Revised after Codex review: the regex alone accepts out-of-range values
  // like "999,-999" — real latitude/longitude are bounded, so check the
  // actual numeric range too, not just the string shape.
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('invalid_location_field');
  }

  return value;
}

// Base64 photo (8MB cap) inflates ~4/3 plus the rest of the JSON body — reject anything
// clearly larger up front instead of buffering a huge request before validating it.
const maxRequestBytes = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await requireRole(['admin', 'data_entry', 'driver']);
  if (session instanceof NextResponse) return session;

  // Require Content-Length rather than only checking it when present — Number(null) is 0,
  // not NaN, so a missing header (e.g. chunked transfer-encoding) previously bypassed this
  // check entirely. A real browser fetch() with a JSON.stringify body always sends
  // Content-Length, so requiring it doesn't break legitimate driver submissions.
  const contentLengthHeader = req.headers.get('content-length');
  const contentLength = contentLengthHeader === null ? NaN : Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength > maxRequestBytes) {
    return NextResponse.json({ error: 'حجم الطلب أكبر من المسموح' }, { status: 413 });
  }

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

  let collectedPrice: string | undefined;
  let collectedShippingFee: string | undefined;
  let collectedTotal: string | undefined;
  let locationUrl: string | undefined;
  try {
    collectedPrice = parseMoneyOrUndefined(body.collectedPrice);
    collectedShippingFee = parseMoneyOrUndefined(body.collectedShippingFee);
    collectedTotal = parseMoneyOrUndefined(body.collectedTotal);
    locationUrl = parseLocationUrlOrUndefined(body.locationUrl);
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صحيحة' }, { status: 400 });
  }

  try {
    const allAssignedOrders = await getDriverOrders(
      session.role === 'driver' ? session.wpUserId : undefined
    );
    const matchedOrder = allAssignedOrders.find((order) => order.orderId === orderId);

    if (
      !matchedOrder ||
      !Number.isInteger(matchedOrder.assignedDriverId) ||
      matchedOrder.assignedDriverId === 0
    ) {
      return NextResponse.json(
        { error: 'هذا الطلب غير مُسند لأي مندوب' },
        { status: 403 }
      );
    }

    const effectiveDriverId = matchedOrder.assignedDriverId;

    let visit = await prisma.deliveryVisit.create({
      data: {
        shipmentId: String(orderId),
        driverId: effectiveDriverId,
        driverName:
          session.role === 'driver'
            ? session.username
            : `${session.username} (نيابة عن السائق)`,
        status,
        reasonCode,
        note,
        locationUrl,
        collectedPrice,
        collectedShippingFee,
        collectedTotal,
      },
    });

    if (photo) {
      const storedPhoto = await storePhoto({
        orderId: visit.id,
        bytes: photo.bytes,
        contentType: photo.contentType,
      });
      // storePhoto() is shared with the Order capture flow and always builds file-mode
      // URLs as /api/photos/:id, which only looks up Order — rewrite to the
      // DeliveryVisit-specific route so file mode doesn't 404 on visit photos.
      const photoUrl = storedPhoto.photoUrl.startsWith('/api/photos/')
        ? `/api/driver/visits/${visit.id}/photo`
        : storedPhoto.photoUrl;
      visit = await prisma.deliveryVisit.update({
        where: { id: visit.id },
        data: { photoUrl },
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
          ...(effectiveDriverId !== session.wpUserId ? { effectiveDriverId } : {}),
          status,
          reasonCode,
          note,
          hasPhoto: photo !== null,
          ...(collectedTotal !== undefined ? { collectedTotal } : {}),
        },
      },
    });

    // WP push and the local syncedAt bookkeeping are two independent failure points —
    // if the WP call succeeds but the follow-up Prisma update fails, that must not be
    // reported as synced:false (WooCommerce genuinely was updated; only our local
    // "it happened" marker failed to write).
    let synced = false;
    try {
      await submitDeliveryVisit({
        orderId,
        driverId: effectiveDriverId,
        status,
        reasonCode,
        note,
        locationUrl,
        photoDataUrl:
          typeof body.photoDataUrl === 'string' ? body.photoDataUrl : undefined,
        collectedValue: collectedTotal,
      });
      synced = true;
    } catch (syncError) {
      // Local visit and audit rows are the fallback; syncedAt stays null. Log so a
      // pending-sync backlog is actually discoverable instead of silently accumulating.
      console.error('driver visit WP sync failed', { visitId: visit.id, orderId }, syncError);
    }

    if (synced) {
      // One retry — a Postgres write failing immediately after a successful WP push is
      // almost always transient (connection blip), and leaving syncedAt null here would
      // misrepresent an already-synced visit as pending in the DB, even though the API
      // response (below) correctly tells the driver it worked.
      let bookkeepingOk = false;
      for (let attempt = 0; attempt < 2 && !bookkeepingOk; attempt++) {
        try {
          await prisma.deliveryVisit.update({
            where: { id: visit.id },
            data: { syncedAt: new Date() },
          });
          bookkeepingOk = true;
        } catch (bookkeepingError) {
          console.error(
            'driver visit synced to WP but local syncedAt update failed',
            { visitId: visit.id, orderId, attempt },
            bookkeepingError
          );
        }
      }
    }

    return NextResponse.json({ success: true, synced });
  } catch (error) {
    // Log internally; don't leak Prisma/filesystem error details to the client.
    console.error('driver visit failed', error);
    return NextResponse.json({ error: 'تعذّر تسجيل الزيارة' }, { status: 500 });
  }
}
