'use client';

import Link from 'next/link';
import { ChangeEvent, useState } from 'react';
import { useParams } from 'next/navigation';

const reasons = [
  { value: 'delivered', label: 'تم التوصيل' },
  { value: 'customer_unavailable', label: 'العميل غير متاح' },
  { value: 'refused', label: 'العميل رفض الاستلام' },
  { value: 'wrong_address', label: 'العنوان غير صحيح' },
  { value: 'postponed', label: 'تم التأجيل' },
];

const statuses = [
  { value: 'shipment-rec', label: 'استلام الشحنة' },
  { value: 'shipped', label: 'قيد التوصيل' },
  { value: 'delivered', label: 'تم التوصيل' },
  { value: 'on-hold', label: 'قيد الانتظار' },
  { value: 'postponed', label: 'مؤجل' },
  { value: 'cancelled', label: 'ملغي' },
  { value: 'refunded', label: 'مرتجع' },
  { value: 'failed', label: 'فشل التوصيل' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذّرت قراءة الصورة'));
    reader.readAsDataURL(file);
  });
}

export default function DriverVisitPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'sending'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('يجب أن تكون الصورة بصيغة JPEG أو PNG أو WebP');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('حجم الصورة أكبر من 8 ميجابايت');
      return;
    }

    try {
      setPhotoDataUrl(await fileToDataUrl(file));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'تعذّرت قراءة الصورة');
    }
  };

  const submitVisit = async (status: string) => {
    if (submitState === 'sending') return;
    if (!reasonCode) {
      setError('يرجى اختيار سبب الزيارة');
      return;
    }

    setSubmitState('sending');
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/driver/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: Number(orderId),
          status,
          reasonCode,
          note: note || undefined,
          photoDataUrl: photoDataUrl || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'تعذّر إرسال الزيارة');
        return;
      }

      setMessage('تم تسجيل الزيارة بنجاح');
      setNote('');
      setPhotoDataUrl('');
    } catch {
      setError('تعذّر الاتصال بالخادم');
    } finally {
      setSubmitState('idle');
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-[#17365F]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#F27321]">iDeliver Egypt</p>
            <h1 className="text-xl font-bold">توثيق الزيارة #{orderId}</h1>
          </div>
          <Link
            className="idv-button idv-button-light idv-button-small text-sm"
            href="/driver"
          >
            رجوع
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-6">
        <div className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="text-sm font-bold">صورة إثبات التسليم</span>
            <input
              accept="image/*"
              capture="environment"
              className="mt-2 block w-full rounded-md border border-slate-300 p-3 text-sm"
              onChange={selectPhoto}
              type="file"
            />
          </label>

          {photoDataUrl && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="معاينة صورة الزيارة"
                className="max-h-72 w-full rounded-md border border-slate-200 object-contain"
                src={photoDataUrl}
              />
              <button
                className="idv-button idv-button-light idv-button-small mt-2 text-sm"
                disabled={submitState === 'sending'}
                onClick={() => setPhotoDataUrl('')}
                type="button"
              >
                إزالة الصورة
              </button>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-bold">سبب الزيارة</span>
            <select
              className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium"
              onChange={(event) => setReasonCode(event.target.value)}
              value={reasonCode}
            >
              <option value="">اختر السبب</option>
              {reasons.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold">ملاحظات (اختياري)</span>
            <textarea
              className="mt-2 min-h-28 w-full rounded-md border border-slate-300 bg-white p-3 text-sm"
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </label>

          <div>
            <p className="text-sm font-bold">حدّث حالة الشحنة</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {statuses.map((status) => (
                <button
                  className="idv-button h-11 text-sm"
                  disabled={submitState === 'sending'}
                  key={status.value}
                  onClick={() => submitVisit(status.value)}
                  type="button"
                >
                  {submitState === 'sending' ? 'جاري الإرسال...' : status.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          {message && (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
              {message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
