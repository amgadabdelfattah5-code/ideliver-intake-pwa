'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { egyptGovernorates, normalizeEgyptGovernorate } from '@/lib/egypt-governorates';

type AiFields = Record<string, unknown>;
interface ValidationFlag {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface QueueMerchant {
  wpUserId: number;
  merchantId: string;
  name: string;
  sessions: Array<{
    id: string;
    photoCount: number;
    orderCount: number;
    createdAt: string;
  }>;
}

interface ReviewOrder {
  id: string;
  sequence: number;
  photoUrl: string;
  aiFields: AiFields | null;
  correctedFields: AiFields | null;
  confidence: number | null;
  status: string;
}

interface ReviewSession {
  id: string;
  status: string;
  merchant: { name: string };
  orders: ReviewOrder[];
}

const reviewFields = [
  ['recipientName', 'Recipient name'],
  ['recipientAddress', 'Address'],
  ['recipientGovernorate', 'Governorate'],
  ['recipientPhone', 'Phone'],
  ['product', 'Product'],
  ['price', 'Price'],
  ['shippingFeePrinted', 'Shipping fees'],
  ['total', 'Total'],
  ['notes', 'Notes'],
];

function fieldsToDraft(fields: AiFields | null): Record<string, string> {
  const draft: Record<string, string> = {};

  for (const [key] of reviewFields) {
    const value = key === 'total' ? fields?.COD : fields?.[key];
    draft[key] = value == null ? '' : String(value);
  }

  draft.recipientGovernorate = normalizeEgyptGovernorate(draft.recipientGovernorate);
  draft.total = calculateTotal(draft.price, draft.shippingFeePrinted);

  return draft;
}

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

function hiddenDraftValue(order: ReviewOrder, key: string): string {
  const correctedValue = order.correctedFields?.[key];
  const aiValue = order.aiFields?.[key];
  const value = correctedValue ?? aiValue;

  return value == null ? '' : String(value);
}

function confidenceForField(fields: AiFields | null, key: string): number | null {
  const fieldConfidence = fields?.fieldConfidence;
  if (!fieldConfidence || typeof fieldConfidence !== 'object' || Array.isArray(fieldConfidence)) {
    return null;
  }

  const value = (fieldConfidence as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

function validationFlagsFromFields(fields: AiFields | null): ValidationFlag[] {
  const flags = fields?.validationFlags;
  if (!Array.isArray(flags)) return [];

  return flags
    .map((flag) => {
      if (!flag || typeof flag !== 'object' || Array.isArray(flag)) return null;
      const item = flag as Record<string, unknown>;
      const severity = item.severity === 'error' ? 'error' : 'warning';

      return {
        field: String(item.field || ''),
        message: String(item.message || ''),
        severity,
      };
    })
    .filter((flag): flag is ValidationFlag => Boolean(flag?.field && flag.message));
}

function formatErrorDetails(details: unknown): string {
  if (Array.isArray(details)) return details.join(' ');
  if (typeof details === 'string') return details;
  return '';
}

function reviewFieldClass(key: string): string {
  switch (key) {
    case 'recipientName':
    case 'recipientPhone':
    case 'recipientGovernorate':
    case 'product':
      return 'block md:col-span-4';
    case 'price':
    case 'shippingFeePrinted':
    case 'total':
      return 'block md:col-span-3';
    case 'recipientAddress':
      return 'block md:col-span-17';
    case 'notes':
      return 'block md:col-span-8';
    default:
      return 'block md:col-span-4';
  }
}

function clampZoom(value: number): number {
  return Math.min(4, Math.max(1, Number(value.toFixed(2))));
}

export default function ReviewPage() {
  const [queue, setQueue] = useState<QueueMerchant[]>([]);
  const [selectedSession, setSelectedSession] = useState<ReviewSession | null>(null);
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [pricingMode, setPricingMode] = useState<'sum' | 'fromTotal'>('sum');
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const pendingOrders = useMemo(
    () =>
      selectedSession?.orders.filter(
        (order) => order.status !== 'submitted' && order.status !== 'awaiting_merchant'
      ) ?? [],
    [selectedSession]
  );
  const order = pendingOrders[currentOrderIndex];

  const resetImageView = () => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  };

  const changeImageZoom = (delta: number) => {
    setImageZoom((current) => {
      const next = clampZoom(current + delta);
      if (next === 1) setImagePan({ x: 0, y: 0 });
      return next;
    });
  };

  const loadQueue = async () => {
    setLoading(true);
    const response = await fetch('/api/review/queue');
    const data = await response.json();
    setQueue(data.merchants || []);
    setLoading(false);
  };

  const loadSession = async (sessionId: string, preferredIndex = 0) => {
    const response = await fetch(`/api/sessions/${sessionId}/details`);
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || 'Could not load session');
      return;
    }

    const session = data.session as ReviewSession;
    const openOrders = session.orders.filter(
      (item) => item.status !== 'submitted' && item.status !== 'awaiting_merchant'
    );
    const nextIndex = Math.min(preferredIndex, Math.max(openOrders.length - 1, 0));

    setSelectedSession(session);
    setCurrentOrderIndex(nextIndex);
    setDraft(fieldsToDraft(openOrders[nextIndex]?.correctedFields || openOrders[nextIndex]?.aiFields || null));
    setPricingMode('sum');
    resetImageView();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const sessionId = new URLSearchParams(window.location.search).get('session');

      if (sessionId) {
        void loadSession(sessionId).finally(() => setLoading(false));
        return;
      }

      void loadQueue();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const submitOrder = async () => {
    if (!order || !selectedSession) return;

    const correctedFields = {
      ...draft,
      recipientCity: hiddenDraftValue(order, 'recipientCity'),
      COD: draft.total || hiddenDraftValue(order, 'COD'),
      shippingFeePrinted: draft.shippingFeePrinted || hiddenDraftValue(order, 'shippingFeePrinted'),
    };

    setMessage('');
    const response = await fetch(`/api/orders/${order.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correctedFields }),
    });
    const data = await response.json();

    if (!response.ok) {
      const details = formatErrorDetails(data.details);
      setMessage(details ? `${data.error || 'Submit failed'}: ${details}` : data.error || 'Submit failed');
      return;
    }

    if (data.remainingInSession === 0) {
      setSelectedSession(null);
      setCurrentOrderIndex(0);
      await loadQueue();
      setMessage('Session completed.');
      return;
    }

    await loadSession(selectedSession.id, currentOrderIndex);
    setMessage('Order submitted. Next receipt loaded.');
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4">
        <p className="text-sm font-medium text-[#17365F]">Loading review queue...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
          <div>
            <h1 className="text-xl font-bold text-[#17365F]">Review queue</h1>
          </div>
          <Link className="text-sm font-medium text-[#17365F]" href="/">
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-2">
        {!selectedSession ? (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {queue.length === 0 ? (
              <p className="p-5 text-sm font-medium text-slate-600">No ready sessions.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {queue.map((merchant) => (
                  <div className="p-4" key={merchant.wpUserId}>
                    <h2 className="text-base font-bold text-[#17365F]">{merchant.name}</h2>
                    <div className="mt-3 grid gap-2">
                      {merchant.sessions.map((session) => (
                        <button
                          className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
                          key={session.id}
                          onClick={() => loadSession(session.id)}
                          type="button"
                        >
                          <span>
                            <span className="block text-sm font-semibold text-slate-800">
                              {session.orderCount} orders
                            </span>
                            <span className="block text-xs text-slate-500">
                              {new Date(session.createdAt).toLocaleString()}
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-[#F27321]">Open</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#17365F]">
                    {selectedSession.merchant.name}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Order {currentOrderIndex + 1} of {pendingOrders.length}
                  </p>
                </div>
                <button
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                  onClick={() => setSelectedSession(null)}
                  type="button"
                >
                  Back
                </button>
              </div>

              {order ? (
                <div className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-950">
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    <button
                      className="h-8 rounded bg-white/90 px-3 text-sm font-bold text-[#17365F]"
                      onClick={() => changeImageZoom(0.25)}
                      type="button"
                    >
                      +
                    </button>
                    <button
                      className="h-8 rounded bg-white/90 px-3 text-sm font-bold text-[#17365F]"
                      onClick={() => changeImageZoom(-0.25)}
                      type="button"
                    >
                      -
                    </button>
                    <button
                      className="h-8 rounded bg-white/90 px-3 text-xs font-bold text-[#17365F]"
                      onClick={resetImageView}
                      type="button"
                    >
                      Reset
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Receipt"
                    className={`max-h-[62vh] min-h-[420px] w-full touch-none bg-slate-950 object-contain ${
                      imageZoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                    }`}
                    onPointerDown={(event) => {
                      if (imageZoom === 1) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        x: event.clientX,
                        y: event.clientY,
                        panX: imagePan.x,
                        panY: imagePan.y,
                      };
                    }}
                    onPointerMove={(event) => {
                      if (!dragRef.current) return;
                      setImagePan({
                        x: dragRef.current.panX + event.clientX - dragRef.current.x,
                        y: dragRef.current.panY + event.clientY - dragRef.current.y,
                      });
                    }}
                    onPointerUp={() => {
                      dragRef.current = null;
                    }}
                    onWheel={(event) => {
                      event.preventDefault();
                      changeImageZoom(event.deltaY < 0 ? 0.25 : -0.25);
                    }}
                    src={order.photoUrl}
                    style={{
                      transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
                      transformOrigin: 'center',
                    }}
                  />
                </div>
              ) : (
                <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                  No unsubmitted orders in this session.
                </p>
              )}
            </div>

            {order && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid gap-2 md:grid-cols-[repeat(25,minmax(0,1fr))]">
                  {reviewFields.map(([key, label]) => {
                    const fieldConfidence = confidenceForField(order.aiFields, key);
                    const validationFlag = validationFlagsFromFields(order.aiFields).find(
                      (flag) => flag.field === key
                    );
                    const needsAttention =
                      Boolean(validationFlag) || (fieldConfidence != null && fieldConfidence < 0.75);

                    return (
                    <label
                      className={reviewFieldClass(key)}
                      key={key}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
                        <span>{label}</span>
                        {(fieldConfidence != null || validationFlag) && (
                          <span className={needsAttention ? 'text-amber-700' : 'text-slate-400'}>
                            {validationFlag ? validationFlag.severity : `${Math.round(fieldConfidence! * 100)}%`}
                          </span>
                        )}
                      </span>
                      <input
                        list={key === 'recipientGovernorate' ? 'egypt-governorates' : undefined}
                        className={`mt-1 h-10 w-full rounded-md border px-3 text-base font-medium text-[#17365F] outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20 ${
                          needsAttention ? 'border-amber-300 bg-amber-50' : 'border-slate-300'
                        }`}
                        placeholder={key === 'recipientGovernorate' ? 'Type to search governorate' : undefined}
                        value={draft[key] || ''}
                        inputMode={
                          key === 'recipientPhone' || key === 'price' || key === 'shippingFeePrinted' || key === 'total'
                            ? 'numeric'
                            : undefined
                        }
                        maxLength={key === 'recipientPhone' ? 11 : undefined}
                        pattern={key === 'recipientPhone' ? '01[0-9]{9}' : undefined}
                        onChange={(event) => {
                          const value =
                            key === 'recipientPhone'
                              ? event.target.value.replace(/\D/g, '').slice(0, 11)
                              : key === 'price' || key === 'shippingFeePrinted' || key === 'total'
                                ? formatMoneyInput(event.target.value)
                              : key === 'recipientGovernorate'
                                ? normalizeEgyptGovernorate(event.target.value)
                              : event.target.value;

                          const nextPricingMode =
                            key === 'total' ? 'fromTotal' : key === 'price' ? 'sum' : pricingMode;

                          if (key === 'price' || key === 'total') {
                            setPricingMode(nextPricingMode);
                          }

                          setDraft((current) => {
                            const next = { ...current, [key]: value };

                            if (key === 'price') {
                              next.total = calculateTotal(next.price, next.shippingFeePrinted);
                            } else if (key === 'total') {
                              next.price = calculatePrice(next.total, next.shippingFeePrinted);
                            } else if (key === 'shippingFeePrinted') {
                              if (nextPricingMode === 'fromTotal') {
                                next.price = calculatePrice(next.total, next.shippingFeePrinted);
                              } else {
                                next.total = calculateTotal(next.price, next.shippingFeePrinted);
                              }
                            }

                            return next;
                          });
                        }}
                      />
                      {key === 'recipientGovernorate' && (
                        <datalist id="egypt-governorates">
                          {egyptGovernorates.map((governorate) => (
                            <option key={governorate} value={governorate} />
                          ))}
                        </datalist>
                      )}
                    </label>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <button
                    className="h-11 w-full rounded-md bg-[#17365F] px-4 text-sm font-semibold text-white hover:bg-[#102947]"
                    onClick={submitOrder}
                    type="button"
                  >
                    Submit shipment
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {message && (
          <p className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
