// ponytail: stub until a WhatsApp provider is chosen (Meta Cloud API, Twilio, UltraMsg, etc.).
// When WHATSAPP_PROVIDER_URL + REVIEWER_WHATSAPP_PHONE are set, this posts to that endpoint.
// Otherwise it logs the message so OCR completion is observable. Replace the provider block
// with the real integration; the message format is already what reviewers expect.

const REVIEWER_PHONE = process.env.REVIEWER_WHATSAPP_PHONE || '';
const PROVIDER_URL = process.env.WHATSAPP_PROVIDER_URL || '';

export interface OcrCompletionPayload {
  merchantName: string;
  total: number;
  failed: number;
}

export function buildOcrCompletionMessage({
  merchantName,
  total,
  failed,
}: OcrCompletionPayload): string {
  const processed = total - failed;

  if (failed > 0) {
    return `تمت معالجة ${processed} من ${total} صورة، ويوجد ${failed} تحتاج مراجعة. برجاء الدخول إلى قائمة المراجعة.`;
  }

  return `تم الانتهاء من استخراج بيانات ${total} إيصال للتاجر ${merchantName}. برجاء الدخول إلى قائمة المراجعة.`;
}

// Best-effort: never throws. OCR success must not depend on the notification channel.
export async function notifyOcrComplete(payload: OcrCompletionPayload): Promise<void> {
  const message = buildOcrCompletionMessage(payload);

  if (!REVIEWER_PHONE || !PROVIDER_URL) {
    console.log(`[whatsapp-stub] to=${REVIEWER_PHONE || '(unset)'} message=${message}`);
    return;
  }

  // TODO: replace with the real provider request shape once selected.
  try {
    await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: REVIEWER_PHONE, message }),
    });
  } catch (error) {
    console.error('[whatsapp-notify] send failed', error);
  }
}
