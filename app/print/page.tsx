'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { barcodeValueForOrder, encodeCode39 } from '@/lib/barcode';

type Fields = Record<string, unknown>;

interface PrintQueueMerchant {
  id: string;
  wpUserId: number;
  merchantId: string;
  name: string;
  orderCount: number;
}

interface PrintOrder {
  orderId: string;
  shipmentId: string | null;
  submittedAt: string | null;
  merchant: string;
  correctedFields: Fields | null;
}

function f(fields: Fields | null, key: string): string {
  const v = fields?.[key];
  return v == null ? '' : String(v);
}

function money(v: string): string {
  const n = Number((v || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('en-US') : '';
}

const STICKER_FIELDS = {
  orderNumber: (o: PrintOrder) => o.shipmentId || '',
  merchant: (o: PrintOrder) => o.merchant,
  recipientName: (o: PrintOrder) => f(o.correctedFields, 'recipientName'),
  recipientPhone: (o: PrintOrder) => f(o.correctedFields, 'recipientPhone'),
  governorate: (o: PrintOrder) => f(o.correctedFields, 'recipientGovernorate'),
  address: (o: PrintOrder) => f(o.correctedFields, 'recipientAddress'),
  productPrice: (o: PrintOrder) => money(f(o.correctedFields, 'price')),
  shippingFee: (o: PrintOrder) => money(f(o.correctedFields, 'shippingFeePrinted')),
  total: (o: PrintOrder) => money(f(o.correctedFields, 'COD')),
  notes: (o: PrintOrder) => f(o.correctedFields, 'notes'),
};

function Barcode({ value }: { value: string }) {
  const rects = useMemo(() => {
    const bars = encodeCode39(value);
    const totalUnits = bars.reduce((s, b) => s + b.width, 0);
    const unit = 100 / totalUnits;
    let cursor = 0;
    const out: Array<{ x: number; w: number; key: number }> = [];

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const w = bar.width * unit;
      if (bar.fill) out.push({ x: cursor, w, key: i });
      cursor += w;
    }
    return out;
  }, [value]);

  return (
    <svg
      className="idv-barcode"
      viewBox={`0 0 100 40`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`باركود ${value}`}
      role="img"
    >
      {rects.map((r) => (
        <rect fill="#000" height="32" key={r.key} width={r.w} x={r.x} y="0" />
      ))}
      <text
        x="50"
        y="39"
        fontSize="5"
        textAnchor="middle"
        fontFamily="monospace"
        fill="#000"
      >
        {value}
      </text>
    </svg>
  );
}

function Sticker({ order }: { order: PrintOrder }) {
  const orderNumber = STICKER_FIELDS.orderNumber(order);
  const barcodeValue = barcodeValueForOrder(orderNumber);

  return (
    <div className="idv-sticker" data-sticker>
      <div className="idv-sticker-brand">iDeliver Egypt</div>

      <div className="idv-sticker-row idv-sticker-row-2">
        <div>
          <span className="idv-sticker-label">رقم الطلب</span>
          <span className="idv-sticker-value idv-sticker-value-mono">{orderNumber || '—'}</span>
        </div>
        <div>
          <span className="idv-sticker-label">التاجر</span>
          <span className="idv-sticker-value">{STICKER_FIELDS.merchant(order)}</span>
        </div>
      </div>

      <div className="idv-sticker-section">
        <div className="idv-sticker-section-title">المستلم</div>
        <div className="idv-sticker-value idv-sticker-value-lg">{STICKER_FIELDS.recipientName(order) || '—'}</div>
        <div className="idv-sticker-value idv-sticker-value-mono idv-sticker-value-lg">
          {STICKER_FIELDS.recipientPhone(order) || '—'}
        </div>
        <div className="idv-sticker-value">{STICKER_FIELDS.governorate(order)}</div>
        {STICKER_FIELDS.address(order) && (
          <div className="idv-sticker-value">{STICKER_FIELDS.address(order)}</div>
        )}
      </div>

      <div className="idv-sticker-row idv-sticker-row-3">
        <div>
          <span className="idv-sticker-label">سعر المنتج</span>
          <span className="idv-sticker-value">{STICKER_FIELDS.productPrice(order) || '0'}</span>
        </div>
        <div>
          <span className="idv-sticker-label">الشحن</span>
          <span className="idv-sticker-value">{STICKER_FIELDS.shippingFee(order) || '0'}</span>
        </div>
        <div>
          <span className="idv-sticker-label">الإجمالي</span>
          <span className="idv-sticker-value idv-sticker-value-bold">
            {STICKER_FIELDS.total(order) || '0'}
          </span>
        </div>
      </div>

      {STICKER_FIELDS.notes(order) && (
        <div className="idv-sticker-section">
          <div className="idv-sticker-section-title">ملاحظات</div>
          <div className="idv-sticker-value">{STICKER_FIELDS.notes(order)}</div>
        </div>
      )}

      <div className="idv-sticker-barcode">
        <Barcode value={barcodeValue} />
      </div>
    </div>
  );
}

export default function PrintPage() {
  const [merchants, setMerchants] = useState<PrintQueueMerchant[]>([]);
  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [activeMerchant, setActiveMerchant] = useState<PrintQueueMerchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PrintOrder | null>(null);
  const [printQueue, setPrintQueue] = useState<PrintOrder[]>([]);
  const [busy, setBusy] = useState(false);

  const loadMerchants = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/print/queue');
    const data = await res.json();
    setMerchants(data.merchants || []);
    setLoading(false);
  }, []);

  const loadOrders = useCallback(async (merchantLocalId: string) => {
    setLoading(true);
    setSelected(new Set());
    const res = await fetch(`/api/print/queue?merchantId=${encodeURIComponent(merchantLocalId)}`);
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // ponytail: defer to a macrotask, mirroring app/review/page.tsx, to avoid
    // the cascading-render lint rule firing on synchronous setState in effect.
    const timer = window.setTimeout(() => {
      void loadMerchants();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMerchants]);

  const triggerPrint = (toPrint: PrintOrder[]) => {
    if (toPrint.length === 0) return;
    setPrintQueue(toPrint);
    // ponytail: defer to next frame so #print-root has the new children before
    // the browser snapshots for printing. requestAnimationFrame is enough.
    requestAnimationFrame(() => window.print());
  };

  const removeFromQueue = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    const confirmed = window.confirm(
      orderIds.length === 1
        ? 'حذف هذا الطلب من قائمة الطباعة؟'
        : `حذف ${orderIds.length} طلب من قائمة الطباعة؟`
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/print/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'فشل الحذف من القائمة');
        return;
      }
      setMessage(`تم حذف ${orderIds.length} طلب من قائمة الطباعة.`);

      if (activeMerchant) {
        await loadOrders(activeMerchant.id);
        // If the merchant now has no orders, refresh merchant list too.
        const stillHas = orders.length - orderIds.length > 0;
        if (!stillHas) {
          setActiveMerchant(null);
          await loadMerchants();
        }
      } else {
        await loadMerchants();
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(orders.map((o) => o.orderId)));
  };

  const selectedOrders = orders.filter((o) => selected.has(o.orderId));
  const noneSelected = selected.size === 0;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4">
        <p className="text-sm font-medium text-[#17365F]">جاري تحميل قائمة الطباعة...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
          <div>
            <h1 className="text-xl font-bold text-[#17365F]">قائمة الطباعة</h1>
            {activeMerchant && (
              <p className="text-sm text-slate-500">{activeMerchant.name}</p>
            )}
          </div>
          <div className="flex gap-3">
            {activeMerchant && (
              <button
                className="idv-button idv-button-light idv-button-small text-sm"
                onClick={() => {
                  setActiveMerchant(null);
                  setOrders([]);
                  setSelected(new Set());
                  void loadMerchants();
                }}
                type="button"
              >
                رجوع
              </button>
            )}
            <Link className="text-sm font-medium text-[#17365F]" href="/">
              الرئيسية
            </Link>
          </div>
        </div>
      </header>

      <section className="no-print mx-auto max-w-6xl px-4 py-2">
        {!activeMerchant ? (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {merchants.length === 0 ? (
              <p className="p-5 text-sm font-medium text-slate-600">
                لا توجد طلبات بانتظار الطباعة.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {merchants.map((m) => (
                  <li
                    className="flex items-center justify-between gap-3 p-4"
                    key={m.merchantId}
                  >
                    <div>
                      <h2 className="text-base font-bold text-[#17365F]">{m.name}</h2>
                      <p className="text-sm text-slate-500">
                        {m.orderCount} {m.orderCount === 1 ? 'طلب' : 'طلبات'} بانتظار الطباعة
                      </p>
                    </div>
                    <button
                      className="idv-button idv-button-light idv-button-small text-sm"
                      onClick={() => {
                        setActiveMerchant(m);
                        void loadOrders(m.id);
                      }}
                      type="button"
                    >
                      فتح
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
              <button
                className="idv-button idv-button-light idv-button-small text-sm"
                onClick={selectAll}
                type="button"
              >
                {selected.size === orders.length && orders.length > 0 ? 'إلغاء التحديد' : 'تحديد الكل'}
              </button>
              <button
                className="idv-button idv-button-small text-sm"
                style={{
                  background: noneSelected ? undefined : '#16a34a',
                  color: noneSelected ? undefined : '#ffffff',
                }}
                disabled={noneSelected}
                onClick={() => triggerPrint(selectedOrders)}
                type="button"
              >
                طباعة المحدد ({selected.size})
              </button>
              <button
                className="idv-button idv-button-light idv-button-small text-sm"
                style={{
                  background: noneSelected ? undefined : '#dc2626',
                  color: noneSelected ? undefined : '#ffffff',
                  borderColor: noneSelected ? undefined : '#dc2626',
                }}
                disabled={noneSelected || busy}
                onClick={() => removeFromQueue(selectedOrders.map((o) => o.orderId))}
                type="button"
              >
                حذف المحدد ({selected.size})
              </button>
            </div>

            {orders.length === 0 ? (
              <p className="p-5 text-sm font-medium text-slate-600">
                لا توجد طلبات بانتظار الطباعة لهذا التاجر.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2 w-10"></th>
                      <th className="px-3 py-2">رقم الطلب</th>
                      <th className="px-3 py-2">اسم التاجر</th>
                      <th className="px-3 py-2">اسم المستلم</th>
                      <th className="px-3 py-2">رقم الهاتف</th>
                      <th className="px-3 py-2">المحافظة</th>
                      <th className="px-3 py-2">سعر المنتج</th>
                      <th className="px-3 py-2">مصاريف الشحن</th>
                      <th className="px-3 py-2">ملاحظات</th>
                      <th className="px-3 py-2">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((order) => (
                      <tr key={order.orderId}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 accent-[#F27321]"
                            checked={selected.has(order.orderId)}
                            onChange={() => toggleSelect(order.orderId)}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[#17365F]">
                          {STICKER_FIELDS.orderNumber(order) || '—'}
                        </td>
                        <td className="px-3 py-2">{STICKER_FIELDS.merchant(order)}</td>
                        <td className="px-3 py-2">{STICKER_FIELDS.recipientName(order) || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {STICKER_FIELDS.recipientPhone(order) || '—'}
                        </td>
                        <td className="px-3 py-2">{STICKER_FIELDS.governorate(order)}</td>
                        <td className="px-3 py-2">{STICKER_FIELDS.productPrice(order) || '0'}</td>
                        <td className="px-3 py-2">{STICKER_FIELDS.shippingFee(order) || '0'}</td>
                        <td className="px-3 py-2 max-w-[14rem] truncate text-slate-500">
                          {STICKER_FIELDS.notes(order) || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              className="idv-button idv-button-light idv-button-small text-xs"
                              onClick={() => triggerPrint([order])}
                              type="button"
                            >
                              طباعة
                            </button>
                            <button
                              className="idv-button idv-button-light idv-button-small text-xs"
                              onClick={() => setPreview(order)}
                              type="button"
                            >
                              معاينة الاستيكر
                            </button>
                            <button
                              className="idv-button idv-button-light idv-button-small text-xs"
                              style={{ color: '#dc2626' }}
                              disabled={busy}
                              onClick={() => removeFromQueue([order.orderId])}
                              type="button"
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

      {preview && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[92vh] overflow-auto rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[#17365F]">معاينة الاستيكر</h3>
              <div className="flex gap-2">
                <button
                  className="idv-button idv-button-small text-sm"
                  onClick={() => triggerPrint([preview])}
                  type="button"
                >
                  طباعة
                </button>
                <button
                  className="idv-button idv-button-light idv-button-small text-sm"
                  onClick={() => setPreview(null)}
                  type="button"
                >
                  إغلاق
                </button>
              </div>
            </div>
            <Sticker order={preview} />
          </div>
        </div>
      )}

      {/* Print-only mount. Hidden on screen via inline display:none; unhidden by @media print. */}
      <div id="print-root" style={{ display: 'none' }}>
        {printQueue.map((order) => (
          <Sticker key={order.orderId} order={order} />
        ))}
      </div>
    </main>
  );
}
