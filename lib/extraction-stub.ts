import { OrderStatus, SessionStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export async function runStubExtraction(sessionId: string): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { sessionId },
    orderBy: { sequence: 'asc' },
  });

  if (orders.length === 0) {
    return 0;
  }

  await Promise.all(
    orders.map((order) =>
      prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.extracted,
          aiFields: {
            recipientName: 'Ahmed Mohamed',
            recipientPhone: '01000000000',
            recipientAddress: 'Nasr City, Cairo',
            recipientGovernorate: 'Cairo',
            product: 'Order',
            price: 150,
            shippingFeePrinted: 50,
            COD: 200,
          },
          confidence: 0.82,
        },
      })
    )
  );

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: SessionStatus.ready_for_review },
  });

  return orders.length;
}
