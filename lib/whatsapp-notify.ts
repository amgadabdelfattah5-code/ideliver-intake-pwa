import { evolutionConfigured, sendEvolutionText } from '@/lib/evolution-whatsapp';

const DEFAULT_REVIEW_URL = 'https://n8n-mcp-intake-pwa.yawxsq.easypanel.host/review';

export interface OcrCompletionPayload {
  merchantName: string;
  total: number;
  failed: number;
}

function recipients(): string[] {
  const configured =
    process.env.OCR_COMPLETION_WHATSAPP_RECIPIENTS ||
    process.env.DAILY_SUMMARY_WHATSAPP_RECIPIENTS;

  if (!configured) return [];
  return configured.split(',').map((item) => item.trim()).filter(Boolean);
}

function reviewUrl(): string {
  const baseUrl = process.env.REVIEW_QUEUE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) return DEFAULT_REVIEW_URL;

  return baseUrl.endsWith('/review') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/review`;
}

export function buildOcrCompletionMessage({
  merchantName,
  total,
}: OcrCompletionPayload): string {
  return [
    'تنبيه iDeliver',
    '',
    `تمت معالجة ${total} صور للتاجر ${merchantName}.`,
    '',
    `برجاء المراجعة من خلال هذا اللينك: ${reviewUrl()}`,
  ].join('\n');
}

// Best-effort: OCR success must not depend on the notification channel.
export async function notifyOcrComplete(payload: OcrCompletionPayload): Promise<void> {
  const message = buildOcrCompletionMessage(payload);
  const targetRecipients = recipients();

  if (targetRecipients.length === 0) {
    console.warn('[evolution-ocr-notify] no recipients configured, skipping notification');
    return;
  }

  if (!evolutionConfigured()) {
    console.log(`[evolution-ocr-stub] to=${targetRecipients.join(',')} message=${message}`);
    return;
  }

  try {
    await Promise.all(targetRecipients.map((recipient) => sendEvolutionText(recipient, message)));
  } catch (error) {
    console.error('[evolution-ocr-notify] send failed', error);
  }
}
