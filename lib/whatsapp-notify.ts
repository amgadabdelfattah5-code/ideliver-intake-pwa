import { evolutionConfigured, sendEvolutionText } from '@/lib/evolution-whatsapp';

const DEFAULT_RECIPIENTS = ['+201026000806', '+201003323669'];

export interface OcrCompletionPayload {
  merchantName: string;
  total: number;
  failed: number;
}

function recipients(): string[] {
  const configured =
    process.env.OCR_COMPLETION_WHATSAPP_RECIPIENTS ||
    process.env.DAILY_SUMMARY_WHATSAPP_RECIPIENTS;

  if (!configured) return DEFAULT_RECIPIENTS;
  return configured.split(',').map((item) => item.trim()).filter(Boolean);
}

export function buildOcrCompletionMessage({
  merchantName,
  total,
  failed,
}: OcrCompletionPayload): string {
  const processed = total - failed;

  if (failed > 0) {
    return [
      'تنبيه iDeliver',
      '',
      `تمت معالجة ${processed} من ${total} صورة للتاجر ${merchantName}.`,
      `يوجد ${failed} إيصال يحتاج مراجعة.`,
      '',
      'برجاء الدخول إلى قائمة المراجعة لمراجعة البيانات وإرسال الشحنات.',
    ].join('\n');
  }

  return [
    'تنبيه iDeliver',
    '',
    `تم الانتهاء من معالجة ${total} صورة للتاجر ${merchantName}.`,
    '',
    'الصور جاهزة الآن في قائمة المراجعة.',
    'برجاء مراجعة البيانات وإرسال الشحنات.',
  ].join('\n');
}

// Best-effort: OCR success must not depend on the notification channel.
export async function notifyOcrComplete(payload: OcrCompletionPayload): Promise<void> {
  const message = buildOcrCompletionMessage(payload);
  const targetRecipients = recipients();

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
