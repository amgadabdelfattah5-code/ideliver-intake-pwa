'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface DriverOrder {
  orderId: number;
  tracking: string;
  status: string;
  customerName: string;
  customerPhone: string;
  address: string;
  total: string;
  merchantWpUserId?: number;
  merchantName: string;
  merchantIdentityLabel?: string;
}

type StaffRole = 'admin' | 'pickup' | 'data_entry' | 'driver';

function normalizePhone(p: string | null | undefined): string {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  if (digits.startsWith('0020')) return '0' + digits.slice(4);
  if (digits.length === 12 && digits.startsWith('20')) return '0' + digits.slice(2);
  return digits;
}

const STATUS_LABELS: Record<string, string> = {
  'shipment-rec': 'استلمت الشحنة',
  'shipped': 'قيد التوصيل',
  'delivered': 'تم التوصيل',
  'on-hold': 'قيد الانتظار',
  'postponed': 'مؤجل',
  'cancelled': 'ملغي',
  'failed': 'فشل التوصيل',
  'returned-full': 'مرتجع كامل',
  'returned-partial': 'مرتجع جزئي',
  'refunded': 'مرتجع (محصل شحن)',
  'refunded-merchant': 'مرتجع (شحن على التاجر)',
  'refund-ship': 'مرتجع (شحن محصل)',
  'completed': 'تم التوريد للتاجر',
  'merchant-paid': 'تم التحويل للتاجر',
  'merchant-sup': 'تم التوريد للتاجر',
  'delivered-wallet': 'تم التوصيل (محول محفظة)',
  'sh-val-transfer': 'تم تحويل قيمة الشحن فقط',
  'value-transferred': 'تم تحويل قيمة الشحنة',
  'pending': 'قيد الانتظار (دفع)',
  'processing': 'قيد المعالجة',
  'checkout-draft': 'مسودة',
};
const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;

export default function DriverOrdersPage() {
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);
  const [sessionRole, setSessionRole] = useState<StaffRole | null>(null);
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const qPhone = normalizePhone(q);
    return orders.filter((order) => {
      const identityLabel = (order.merchantIdentityLabel || '').toLowerCase();
      const merchantName = (order.merchantName || '').toLowerCase();
      const phone = normalizePhone(order.customerPhone);
      return (
        String(order.orderId).includes(q) ||
        identityLabel.includes(q) ||
        merchantName.includes(q) ||
        (qPhone.length >= 3 && phone.includes(qPhone))
      );
    });
  }, [query, orders]);

  const merchants = useMemo(() => {
    const groups = new Map<
      number,
      { wpUserId: number; name: string; identityLabel: string; orders: DriverOrder[] }
    >();

    for (const order of orders) {
      const wpUserId = order.merchantWpUserId || 0;
      const group = groups.get(wpUserId);
      if (group) {
        group.orders.push(order);
      } else {
        groups.set(wpUserId, {
          wpUserId,
          name: wpUserId === 0 ? 'بدون تاجر' : order.merchantName || `تاجر #${wpUserId}`,
          identityLabel: wpUserId === 0 ? '' : (order.merchantIdentityLabel || order.merchantName || `تاجر #${wpUserId}`),
          orders: [order],
        });
      }
    }

    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [orders]);

  const selectedMerchant =
    selectedMerchantId === null
      ? null
      : merchants.find((merchant) => merchant.wpUserId === selectedMerchantId) ?? null;

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSessionRole(data?.user?.role ?? null))
      .catch(() => setSessionRole(null));

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
        {(sessionRole === 'admin' || sessionRole === 'data_entry') && (
          <div className="mb-4 flex justify-end">
            <Link
              className="idv-button idv-button-light idv-button-small text-sm"
              href="/driver/bulk"
            >
              عرض كجدول (لتحديث عدة طلبات دفعة واحدة)
            </Link>
          </div>
        )}

        {loading && <p className="text-sm font-medium">جاري تحميل الطلبات...</p>}

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        {!selectedMerchant && (
          <div className="mb-4 flex gap-2">
            <input
              aria-label="بحث عن طلب"
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#17365F] placeholder:text-slate-400 focus:border-[#F27321] focus:outline-none"
              dir="rtl"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث برقم الطلب أو التاجر أو الهاتف"
              type="text"
              value={query}
            />
            {query && (
              <button
                aria-label="مسح البحث"
                className="idv-button idv-button-light idv-button-small shrink-0 text-sm"
                onClick={() => setQuery('')}
                type="button"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {!selectedMerchant && !loading && !error && searchResults !== null && (
          <div className="space-y-2">
            {searchResults.length === 0 && (
              <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600 shadow-sm">
                لا توجد نتائج.
              </p>
            )}
            {searchResults.map((order) => (
              <Link
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#F27321]"
                href={`/driver/${order.orderId}`}
                key={order.orderId}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{order.orderId}</p>
                    <p className="mt-1 text-sm font-semibold text-[#F27321]">
                      {order.merchantIdentityLabel || order.merchantName || 'بدون تاجر'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{order.customerPhone}</p>
                  </div>
                  <span className="rounded-full bg-[#17365F]/10 px-3 py-1 text-xs font-bold">
                    {statusLabel(order.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && !error && orders.length === 0 && searchResults === null && (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-medium text-slate-600 shadow-sm">
            لا توجد طلبات مُسندة إليك حالياً.
          </p>
        )}

        {!loading && !error && orders.length > 0 && !selectedMerchant && searchResults === null && (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
            {merchants.map((merchant) => (
              <div className="flex items-center gap-3 p-4" key={merchant.wpUserId}>
                <div className="flex-1">
                  <h2 className="text-base font-bold text-[#17365F]">
                    {merchant.identityLabel || merchant.name}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {merchant.orders.length} طلب
                  </p>
                </div>
                <button
                  className="idv-button idv-button-light idv-button-small shrink-0 text-sm"
                  onClick={() => setSelectedMerchantId(merchant.wpUserId)}
                  type="button"
                >
                  فتح
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedMerchant && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div>
                <h2 className="text-lg font-bold text-[#17365F]">
                  {selectedMerchant.identityLabel || selectedMerchant.name}
                </h2>
                <p className="text-sm text-slate-500">{selectedMerchant.orders.length} طلب</p>
              </div>
              <button
                className="idv-button idv-button-light idv-button-small text-sm"
                onClick={() => {
                  setSelectedMerchantId(null);
                  setQuery('');
                }}
                type="button"
              >
                رجوع
              </button>
            </div>

            <div className="grid gap-3">
              {selectedMerchant.orders.map((order) => (
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
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{order.customerPhone}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{order.address}</p>
                  <p className="mt-2 text-sm font-bold">{order.total} EGP</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
