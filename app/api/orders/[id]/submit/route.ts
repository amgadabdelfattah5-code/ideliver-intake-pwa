import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OrderStatus, SessionStatus } from '@prisma/client';

// POST /api/orders/:id/submit { correctedFields } → validate → idempotent LiquidShip → store shipment_id
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await requireAuth();
  if (authSession instanceof NextResponse) return authSession;

  const { id: orderId } = await params;

  try {
    const body = await req.json();
    const { correctedFields } = body;

    // Get order with session
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

    // Check if already submitted (idempotency)
    if (order.status === OrderStatus.submitted) {
      return NextResponse.json({
        success: true,
        alreadySubmitted: true,
        shipmentId: order.shipmentId,
      });
    }

    // Build shipment payload from aiFields (or correctedFields)
    const fields = correctedFields || order.aiFields || {};
    const merchantId = order.session.merchant.merchantId;

    // Call LiquidShip /shipment
    const wpRes = await fetch(`${process.env.WP_API_BASE}/shipment`, {
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
          name: fields.recipientName || '',
          phone: fields.recipientPhone || '',
          address: fields.recipientAddress || '',
          governorate: fields.recipientGovernorate || '',
        },
        products: [
          {
            name: 'Order',
            qty: 1,
            price: fields.COD || 0,
          },
        ],
        financials: {
          collected_value: fields.COD || 0,
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

    // Update order status + store shipment_id
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.submitted,
        shipmentId: shipmentData.order_id?.toString(),
        submittedAt: new Date(),
        correctedFields: correctedFields || null,
        reviewedBy: (authSession as any).email || 'unknown',
      },
    });

    // Log action
    await prisma.actionLog.create({
      data: {
        actor: (authSession as any).email || 'unknown',
        action: 'order.submit',
        entity: 'order',
        entityId: orderId,
        meta: { shipmentId: shipmentData.order_id },
      },
    });

    // Check if all orders in session are submitted
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
        id: shipmentData.order_id,
        trackingNumber: shipmentData.tracking_number,
      },
      remainingInSession: remaining,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Submit failed', details: error },
      { status: 500 }
    );
  }
}
