import type { ExtractionOrderInput, ExtractionResult } from '@/lib/extraction-types';

const DEFAULT_TIMEOUT_MS = 45_000;

function getHermesConfig() {
  return {
    url: process.env.HERMES_OCR_URL || '',
    token: process.env.HERMES_OCR_TOKEN || '',
    timeoutMs: Number(process.env.HERMES_OCR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHermesResponse(data: unknown): ExtractionResult {
  if (!data || typeof data !== 'object') {
    throw new Error('Hermes OCR returned an invalid response');
  }

  const body = data as Record<string, unknown>;
  const fields =
    body.fields && typeof body.fields === 'object'
      ? (body.fields as Record<string, unknown>)
      : {};

  return {
    provider: normalizeString(body.provider) || 'ideliver-ocr-hermes',
    model: normalizeString(body.model) || 'unknown',
    rawRef: normalizeString(body.rawRef) || null,
    fields: {
      recipientName: normalizeString(fields.recipientName),
      recipientPhone: normalizeString(fields.recipientPhone),
      recipientAddress: normalizeString(fields.recipientAddress),
      recipientGovernorate: normalizeString(fields.recipientGovernorate),
      recipientCity: normalizeString(fields.recipientCity),
      product: normalizeString(fields.product) || 'Order',
      price: normalizeNumber(fields.price),
      shippingFeePrinted: normalizeNumber(fields.shippingFeePrinted),
      COD: normalizeNumber(fields.COD),
      notes: normalizeString(fields.notes),
    },
    confidence: normalizeConfidence(body.confidence),
    fieldConfidence:
      body.fieldConfidence && typeof body.fieldConfidence === 'object'
        ? (body.fieldConfidence as Record<string, number>)
        : {},
    warnings: Array.isArray(body.warnings) ? body.warnings.map(String) : [],
  };
}

export async function extractWithHermesOcr(input: ExtractionOrderInput): Promise<ExtractionResult> {
  const config = getHermesConfig();

  if (!config.url) {
    throw new Error('HERMES_OCR_URL is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        orderId: input.orderId,
        sessionId: input.sessionId,
        sequence: input.sequence,
        imageDataUrl: input.imageDataUrl,
        merchant: input.merchant,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : `Hermes OCR failed with ${response.status}`;
      throw new Error(message);
    }

    return normalizeHermesResponse(data);
  } finally {
    clearTimeout(timeout);
  }
}
