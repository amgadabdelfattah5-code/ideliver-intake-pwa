'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type FieldValue = string | number | boolean | null;
type AiFields = Record<string, FieldValue>;

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
  ['shippingFeePrinted', 'Printed shipping fee'],
  ['COD', 'COD'],
];

function fieldsToDraft(fields: AiFields | null): Record<string, string> {
  const draft: Record<string, string> = {};

  for (const [key] of reviewFields) {
    const value = fields?.[key];
    draft[key] = value == null ? '' : String(value);
  }

  return draft;
}

export default function ReviewPage() {
  const [queue, setQueue] = useState<QueueMerchant[]>([]);
  const [selectedSession, setSelectedSession] = useState<ReviewSession | null>(null);
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const pendingOrders = useMemo(
    () => selectedSession?.orders.filter((order) => order.status !== 'submitted') ?? [],
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
    const openOrders = session.orders.filter((item) => item.status !== 'submitted');
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

    setMessage('');
    const response = await fetch(`/api/orders/${order.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correctedFields: draft }),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || 'Submit failed');
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
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
                <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Receipt" className="max-h-[70vh] w-full object-contain" src={order.photoUrl} />
                </div>
              ) : (
                <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                  No unsubmitted orders in this session.
                </p>
              )}
            </div>

            {order && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">AI confidence</p>
                  <p className="mt-1 text-2xl font-bold text-[#17365F]">
                    {order.confidence == null ? 'N/A' : `${Math.round(order.confidence * 100)}%`}
                  </p>
                </div>

                <div className="space-y-3">
                  {reviewFields.map(([key, label]) => (
                    <label className="block" key={key}>
                      <span className="text-sm font-semibold text-slate-700">{label}</span>
                      <input
                        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
                        value={draft[key] || ''}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, [key]: event.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
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

                <button
                  className="mt-3 h-12 w-full rounded-md bg-[#17365F] px-4 text-sm font-semibold text-white hover:bg-[#102947]"
                  onClick={submitOrder}
                  type="button"
                >
                  Submit shipment
                </button>
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
