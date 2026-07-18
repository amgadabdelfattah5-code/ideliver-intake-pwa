import { NextRequest, NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function stringField(source: Record<string, unknown>, key: string): string {
  return typeof source[key] === 'string' ? source[key] : '';
}

export async function GET(req: NextRequest) {
  // admin/data_entry ONLY — not 'driver'. This endpoint deliberately skips the
  // per-order assignment check, so allowing drivers would expose arbitrary orders.
  const session = await requireRole(['admin', 'data_entry']);
  if (session instanceof NextResponse) return session;

  const idsParam = req.nextUrl.searchParams.get('ids') || '';
  const orderIds = idsParam
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (orderIds.length === 0) {
    return NextResponse.json({ error: 'لا توجد معرّفات طلبات صالحة' }, { status: 400 });
  }
  if (orderIds.length > 500) {
    return NextResponse.json({ error: 'عدد الطلبات المطلوبة أكبر من المسموح' }, { status: 400 });
  }

  const shipmentIds = orderIds.map(String);
  const localOrders = await prisma.order.findMany({
    where: { shipmentId: { in: shipmentIds } },
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    select: { shipmentId: true, correctedFields: true },
  });

  const dataEntries: Record<string, unknown> = {};
  for (const localOrder of localOrders) {
    const id = localOrder.shipmentId as string;
    if (id in dataEntries) continue;

    const correctedFields =
      localOrder.correctedFields &&
      typeof localOrder.correctedFields === 'object' &&
      !Array.isArray(localOrder.correctedFields)
        ? (localOrder.correctedFields as Record<string, unknown>)
        : {};

    dataEntries[id] = {
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

  return NextResponse.json({ dataEntries });
}
