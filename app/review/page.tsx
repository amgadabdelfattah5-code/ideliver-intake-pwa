'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

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
  ['recipientPhone', 'Phone'],
  ['recipientAddress', 'Address'],
  ['recipientGovernorate', 'Governorate'],
  ['product', 'Product'],
  ['price', 'Price'],
  ['notes', 'Notes'],
];

function fieldsToDraft(fields: AiFields | null): Record<string, string> {
  const draft: Record<string, string> = {};

  for (const [key] of reviewFields) {
    const value = key === 'price' ? fields?.shippingFeePrinted ?? fields?.price : fields?.[key];
    draft[key] = value == null ? '' : String(value);
  }

  return draft;
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

export default function ReviewPage() {
  const [queue, setQueue] = useState<QueueMerchant[]>([]);
  const [selectedSession, setSelectedSession] = useState<ReviewSession | null>(null);
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const pendingOrders = useMemo(
    () =>
      selectedSession?.orders.filter(
        (order) => order.status !== 'submitted' && order.status !== 'awaiting_merchant'
      ) ?? [],
    [selectedSession]
  );
  const order = pendingOrders[currentOrderIndex];

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
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQueue();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const selectPendingOrder = (index: number) => {
    const nextOrder = pendingOrders[index];
    setCurrentOrderIndex(index);
    setDraft(fieldsToDraft(nextOrder?.correctedFields || nextOrder?.aiFields || null));
  };

  const submitOrder = async () => {
    if (!order || !selectedSession) return;

    const correctedFields = {
      ...draft,
      recipientCity: hiddenDraftValue(order, 'recipientCity'),
      COD: hiddenDraftValue(order, 'COD'),
      shippingFeePrinted: draft.price || hiddenDraftValue(order, 'shippingFeePrinted'),
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

  const markAwaitingMerchant = async () => {
    if (!order || !selectedSession) return;

    setMessage('');
    const response = await fetch(`/api/orders/${order.id}/awaiting-merchant`, {
      method: 'POST',
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || 'Could not mark order awaiting merchant reply');
      return;
    }

    await loadSession(selectedSession.id, currentOrderIndex);
    setMessage('Order marked awaiting merchant reply.');
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#F27321]">Laptop flow</p>
            <h1 className="text-xl font-bold text-[#17365F]">Review queue</h1>
          </div>
          <Link className="text-sm font-medium text-[#17365F]" href="/">
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5">
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
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#17365F]">
                    {selectedSession.merchant.name}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Order {currentOrderIndex + 1} of {pendingOrders.length}
                  </p>
                </div>
                <button
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                  onClick={() => setSelectedSession(null)}
                  type="button"
                >
                  Back
                </button>
              </div>

              {order ? (
                <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Receipt"
                    className="max-h-[76vh] min-h-[520px] w-full bg-slate-950 object-contain"
                    src={order.photoUrl}
                  />
                </div>
              ) : (
                <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                  No unsubmitted orders in this session.
                </p>
              )}
            </div>

            {order && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3">
                  {reviewFields.map(([key, label]) => {
                    const fieldConfidence = confidenceForField(order.aiFields, key);
                    const validationFlag = validationFlagsFromFields(order.aiFields).find(
                      (flag) => flag.field === key
                    );
                    const needsAttention =
                      Boolean(validationFlag) || (fieldConfidence != null && fieldConfidence < 0.75);

                    return (
                    <label
                      className={key === 'recipientAddress' || key === 'notes' ? 'block md:col-span-3' : 'block'}
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
                        className={`mt-1 h-11 w-full rounded-md border px-3 text-base font-medium text-[#17365F] outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20 ${
                          needsAttention ? 'border-amber-300 bg-amber-50' : 'border-slate-300'
                        }`}
                        value={draft[key] || ''}
                        inputMode={key === 'recipientPhone' ? 'numeric' : undefined}
                        maxLength={key === 'recipientPhone' ? 11 : undefined}
                        pattern={key === 'recipientPhone' ? '01[0-9]{9}' : undefined}
                        onChange={(event) => {
                          const value =
                            key === 'recipientPhone'
                              ? event.target.value.replace(/\D/g, '').slice(0, 11)
                              : event.target.value;

                          setDraft((current) => ({ ...current, [key]: value }));
                        }}
                      />
                    </label>
                    );
                  })}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    className="h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    disabled={currentOrderIndex === 0}
                    onClick={() => selectPendingOrder(Math.max(currentOrderIndex - 1, 0))}
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    className="h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    disabled={currentOrderIndex >= pendingOrders.length - 1}
                    onClick={() =>
                      selectPendingOrder(Math.min(currentOrderIndex + 1, pendingOrders.length - 1))
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
                  <button
                    className="h-12 rounded-md bg-[#17365F] px-4 text-sm font-semibold text-white hover:bg-[#102947]"
                    onClick={submitOrder}
                    type="button"
                  >
                    Submit shipment
                  </button>

                  <button
                    className="h-12 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                    onClick={markAwaitingMerchant}
                    type="button"
                  >
                    Awaiting merchant reply
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
