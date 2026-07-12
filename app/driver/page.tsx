'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface DriverOrder {
  orderId: number;
  tracking: string;
  status: string;
  customerName: string;
  customerPhone: string;
  address: string;
  total: string;
}

export default function DriverOrdersPage() {
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/driver/orders')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'تعذّر تحميل الطلبات');
        setOrders(data.orders || []);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'تعذّر تحميل الطلبات');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-[#17365F]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#F27321]">iDeliver Egypt</p>
            <h1 className="text-xl font-bold">طلباتي</h1>
          </div>
          <Link className="idv-button idv-button-light idv-button-small text-sm" href="/">
            الرئيسية
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-6">
        {loading && <p className="text-sm font-medium">جاري تحميل الطلبات...</p>}

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        {!loading && !error && orders.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-medium text-slate-600 shadow-sm">
            لا توجد طلبات مُسندة إليك حالياً.
          </p>
        )}

        <div className="grid gap-3">
          {orders.map((order) => (
            <Link
              className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#F27321]"
              href={`/driver/${order.orderId}`}
              key={order.orderId}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{order.tracking}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {order.customerName || 'عميل بدون اسم'}
                  </p>
                </div>
                <span className="rounded-full bg-[#17365F]/10 px-3 py-1 text-xs font-bold">
                  {order.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{order.customerPhone}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{order.address}</p>
              <p className="mt-2 text-sm font-bold">{order.total} EGP</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
