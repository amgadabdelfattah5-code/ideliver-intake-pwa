import { OrderStatus, SessionStatus } from '@prisma/client';

import { extractWithHermesOcr } from '@/lib/hermes-ocr-client';
import { prisma } from '@/lib/prisma';
import type { ExtractionOrderInput, ExtractionResult } from '@/lib/extraction-types';

function stubResult(order: ExtractionOrderInput): ExtractionResult {
  return {
    provider: 'stub',
    model: 'local-stub',
    rawRef: `stub:${order.orderId}`,
    fields: {
      recipientName: 'Ahmed Mohamed',
      recipientPhone: '01000000000',
      recipientAddress: 'Nasr City, Cairo',
      recipientGovernorate: 'Cairo',
      recipientCity: 'Nasr City',
      product: 'Order',
      price: 150,
      shippingFeePrinted: 50,
      COD: 200,
      notes: '',
    },
    confidence: 0.82,
    fieldConfidence: {
      recipientName: 0.82,
      recipientPhone: 0.82,
      recipientAddress: 0.78,
      COD: 0.84,
    },
    warnings: ['Stub extraction result. Do not use for production shipment automation.'],
  };
}

function shouldUseStub(): boolean {
  return process.env.EXTRACTION_PROVIDER === 'stub';
}

function allowStubFallback(): boolean {
  return process.env.HERMES_OCR_ALLOW_STUB_FALLBACK === 'true';
}

async function extractOrder(order: ExtractionOrderInput): Promise<ExtractionResult> {
  if (shouldUseStub()) {
    return stubResult(order);
  }

  try {
    return await extractWithHermesOcr(order);
  } catch (error) {
    if (allowStubFallback()) {
      return {
        ...stubResult(order),
        warnings: [
          `Hermes OCR failed and stub fallback was used: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      };
    }

    throw error;
  }
}

export async function runSessionExtraction(sessionId: string): Promise<{
  provider: string;
  ordersProcessed: number;
}> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      merchant: true,
      orders: {
        orderBy: { sequence: 'asc' },
      },
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.orders.length === 0) {
    return { provider: shouldUseStub() ? 'stub' : 'ideliver-ocr-hermes', ordersProcessed: 0 };
  }

  let provider = shouldUseStub() ? 'stub' : 'ideliver-ocr-hermes';

  for (const order of session.orders) {
    const result = await extractOrder({
      orderId: order.id,
      sessionId: session.id,
      sequence: order.sequence,
      imageDataUrl: order.photoUrl,
      merchant: {
        id: session.merchant.id,
        wpUserId: session.merchant.wpUserId,
        merchantId: session.merchant.merchantId,
        name: session.merchant.name,
        phone: session.merchant.phone,
      },
    });

    provider = result.provider;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.extracted,
        aiFields: {
          ...result.fields,
          fieldConfidence: result.fieldConfidence || {},
          warnings: result.warnings || [],
        },
        confidence: result.confidence,
        extraction: {
          upsert: {
            create: {
              provider: result.provider,
              model: result.model,
              rawRef: result.rawRef,
            },
            update: {
              provider: result.provider,
              model: result.model,
              rawRef: result.rawRef,
              createdAt: new Date(),
            },
          },
        },
      },
    });
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: SessionStatus.ready_for_review },
  });

  return { provider, ordersProcessed: session.orders.length };
}
