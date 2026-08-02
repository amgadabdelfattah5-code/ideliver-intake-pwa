import { NextRequest, NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDriverOrders } from '@/lib/wp-client';

function stringField(source: Record<string, unknown>, key: string): string {
  return typeof source[key] === 'string' ? source[key] : '';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const session = await requirePermission('driver');
  if (session instanceof NextResponse) return session;

  const { orderId: rawOrderId } = await params;
  const orderId = Number(rawOrderId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'رقم الطلب غير صحيح' }, { status: 400 });
  }

  try {
    const orders = await getDriverOrders(undefined, orderId);
    const order = orders.find((item) => item.orderId === orderId);

    if (!order) {
      return NextResponse.json(
        { error: 'الطلب غير موجود' },
        { status: 404 }
      );
    }

    const localOrder = await prisma.order.findFirst({
      where: { shipmentId: String(orderId) },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: { correctedFields: true },
    });

    let dataEntry = null;

    if (localOrder) {
      const correctedFields =
        localOrder.correctedFields &&
        typeof localOrder.correctedFields === 'object' &&
        !Array.isArray(localOrder.correctedFields)
          ? (localOrder.correctedFields as Record<string, unknown>)
          : {};

      dataEntry = {
        recipientName: stringField(correctedFields, 'recipientName'),
        recipientPhone: stringField(correctedFields, 'recipientPhone'),
        recipientAddress: stringField(correctedFields, 'recipientAddress'),
        recipientGovernorate: stringField(correctedFields, 'recipientGovernorate'),
        product: stringField(correctedFields, 'product'),
        price: stringField(correctedFields, 'price'),
        shippingFeePrinted: stringField(correctedFields, 'shippingFeePrinted'),
        total: stringField(correctedFields, 'COD'),
        notes: stringField(correctedFields, 'notes'),
      };
    }

    return NextResponse.json({ order, dataEntry });
  } catch (error) {
    console.error('driver order details load failed', error);
    return NextResponse.json({ error: 'تعذّر تحميل بيانات الطلب' }, { status: 500 });
  }
}
