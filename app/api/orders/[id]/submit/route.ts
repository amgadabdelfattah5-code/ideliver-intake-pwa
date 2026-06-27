import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus, SessionStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
import { isKnownEgyptGovernorate, normalizeEgyptGovernorate } from '@/lib/egypt-governorates';
import { prisma } from '@/lib/prisma';
import { getLiquidShipBase } from '@/lib/wp-client';

const reviewFieldKeys = [
  'recipientName',
  'recipientPhone',
  'recipientAddress',
  'recipientGovernorate',
  'recipientCity',
  'product',
  'price',
  'shippingFeePrinted',
  'COD',
  'notes',
] as const;

type ReviewFieldKey = (typeof reviewFieldKeys)[number];
type FieldMap = Record<ReviewFieldKey, string>;

function valueToString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function fieldsToMap(value: unknown): FieldMap {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return reviewFieldKeys.reduce((fields, key) => {
    fields[key] = valueToString(source[key]);
    return fields;
  }, {} as FieldMap);
}

function money(value: string): number {
  const normalized = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(normalized) ? normalized : 0;
}

function validateShipmentFields(fields: FieldMap): string[] {
  const errors: string[] = [];

  if (!fields.recipientName) errors.push('اسم المستلم مطلوب.');
  if (!/^01\d{9}$/.test(fields.recipientPhone)) {
    errors.push('يجب أن يكون رقم الهاتف محمولاً مصرياً مثل 01012345678.');
  }
  if (!fields.recipientAddress) errors.push('عنوان المستلم مطلوب.');
  if (!fields.recipientGovernorate) {
    errors.push('محافظة المستلم مطلوبة.');
  } else if (!isKnownEgyptGovernorate(fields.recipientGovernorate)) {
    errors.push('يجب اختيار المحافظة من قائمة محافظات iDeliver.');
  }
  if (!fields.product) errors.push('المنتج مطلوب.');
  if (money(fields.COD) <= 0) errors.push('يجب أن تكون قيمة التحصيل أكبر من صفر.');

  return errors;
}

// ponytail: LiquidShip HTTP call runs inside the row-lock transaction. Correctness (no duplicate
// shipments) over throughput. For a low-concurrency internal PWA this is fine; if contention ever
// matters, add an OrderStatus.submitting enum + two-phase claim and move the HTTP call out of the tx.
const SUBMIT_TX_TIMEOUT_MS = 30_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await requireRole(['admin', 'pickup', 'data_entry']);
  if (authSession instanceof NextResponse) return authSession;

  const { id: orderId } = await params;

  try {
    const body = await req.json();
    const { correctedFields } = body;

    return await prisma.$transaction(async (tx) => {
      // Lock the order row so a second concurrent submit waits until we finish.
      const [locked] = await tx.$queryRaw<
        Array<{ status: string; shipmentId: string | null; sessionId: string }>
      >`SELECT status, "shipmentId", "sessionId" FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

      if (!locked) {
        return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
      }

      if (locked.status === OrderStatus.submitted || locked.shipmentId) {
        const remaining = await tx.order.count({
          where: {
            sessionId: locked.sessionId,
            status: { notIn: [OrderStatus.submitted, OrderStatus.awaiting_merchant] },
          },
        });

        return NextResponse.json({
          success: true,
          alreadySubmitted: true,
          shipmentId: locked.shipmentId,
          remainingInSession: remaining,
        });
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          session: {
            include: { merchant: true },
          },
        },
      });

      if (!order) {
        return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
      }

      const aiFields = fieldsToMap(order.aiFields);
      const fields = {
        ...aiFields,
        ...fieldsToMap(correctedFields),
      };
      fields.recipientGovernorate = normalizeEgyptGovernorate(fields.recipientGovernorate);

      const validationErrors = validateShipmentFields(fields);

      if (validationErrors.length > 0) {
        return NextResponse.json(
          { error: 'الحقول تحتاج إلى مراجعة', details: validationErrors },
          { status: 422 }
        );
      }

      const merchantId = order.session.merchant.merchantId;
      const cod = money(fields.COD);
      const productPrice = money(fields.price) || cod;
      const shippingFee = money(fields.shippingFeePrinted);

      const wpRes = await fetch(`${getLiquidShipBase()}/shipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(
            `${process.env.WP_APP_USER}:${process.env.WP_APP_PASSWORD}`
          ).toString('base64')}`,
        },
        body: JSON.stringify({
          sender: { id: merchantId },
          receiver: {
            name: fields.recipientName,
            phone: fields.recipientPhone,
            address: fields.recipientAddress,
            governorate: fields.recipientGovernorate,
          },
          products: [
            {
              name: fields.product,
              qty: 1,
              price: productPrice,
            },
          ],
          financials: {
            shipping_fee: shippingFee,
            collected_value: cod,
          },
        }),
      });

      if (!wpRes.ok) {
        const err = await wpRes.text();
        return NextResponse.json(
          { error: 'فشل إنشاء الشحنة في LiquidShip', details: err },
          { status: 502 }
        );
      }

      const shipmentData = await wpRes.json();
      const shipmentId = shipmentData.order_id?.toString();

      if (!shipmentId) {
        return NextResponse.json(
          { error: 'استجابة LiquidShip لا تحتوي على رقم الطلب', details: shipmentData },
          { status: 502 }
        );
      }

      const corrections = reviewFieldKeys
        .filter((field) => aiFields[field] !== fields[field])
        .map((field) => ({
          orderId,
          field,
          aiValue: aiFields[field],
          correctedValue: fields[field],
          correctedBy: authSession.email,
        }));

      await tx.correction.deleteMany({ where: { orderId } });
      if (corrections.length > 0) {
        await tx.correction.createMany({ data: corrections });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.submitted,
          shipmentId,
          submittedAt: new Date(),
          correctedFields: fields,
          reviewedBy: authSession.email,
        },
      });

      await tx.actionLog.create({
        data: {
          actor: authSession.email,
          action: 'order.submit',
          entity: 'order',
          entityId: orderId,
          meta: {
            shipmentId,
            trackingNumber: shipmentData.tracking_number,
            correctionCount: corrections.length,
          },
        },
      });

      const remaining = await tx.order.count({
        where: {
          sessionId: order.sessionId,
          status: { notIn: [OrderStatus.submitted, OrderStatus.awaiting_merchant] },
        },
      });

      if (remaining === 0) {
        await tx.session.update({
          where: { id: order.sessionId },
          data: { status: SessionStatus.completed, completedAt: new Date() },
        });
      }

      return NextResponse.json({
        success: true,
        shipment: {
          id: shipmentId,
          trackingNumber: shipmentData.tracking_number,
        },
        remainingInSession: remaining,
      });
    }, { timeout: SUBMIT_TX_TIMEOUT_MS, maxWait: 10_000 });
  } catch (error) {
    return NextResponse.json(
      { error: 'فشل الإرسال', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
