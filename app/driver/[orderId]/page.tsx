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
  merchantName: { minWidth: '120px', grow: 1 },
  notes: { minWidth: '180px', grow: 3 },
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

// Deliberately excludes financial/admin-only statuses (e.g. refunded) — matches the
// WP-side STATUS_MAP; a delivery visit shouldn't be able to trigger a refund.
const statuses = [
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
  const [selectedStatus, setSelectedStatus] = useState('');
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [locationUrl, setLocationUrl] = useState('');
  const [locationCapturing, setLocationCapturing] = useState(false);
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
        const currentStatusIsSelectable = statuses.some((s) => s.value === data.order.status);
        setSelectedStatus(currentStatusIsSelectable ? data.order.status : '');
        setLocationUrl('');
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

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setError('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    setLocationCapturing(true);
    setLocationUrl('');
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocationUrl(`https://maps.google.com/?q=${latitude},${longitude}`);
        setLocationCapturing(false);
      },
      () => {
        setError('تعذّر تحديد الموقع — يرجى السماح بالوصول للموقع');
        setLocationCapturing(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const submitVisit = async (status: string) => {
    if (submitState === 'sending') return;
    if (!selectedStatus) {
      setError('يرجى اختيار الحالة');
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
          reasonCode: 'not_provided',
          note: note || undefined,
          photoDataUrl: photoDataUrl || undefined,
          locationUrl: locationUrl || undefined,
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
      setSelectedStatus('');
      setLocationUrl('');
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
            <h1 className="text-xl font-bold">أوردر #{orderId}</h1>
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
                </div>
              ) : (
                <p className='text-sm font-medium text-slate-600'>
                  لا توجد بيانات إدخال بيانات لهذا الطلب
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 p-3"
                  style={{ minWidth: fieldSizing.product.minWidth, flexGrow: fieldSizing.product.grow, flexShrink: 1, flexBasis: 0 }}
                >
                  <dt className="text-xs font-bold text-slate-500">المنتج</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                    {orderDetails.dataEntry?.product || '—'}
                  </dd>
                </div>
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 p-3"
                  style={{ minWidth: fieldSizing.merchantName.minWidth, flexGrow: fieldSizing.merchantName.grow, flexShrink: 1, flexBasis: 0 }}
                >
                  <dt className="text-xs font-bold text-slate-500">التاجر</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                    {orderDetails.order.merchantName || '—'}
                  </dd>
                </div>
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 p-3"
                  style={{ minWidth: fieldSizing.notes.minWidth, flexGrow: fieldSizing.notes.grow, flexShrink: 1, flexBasis: 0 }}
                >
                  <dt className="text-xs font-bold text-slate-500">ملاحظات</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">
                    {orderDetails.dataEntry?.notes || '—'}
                  </dd>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-6">
        <div className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {/* 1. Photo — compact card instead of full-width block */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3" style={{ minWidth: '160px', flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
              <label className="block text-xs font-bold text-slate-500" htmlFor="visit-photo-input">صورة إثبات التسليم</label>
              <div className="mt-1">
                <input
                  accept="image/*"
                  capture="environment"
                  className="block w-full text-xs"
                  id="visit-photo-input"
                  onChange={selectPhoto}
                  type="file"
                />
                {photoDataUrl && (
                  <div className="mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="معاينة صورة الزيارة" className="max-h-20 w-full rounded border border-slate-200 object-contain" src={photoDataUrl} />
                    <button
                      className="idv-button idv-button-light idv-button-small mt-1 text-xs"
                      disabled={submitState === 'sending'}
                      onClick={() => setPhotoDataUrl('')}
                      type="button"
                    >
                      إزالة
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 2. الحالة — status dropdown, replaces سبب الزيارة */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3" style={{ minWidth: '140px', flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
              <label className="block text-xs font-bold text-slate-500" htmlFor="visit-status-select">الحالة</label>
              <div className="mt-1">
                <select
                  className="h-8 w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-800 outline-none"
                  id="visit-status-select"
                  onChange={(event) => setSelectedStatus(event.target.value)}
                  value={selectedStatus}
                >
                  <option value="">اختر الحالة</option>
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. الموقع — one-tap GPS capture */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3" style={{ minWidth: '140px', flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
              <span className="block text-xs font-bold text-slate-500" id="visit-location-label">الموقع</span>
              <div className="mt-1">
                <button
                  aria-labelledby="visit-location-label visit-location-button"
                  className="idv-button idv-button-light idv-button-small w-full text-xs"
                  disabled={locationCapturing || submitState === 'sending'}
                  id="visit-location-button"
                  onClick={captureLocation}
                  type="button"
                >
                  <span aria-live="polite" role="status">
                    {locationCapturing ? 'جاري التحديد...' : locationUrl ? 'تم تحديد الموقع ✓' : 'تحديد موقعي الحالي'}
                  </span>
                </button>
              </div>
            </div>

            {/* 4. ملاحظات */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3" style={{ minWidth: '180px', flexGrow: 2, flexShrink: 1, flexBasis: 0 }}>
              <label className="block text-xs font-bold text-slate-500" htmlFor="visit-note-textarea">ملاحظات (اختياري)</label>
              <div className="mt-1">
                <textarea
                  className="min-h-16 w-full border-none bg-transparent p-0 text-sm outline-none"
                  id="visit-note-textarea"
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </div>
            </div>
          </div>

          <button
            className="idv-button idv-button-primary w-full text-sm font-bold"
            disabled={submitState === 'sending' || locationCapturing}
            onClick={() => submitVisit(selectedStatus)}
            type="button"
          >
            {submitState === 'sending' ? 'جاري الإرسال...' : 'تسجيل الزيارة'}
          </button>

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
