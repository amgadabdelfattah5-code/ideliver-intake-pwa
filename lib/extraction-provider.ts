import { OrderStatus, Prisma, SessionStatus } from '@prisma/client';

import { extractWithHermesOcr } from '@/lib/hermes-ocr-client';
import { isKnownEgyptGovernorate } from '@/lib/egypt-governorates';
import { loadPhotoDataUrl } from '@/lib/photo-storage';
import { prisma } from '@/lib/prisma';
import type { ExtractionOrderInput, ExtractionResult } from '@/lib/extraction-types';

interface ValidationFlag {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

const requiredFields = [
  ['recipientName', 'Recipient name is missing.'],
  ['recipientPhone', 'Recipient phone is missing.'],
  ['recipientAddress', 'Recipient address is missing.'],
  ['recipientGovernorate', 'Recipient governorate is missing.'],
  ['product', 'Product is missing.'],
  ['COD', 'COD is missing.'],
] as const;

function valueAsText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function valueAsMoney(value: unknown): number {
  const parsed = Number(valueAsText(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateExtractedFields(fields: ExtractionResult['fields']): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  for (const [field, message] of requiredFields) {
    if (!valueAsText(fields[field])) {
      flags.push({ field, message, severity: 'error' });
    }
  }

  const phone = valueAsText(fields.recipientPhone);
  if (phone && !/^01\d{9}$/.test(phone)) {
    flags.push({
      field: 'recipientPhone',
      message: 'Phone should be an Egyptian mobile number like 01012345678.',
      severity: 'error',
    });
  }

  const governorate = valueAsText(fields.recipientGovernorate);
  if (governorate && !isKnownEgyptGovernorate(governorate)) {
    flags.push({
      field: 'recipientGovernorate',
      message: 'Governorate should be reviewed against the iDeliver governorate list.',
      severity: 'warning',
    });
  }

  const price = valueAsMoney(fields.price);
  const shipping = valueAsMoney(fields.shippingFeePrinted);
  const cod = valueAsMoney(fields.COD);
  if (price > 0 && shipping > 0 && cod > 0 && Math.abs(price + shipping - cod) > 0.01) {
    flags.push({
      field: 'COD',
      message: 'COD does not equal product price plus printed shipping fee.',
      severity: 'warning',
    });
  }

  return flags;
}

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
    const imageDataUrl = await loadPhotoDataUrl(order.id, order.photoUrl);
    const result = await extractOrder({
      orderId: order.id,
      sessionId: session.id,
      sequence: order.sequence,
      imageDataUrl,
      merchant: {
        id: session.merchant.id,
        wpUserId: session.merchant.wpUserId,
        merchantId: session.merchant.merchantId,
        name: session.merchant.name,
        phone: session.merchant.phone,
      },
    });

    provider = result.provider;
    const validationFlags = validateExtractedFields(result.fields);
    const validationFlagJson = validationFlags.map((flag) => ({
      field: flag.field,
      message: flag.message,
      severity: flag.severity,
    })) as Prisma.InputJsonArray;

    const aiFields = {
      ...result.fields,
      fieldConfidence: result.fieldConfidence || {},
      warnings: result.warnings || [],
      validationFlags: validationFlagJson,
    } satisfies Prisma.InputJsonObject;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.extracted,
        aiFields,
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
