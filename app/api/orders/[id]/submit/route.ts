import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus, SessionStatus } from '@prisma/client';

import { requireRole } from '@/lib/auth';
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

  if (!fields.recipientName) errors.push('Recipient name is required.');
  if (!/^01\d{9}$/.test(fields.recipientPhone)) {
    errors.push('Recipient phone must be an Egyptian mobile number like 01012345678.');
  }
  if (!fields.recipientAddress) errors.push('Recipient address is required.');
  if (!fields.recipientGovernorate) errors.push('Recipient governorate is required.');
  if (!fields.product) errors.push('Product is required.');
  if (money(fields.COD) <= 0) errors.push('COD must be greater than zero.');

  return errors;
}

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

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        session: {
          include: { merchant: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.status === OrderStatus.submitted || order.shipmentId) {
      return NextResponse.json({
        success: true,
        alreadySubmitted: true,
        shipmentId: order.shipmentId,
      });
    }

    const aiFields = fieldsToMap(order.aiFields);
    const fields = {
      ...aiFields,
      ...fieldsToMap(correctedFields),
    };
    const validationErrors = validateShipmentFields(fields);

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Shipment fields need review', details: validationErrors },
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
        { error: 'LiquidShip shipment failed', details: err },
        { status: 500 }
      );
    }

    const shipmentData = await wpRes.json();
    const shipmentId = shipmentData.order_id?.toString();

    if (!shipmentId) {
      return NextResponse.json(
        { error: 'LiquidShip shipment response missing order_id', details: shipmentData },
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

    await prisma.$transaction([
      prisma.correction.deleteMany({ where: { orderId } }),
      ...(corrections.length > 0 ? [prisma.correction.createMany({ data: corrections })] : []),
      prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.submitted,
          shipmentId,
          submittedAt: new Date(),
          correctedFields: fields,
          reviewedBy: authSession.email,
        },
      }),
      prisma.actionLog.create({
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
      }),
    ]);

    const remaining = await prisma.order.count({
      where: {
        sessionId: order.sessionId,
        status: { not: OrderStatus.submitted },
      },
    });

    if (remaining === 0) {
      await prisma.session.update({
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
  } catch (error) {
    return NextResponse.json(
      { error: 'Submit failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
