import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OrderStatus, SessionStatus } from '@prisma/client';

// POST /api/test/extract-stub?sessionId= — stub Hermes extraction (for slice testing)
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  try {
    // Get all orders for the session
    const orders = await prisma.order.findMany({
      where: { sessionId },
      orderBy: { sequence: 'asc' },
    });

    if (orders.length === 0) {
      return NextResponse.json({ error: 'No orders found' }, { status: 404 });
    }

    // Simulate Hermes extraction: populate mock aiFields
    const extractionPromises = orders.map((order) =>
      prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.extracted,
          aiFields: {
            recipientName: 'Ahmed Mohamed',
            recipientPhone: '01000000000',
            recipientAddress: '123 Main St, Nasr City',
            recipientGovernorate: 'Cairo',
            COD: 150,
          },
          confidence: 0.92,
        },
      })
    );

    await Promise.all(extractionPromises);

    // Update session status
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.ready_for_review },
    });

    return NextResponse.json({
      success: true,
      message: 'Stub extraction complete',
      ordersProcessed: orders.length,
      sessionId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Stub extraction failed', details: error },
      { status: 500 }
    );
  }
}
