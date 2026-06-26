'use client';

import { useState, useEffect } from 'react';

interface QueueResponse {
  success: boolean;
  merchants: Array<{
    wpUserId: number;
    merchantId: string;
    name: string;
    sessions: Array<{
      id: string;
      photoCount: number;
      orderCount: number;
      createdAt: string;
    }>;
  }>;
}

interface SessionResponse {
  success: boolean;
  session: {
    id: string;
    status: string;
    merchant: { name: string };
    orders: Array<{
      id: string;
      sequence: number;
      photoUrl: string;
      aiFields: any;
      confidence: number;
      status: string;
    }>;
  };
}

export default function ReviewPage() {
  const [queue, setQueue] = useState<QueueResponse['merchants'] | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionResponse['session'] | null>(null);
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);

  // Load queue on mount
  useEffect(() => {
    fetch('/api/review/queue')
      .then((r) => r.json())
      .then((data) => setQueue(data.merchants));
  }, []);

  const loadSession = async (sessionId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/details`);
    const data = await res.json();
    setSelectedSession(data.session);
    setCurrentOrderIndex(0);
  };

  const submitOrder = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correctedFields: selectedSession!.orders[0].aiFields }),
    });
    const data = await res.json();
    if (data.success) {
      // Reload session to get updated orders
      await loadSession(selectedSession!.id);
      if (data.remainingInSession === 0) {
        setQueue(null);
        setSelectedSession(null);
      }
    }
  };

  if (!queue) return <div className="p-4">Loading...</div>;

  if (!selectedSession) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold mb-4">📋 Review Queue</h1>
          {queue.length === 0 ? (
            <p className="text-gray-500">No pending sessions</p>
          ) : (
            <ul className="space-y-2">
              {queue.map((m) => (
                <li key={m.wpUserId} className="bg-white p-4 rounded shadow">
                  <p className="font-medium">{m.name}</p>
                  <ul className="ml-4 mt-2 text-sm text-gray-600">
                    {m.sessions.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => loadSession(s.id)}
                          className="text-blue-600 underline"
                        >
                          {s.orderCount} orders ({s.photoCount} photos)
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const order = selectedSession.orders[currentOrderIndex];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto flex gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold mb-4">📦 Review: {selectedSession.merchant.name}</h1>
          <p className="text-sm text-gray-600 mb-4">
            Order {currentOrderIndex + 1} of {selectedSession.orders.length}
          </p>

          {order && (
            <div className="bg-white p-4 rounded shadow">
              <div className="mb-4">
                <img src={order.photoUrl} alt="Order" className="w-48 h-48 object-cover rounded" />
              </div>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                {JSON.stringify(order.aiFields, null, 2)}
              </pre>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => submitOrder(order.id)}
                  className="bg-blue-600 text-white px-4 py-2 rounded"
                >
                  ✓ Submit
                </button>
                <button
                  onClick={() => setCurrentOrderIndex((i) => Math.min(i + 1, selectedSession.orders.length - 1))}
                  disabled={currentOrderIndex === selectedSession.orders.length - 1}
                  className="bg-gray-200 px-4 py-2 rounded disabled:opacity-50"
                >
                  Skip →
                </button>
                <button
                  onClick={() => {
                    setSelectedSession(null);
                    setQueue(null);
                  }}
                  className="bg-gray-200 px-4 py-2 rounded"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
