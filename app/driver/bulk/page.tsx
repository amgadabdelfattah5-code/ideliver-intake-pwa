'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

interface DriverOrder {
  orderId: number;
  tracking: string;
  status: string;
  customerName: string;
  merchantName: string;
}

interface DataEntry {
  price: string;
  shippingFeePrinted: string;
  total: string;
  notes: string;
}

interface GridRow {
  orderId: number;
  tracking: string;
  customerName: string;
  merchantName: string;
  currentStatus: string;
  selectedStatus: string;
  note: string;
  collectedPrice: string;
  collectedShippingFee: string;
  collectedTotal: string;
  collectedPricingMode: 'sum' | 'fromTotal';
  dataEntryFetchState: 'idle' | 'pending' | 'loaded' | 'failed';
  originalNote: string;
  amountsDirty: boolean;
  submitState: 'idle' | 'sending';
  error: string;
  message: string;
  messageSynced: boolean;
}

interface GridFilters {
  tracking: string;
  customerName: string;
  merchantName: string;
  currentStatus: string;
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

const initialFilters: GridFilters = {
  tracking: '',
  customerName: '',
  merchantName: '',
  currentStatus: '',
};

export default function DriverBulkPage() {
  const [rows, setRows] = useState<GridRow[]>([]);
  const [filters, setFilters] = useState<GridFilters>(initialFilters);
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'forbidden'>('checking');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const prefillOrderIds = useRef(new Set<number>());
  const sendingOrderIds = useRef(new Set<number>());

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const authResponse = await fetch('/api/auth/me');
        const authData = await authResponse.json();
        if (!authResponse.ok) throw new Error('تعذّر التحقق من الحساب');

        const role = authData.user?.role;
        if (role !== 'admin' && role !== 'data_entry') {
          if (!cancelled) setAccessState('forbidden');
          return;
        }

        if (cancelled) return;
        setAccessState('allowed');

        const ordersResponse = await fetch('/api/driver/orders');
        const ordersData = await ordersResponse.json();
        if (!ordersResponse.ok) {
          throw new Error(ordersData.error || 'تعذّر تحميل الطلبات');
        }

        if (cancelled) return;
        setRows(
          ((ordersData.orders || []) as DriverOrder[]).map((order) => {
            const currentStatusIsSelectable = statuses.some(
              (status) => status.value === order.status
            );

            return {
              orderId: order.orderId,
              tracking: order.tracking,
              customerName: order.customerName,
              merchantName: order.merchantName,
              currentStatus: order.status,
              selectedStatus: currentStatusIsSelectable ? order.status : '',
              note: '',
              collectedPrice: '',
              collectedShippingFee: '',
              collectedTotal: '',
              collectedPricingMode: 'sum',
              dataEntryFetchState: 'idle',
              originalNote: '',
              amountsDirty: false,
              submitState: 'idle',
              error: '',
              message: '',
              messageSynced: true,
            };
          })
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : 'تعذّر تحميل الطلبات'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRows();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    for (const row of rows) {
      if (
        row.dataEntryFetchState !== 'pending' ||
        prefillOrderIds.current.has(row.orderId)
      ) {
        continue;
      }

      prefillOrderIds.current.add(row.orderId);
      void (async () => {
        try {
          const response = await fetch(
            `/api/driver/orders/${encodeURIComponent(row.orderId)}`
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'prefill_failed');

          const dataEntry = (data.dataEntry ?? null) as DataEntry | null;
          setRows((previousRows) =>
            previousRows.map((currentRow) => {
              if (currentRow.orderId !== row.orderId) return currentRow;
              if (!dataEntry) {
                return { ...currentRow, dataEntryFetchState: 'loaded' };
              }

              return {
                ...currentRow,
                ...(currentRow.amountsDirty
                  ? {}
                  : {
                      collectedPrice: dataEntry.price,
                      collectedShippingFee: dataEntry.shippingFeePrinted,
                      collectedTotal: dataEntry.total,
                      collectedPricingMode: 'sum' as const,
                    }),
                dataEntryFetchState: 'loaded',
                originalNote: dataEntry.notes,
              };
            })
          );
        } catch {
          setRows((previousRows) =>
            previousRows.map((currentRow) =>
              currentRow.orderId === row.orderId
                ? { ...currentRow, dataEntryFetchState: 'failed' }
                : currentRow
            )
          );
        } finally {
          prefillOrderIds.current.delete(row.orderId);
        }
      })();
    }
  }, [rows]);

