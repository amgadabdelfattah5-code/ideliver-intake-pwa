'use client';

import Link from 'next/link';
import { ChangeEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface DriverOrder {
  orderId: number;
  tracking: string;
  status: string;
  merchantName: string;
}

interface DataEntry {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientGovernorate: string;
  product: string;
  price: string;
  shippingFeePrinted: string;
  total: string;
  notes: string;
}

interface OrderDetails {
  order: DriverOrder;
  dataEntry: DataEntry | null;
}

const dataEntryFields: Array<[keyof DataEntry, string]> = [
  ['recipientName', 'اسم المستلم'],
  ['recipientPhone', 'رقم الهاتف'],
  ['recipientAddress', 'العنوان'],
  ['recipientGovernorate', 'المحافظة'],
  ['product', 'المنتج'],
  ['price', 'سعر المنتج'],
  ['shippingFeePrinted', 'مصاريف الشحن'],
  ['total', 'الإجمالي'],
];

const fieldSizing: Record<string, { minWidth: string; grow: number }> = {
  recipientName: { minWidth: '90px', grow: 1 },
  recipientPhone: { minWidth: '100px', grow: 1 },
  recipientGovernorate: { minWidth: '90px', grow: 1 },
  recipientAddress: { minWidth: '180px', grow: 3 },
  product: { minWidth: '140px', grow: 1 },
  price: { minWidth: '110px', grow: 1 },
  shippingFeePrinted: { minWidth: '110px', grow: 1 },
  total: { minWidth: '110px', grow: 1 },
};

function moneyValue(value: string | undefined): number {
  const normalized = Number((value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(normalized) ? normalized : 0;
}

function formatMoneyValue(value: number): string {
  return value > 0 ? value.toLocaleString('en-US') : '';
}

function calculateTotal(price: string | undefined, shippingFee: string | undefined): string {
  return formatMoneyValue(moneyValue(price) + moneyValue(shippingFee));
}

function calculatePrice(total: string | undefined, shippingFee: string | undefined): string {
  return formatMoneyValue(Math.max(moneyValue(total) - moneyValue(shippingFee), 0));
}

function formatMoneyInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '';
}

const reasons = [
  { value: 'delivered', label: 'تم التوصيل' },
  { value: 'customer_unavailable', label: 'العميل غير متاح' },
  { value: 'refused', label: 'العميل رفض الاستلام' },
  { value: 'wrong_address', label: 'العنوان غير صحيح' },
  { value: 'postponed', label: 'تم التأجيل' },
];

// Deliberately excludes financial/admin-only statuses (e.g. refunded) — matches the
// WP-side STATUS_MAP; a delivery visit shouldn't be able to trigger a refund.
const statuses = [
  { value: 'shipment-rec', label: 'استلام الشحنة' },
  { value: 'shipped', label: 'قيد التوصيل' },
  { value: 'delivered', label: 'تم التوصيل' },
  { value: 'on-hold', label: 'قيد الانتظار' },
  { value: 'postponed', label: 'مؤجل' },
  { value: 'cancelled', label: 'ملغي' },
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
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'sending'>('idle');
  const [message, setMessage] = useState('');
  const [messageSynced, setMessageSynced] = useState(true);
  const [error, setError] = useState('');
  const [collectedPrice, setCollectedPrice] = useState('');
  const [collectedShippingFee, setCollectedShippingFee] = useState('');
  const [collectedTotal, setCollectedTotal] = useState('');
  const [collectedPricingMode, setCollectedPricingMode] = useState<'sum' | 'fromTotal'>('sum');
  const [collectedFieldsForOrderId, setCollectedFieldsForOrderId] = useState<string | null>(null);

  if (orderDetails?.dataEntry && collectedFieldsForOrderId !== orderId) {
    setCollectedFieldsForOrderId(orderId);
    setCollectedPrice(orderDetails.dataEntry.price);
    setCollectedShippingFee(orderDetails.dataEntry.shippingFeePrinted);
    setCollectedTotal(orderDetails.dataEntry.total);
    setCollectedPricingMode('sum');
  }

  useEffect(() => {
    fetch(`/api/driver/orders/${encodeURIComponent(orderId)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'تعذّر تحميل بيانات الطلب');
        setOrderDetails(data);
      })
      .catch((loadError) => {
        setDetailsError(
          loadError instanceof Error ? loadError.message : 'تعذّر تحميل بيانات الطلب'
        );
      })
      .finally(() => setDetailsLoading(false));
  }, [orderId]);

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
          collectedPrice: orderDetails?.dataEntry ? collectedPrice : undefined,
          collectedShippingFee: orderDetails?.dataEntry ? collectedShippingFee : undefined,
          collectedTotal: orderDetails?.dataEntry ? collectedTotal : undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'تعذّر إرسال الزيارة');
        return;
      }

      setMessageSynced(Boolean(data.synced));
      setMessage(
        data.synced
          ? 'تم تسجيل الزيارة وتحديث حالة الشحنة بنجاح'
          : 'تم حفظ الزيارة محلياً، لكن تحديث حالة الشحنة لم يتم بعد — سيُعاد المحاولة لاحقاً'
      );
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
      <section className='mx-auto max-w-3xl px-4 pt-6'>
        <div className='rounded-lg border border-slate-200 bg-white p-5 shadow-sm'>
          <h2 className='text-lg font-bold'>بيانات الطلب</h2>

          {detailsLoading && (
            <p className='mt-3 text-sm font-medium text-slate-600'>جاري تحميل بيانات الطلب...</p>
          )}

          {detailsError && (
            <p className='mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700'>
              {detailsError}
            </p>
          )}

          {orderDetails && (
            <div className='mt-4 space-y-4'>
              <dl className='grid gap-3 sm:grid-cols-3'>
                <div className='rounded-md border border-slate-200 bg-slate-50 p-3'>
                  <dt className='text-xs font-bold text-slate-500'>رقم التتبع</dt>
                  <dd className='mt-1 break-words text-sm font-semibold'>
                    {orderDetails.order.tracking || '—'}
                  </dd>
                </div>
                <div className='rounded-md border border-slate-200 bg-slate-50 p-3'>
                  <dt className='text-xs font-bold text-slate-500'>الحالة</dt>
                  <dd className='mt-1 break-words text-sm font-semibold'>
                    {orderDetails.order.status || '—'}
                  </dd>
                </div>
                <div className='rounded-md border border-slate-200 bg-slate-50 p-3'>
                  <dt className='text-xs font-bold text-slate-500'>التاجر</dt>
                  <dd className='mt-1 break-words text-sm font-semibold'>
                    {orderDetails.order.merchantName || '—'}
                  </dd>
                </div>
              </dl>

              {orderDetails.dataEntry ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {dataEntryFields.slice(0, 4).map(([key, label]) => (
                      <div
                        className="rounded-md border border-slate-200 bg-slate-50 p-3"
                        key={key}
                        style={{ minWidth: fieldSizing[key]?.minWidth ?? '110px', flexGrow: fieldSizing[key]?.grow ?? 1, flexShrink: 1, flexBasis: 0 }}
                      >
                        <dt className="text-xs font-bold text-slate-500">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                          {orderDetails.dataEntry?.[key] || '—'}
                        </dd>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {dataEntryFields.slice(4, 5).map(([key, label]) => (
                      <div
                        className="rounded-md border border-slate-200 bg-slate-50 p-3"
                        key={key}
                        style={{ minWidth: fieldSizing[key]?.minWidth ?? '110px', flexGrow: fieldSizing[key]?.grow ?? 1, flexShrink: 1, flexBasis: 0 }}
                      >
                        <dt className="text-xs font-bold text-slate-500">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                          {orderDetails.dataEntry?.[key] || '—'}
                        </dd>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {dataEntryFields.slice(5).map(([key, label]) => (
                      <div
                        className="rounded-md border border-slate-200 bg-slate-50 p-3"
                        key={key}
                        style={{ minWidth: fieldSizing[key]?.minWidth ?? '110px', flexGrow: fieldSizing[key]?.grow ?? 1, flexShrink: 1, flexBasis: 0 }}
                      >
                        <dt className="text-xs font-bold text-slate-500">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                          {orderDetails.dataEntry?.[key] || '—'}
                        </dd>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <div
                      className="rounded-md border border-amber-300 bg-amber-50 p-3 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-400/40"
                      style={{ minWidth: fieldSizing.price.minWidth, flexGrow: fieldSizing.price.grow, flexShrink: 1, flexBasis: 0 }}
                    >
                      <dt className="text-xs font-bold text-slate-500" id="collected-price-label">سعر المنتج المحصل</dt>
                      <dd className="mt-1">
                        <input
                          aria-labelledby="collected-price-label"
                          className="h-8 w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-800 outline-none"
                          id="collected-price"
                          inputMode="numeric"
                          onChange={(event) => {
                            const value = formatMoneyInput(event.target.value);
                            setCollectedPricingMode('sum');
                            setCollectedPrice(value);
                            setCollectedTotal(calculateTotal(value, collectedShippingFee));
                          }}
                          value={collectedPrice}
                        />
                      </dd>
                    </div>
                    <div
                      className="rounded-md border border-amber-300 bg-amber-50 p-3 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-400/40"
                      style={{ minWidth: fieldSizing.shippingFeePrinted.minWidth, flexGrow: fieldSizing.shippingFeePrinted.grow, flexShrink: 1, flexBasis: 0 }}
                    >
                      <dt className="text-xs font-bold text-slate-500" id="collected-shipping-label">مصاريف الشحن المحصلة</dt>
                      <dd className="mt-1">
                        <input
                          aria-labelledby="collected-shipping-label"
                          className="h-8 w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-800 outline-none"
                          id="collected-shipping"
                          inputMode="numeric"
                          onChange={(event) => {
                            const value = formatMoneyInput(event.target.value);
                            setCollectedShippingFee(value);
                            if (collectedPricingMode === 'fromTotal') {
                              setCollectedPrice(calculatePrice(collectedTotal, value));
                            } else {
                              setCollectedTotal(calculateTotal(collectedPrice, value));
                            }
                          }}
                          value={collectedShippingFee}
                        />
                      </dd>
                    </div>
                    <div
                      className="rounded-md border border-amber-300 bg-amber-50 p-3 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-400/40"
                      style={{ minWidth: fieldSizing.total.minWidth, flexGrow: fieldSizing.total.grow, flexShrink: 1, flexBasis: 0 }}
                    >
                      <dt className="text-xs font-bold text-slate-500" id="collected-total-label">الإجمالي المحصل</dt>
                      <dd className="mt-1">
                        <input
                          aria-labelledby="collected-total-label"
                          className="h-8 w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-800 outline-none"
                          id="collected-total"
                          inputMode="numeric"
                          onChange={(event) => {
                            const value = formatMoneyInput(event.target.value);
                            setCollectedPricingMode('fromTotal');
                            setCollectedTotal(value);
                            setCollectedPrice(calculatePrice(value, collectedShippingFee));
                          }}
                          value={collectedTotal}
                        />
                      </dd>
                    </div>
                  </div>

                  <div className="w-full rounded-md border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-xs font-bold text-slate-500">ملاحظات</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">
                      {orderDetails.dataEntry?.notes || '—'}
                    </dd>
                  </div>
                </div>
              ) : (
                <p className='text-sm font-medium text-slate-600'>
                  لا توجد بيانات إدخال بيانات لهذا الطلب
                </p>
              )}
            </div>
          )}
        </div>
      </section>

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
            <p
              className={
                messageSynced
                  ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700'
                  : 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800'
              }
            >
              {message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