  const visibleRows = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, value.toLocaleLowerCase()])
    ) as Record<keyof GridFilters, string>;

    return rows.filter(
      (row) =>
        row.tracking.toLocaleLowerCase().includes(normalizedFilters.tracking) &&
        row.customerName.toLocaleLowerCase().includes(normalizedFilters.customerName) &&
        row.merchantName.toLocaleLowerCase().includes(normalizedFilters.merchantName) &&
        row.currentStatus.toLocaleLowerCase().includes(normalizedFilters.currentStatus)
    );
  }, [filters, rows]);

  function updateRow(orderId: number, update: (row: GridRow) => GridRow) {
    setRows((previousRows) =>
      previousRows.map((row) => (row.orderId === orderId ? update(row) : row))
    );
  }

  function requestPrefill(orderId: number) {
    setRows((previousRows) =>
      previousRows.map((row) => {
        if (
          row.orderId !== orderId ||
          (row.dataEntryFetchState !== 'idle' && row.dataEntryFetchState !== 'failed')
        ) {
          return row;
        }
        return { ...row, dataEntryFetchState: 'pending' };
      })
    );
  }

  function updatePrice(orderId: number, input: string) {
    updateRow(orderId, (row) => {
      const collectedPrice = formatMoneyInput(input);
      return {
        ...row,
        amountsDirty: true,
        collectedPricingMode: 'sum',
        collectedPrice,
        collectedTotal: calculateTotal(collectedPrice, row.collectedShippingFee),
      };
    });
  }

  function updateShippingFee(orderId: number, input: string) {
    updateRow(orderId, (row) => {
      const collectedShippingFee = formatMoneyInput(input);
      return {
        ...row,
        amountsDirty: true,
        collectedShippingFee,
        ...(row.collectedPricingMode === 'fromTotal'
          ? { collectedPrice: calculatePrice(row.collectedTotal, collectedShippingFee) }
          : { collectedTotal: calculateTotal(row.collectedPrice, collectedShippingFee) }),
      };
    });
  }

  function updateTotal(orderId: number, input: string) {
    updateRow(orderId, (row) => {
      const collectedTotal = formatMoneyInput(input);
      return {
        ...row,
        amountsDirty: true,
        collectedPricingMode: 'fromTotal',
        collectedTotal,
        collectedPrice: calculatePrice(collectedTotal, row.collectedShippingFee),
      };
    });
  }

  async function submitRow(row: GridRow) {
    if (sendingOrderIds.current.has(row.orderId)) return;
    if (!row.selectedStatus) {
      updateRow(row.orderId, (currentRow) => ({
        ...currentRow,
        error: 'يرجى اختيار الحالة',
      }));
      return;
    }

    sendingOrderIds.current.add(row.orderId);
    const submittedNote = row.note;
    const submittedStatus = row.selectedStatus;

    updateRow(row.orderId, (currentRow) => ({
      ...currentRow,
      submitState: 'sending',
      error: '',
      message: '',
    }));

    try {
      const response = await fetch('/api/driver/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: row.orderId,
          status: row.selectedStatus,
          reasonCode: 'not_provided',
          note: row.note || undefined,
          collectedPrice: row.collectedPrice || undefined,
          collectedShippingFee: row.collectedShippingFee || undefined,
          collectedTotal: row.collectedTotal || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        updateRow(row.orderId, (currentRow) => ({
          ...currentRow,
          error: data.error || 'تعذّر إرسال الزيارة',
        }));
        return;
      }

      updateRow(row.orderId, (currentRow) => ({
        ...currentRow,
        note: currentRow.note === submittedNote ? '' : currentRow.note,
        selectedStatus:
          currentRow.selectedStatus === submittedStatus ? '' : currentRow.selectedStatus,
        message: data.synced
          ? 'تم تسجيل الزيارة وتحديث حالة الشحنة بنجاح'
          : 'تم حفظ الزيارة محلياً، لكن تحديث حالة الشحنة لم يتم بعد — سيُعاد المحاولة لاحقاً',
        messageSynced: Boolean(data.synced),
      }));
    } catch {
      updateRow(row.orderId, (currentRow) => ({
        ...currentRow,
        error: 'تعذّر الاتصال بالخادم',
      }));
    } finally {
      sendingOrderIds.current.delete(row.orderId);
      updateRow(row.orderId, (currentRow) => ({
        ...currentRow,
        submitState: 'idle',
      }));
    }
  }

  if (accessState === 'forbidden') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 text-[#17365F]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="font-bold">غير متاح لهذا الحساب</p>
          <Link className="idv-button idv-button-light idv-button-small mt-4 text-sm" href="/driver">
            رجوع
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-[#17365F]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1900px] items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#F27321]">iDeliver Egypt</p>
            <h1 className="text-xl font-bold">تحديث الزيارات كجدول</h1>
          </div>
          <Link className="idv-button idv-button-light idv-button-small text-sm" href="/driver">
            رجوع
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1900px] px-4 py-6">
        {loading && <p className="text-sm font-medium">جاري تحميل الطلبات...</p>}

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-medium text-slate-600 shadow-sm">
            لا توجد طلبات مُسندة حالياً.
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1850px] border-collapse text-right text-xs">
              <thead className="bg-slate-100 text-[#17365F]">
                <tr className="align-top">
                  {(
                    [
                      ['tracking', 'رقم الطلب'],
                      ['customerName', 'المستلم'],
                      ['merchantName', 'التاجر'],
                      ['currentStatus', 'الحالة الحالية'],
                    ] as Array<[keyof GridFilters, string]>
                  ).map(([key, label]) => (
                    <th className="min-w-36 border-b border-slate-200 p-2" key={key}>
                      <label className="block font-bold">
                        {label}
                        <input
                          aria-label={`تصفية حسب ${label}`}
                          className="mt-2 h-8 w-full rounded border border-slate-300 bg-white px-2 font-medium text-slate-800 outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
                          onChange={(event) =>
                            setFilters((currentFilters) => ({
                              ...currentFilters,
                              [key]: event.target.value,
                            }))
                          }
                          placeholder="تصفية..."
                          value={filters[key]}
                        />
                      </label>
                    </th>
                  ))}
                  <th className="min-w-40 border-b border-slate-200 p-2">الحالة الجديدة</th>
                  <th className="min-w-36 border-b border-slate-200 p-2">سعر المنتج المحصل</th>
                  <th className="min-w-36 border-b border-slate-200 p-2">مصاريف الشحن المحصلة</th>
                  <th className="min-w-36 border-b border-slate-200 p-2">الإجمالي المحصل</th>
                  <th className="min-w-52 border-b border-slate-200 p-2">ملاحظات</th>
                  <th className="min-w-56 border-b border-slate-200 p-2">—</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleRows.map((row) => {
                  const sending = row.submitState === 'sending';
                  return (
                    <tr className="align-top" key={row.orderId}>
                      <td className="p-2 font-bold text-slate-800">{row.tracking || '—'}</td>
                      <td className="p-2 font-semibold text-slate-700">{row.customerName || '—'}</td>
                      <td className="p-2 font-semibold text-slate-700">{row.merchantName || '—'}</td>
                      <td className="p-2 font-semibold text-slate-700">{row.currentStatus || '—'}</td>
                      <td className="p-2">
                        <select
                          aria-label={`الحالة الجديدة للطلب ${row.tracking}`}
                          className="h-9 w-full rounded border border-slate-300 bg-white px-2 font-semibold text-slate-800 outline-none focus:border-[#F27321] disabled:bg-slate-100"
                          disabled={sending}
                          onChange={(event) =>
                            updateRow(row.orderId, (currentRow) => ({
                              ...currentRow,
                              selectedStatus: event.target.value,
                              error: '',
                            }))
                          }
                          onClick={() => requestPrefill(row.orderId)}
                          onFocus={() => requestPrefill(row.orderId)}
                          value={row.selectedStatus}
                        >
                          <option value="">اختر الحالة</option>
                          {statuses.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`سعر المنتج المحصل للطلب ${row.tracking}`}
                          className="h-9 w-full rounded border border-amber-300 bg-amber-50 px-2 font-semibold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 disabled:bg-slate-100"
                          disabled={sending}
                          inputMode="numeric"
                          onChange={(event) => updatePrice(row.orderId, event.target.value)}
                          onFocus={() => requestPrefill(row.orderId)}
                          value={row.collectedPrice}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`مصاريف الشحن المحصلة للطلب ${row.tracking}`}
                          className="h-9 w-full rounded border border-amber-300 bg-amber-50 px-2 font-semibold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 disabled:bg-slate-100"
                          disabled={sending}
                          inputMode="numeric"
                          onChange={(event) => updateShippingFee(row.orderId, event.target.value)}
                          onFocus={() => requestPrefill(row.orderId)}
                          value={row.collectedShippingFee}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`الإجمالي المحصل للطلب ${row.tracking}`}
                          className="h-9 w-full rounded border border-amber-300 bg-amber-50 px-2 font-semibold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 disabled:bg-slate-100"
                          disabled={sending}
                          inputMode="numeric"
                          onChange={(event) => updateTotal(row.orderId, event.target.value)}
                          onFocus={() => requestPrefill(row.orderId)}
                          value={row.collectedTotal}
                        />
                      </td>
                      <td className="p-2">
                        {row.originalNote.trim() && (
                          <p className="mb-1 whitespace-pre-wrap break-words text-[11px] leading-4 text-slate-500">
                            {row.originalNote}
                          </p>
                        )}
                        <textarea
                          aria-label={`ملاحظات الطلب ${row.tracking}`}
                          className="min-h-16 w-full resize-y rounded border border-slate-300 bg-white p-2 font-medium text-slate-800 outline-none focus:border-[#F27321] disabled:bg-slate-100"
                          disabled={sending}
                          onChange={(event) =>
                            updateRow(row.orderId, (currentRow) => ({
                              ...currentRow,
                              note: event.target.value,
                            }))
                          }
                          value={row.note}
                        />
                      </td>
                      <td className="p-2">
                        <button
                          className="idv-button idv-button-small w-full text-xs"
                          disabled={sending || !row.selectedStatus}
                          onClick={() => void submitRow(row)}
                          type="button"
                        >
                          {sending ? 'جاري الإرسال...' : 'تسجيل الزيارة'}
                        </button>
                        {!row.selectedStatus && !row.error && (
                          <p className="mt-2 text-[11px] font-semibold text-slate-500">
                            يرجى اختيار الحالة
                          </p>
                        )}
                        {row.error && (
                          <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
                            {row.error}
                          </p>
                        )}
                        {row.message && (
                          <p
                            className={
                              (row.messageSynced
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-amber-200 bg-amber-50 text-amber-800') +
                              ' mt-2 rounded border px-2 py-1 text-[11px] font-semibold'
                            }
                          >
                            {row.message}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visibleRows.length === 0 && (
              <p className="p-5 text-center text-sm font-medium text-slate-600">
                لا توجد طلبات تطابق عوامل التصفية.
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
