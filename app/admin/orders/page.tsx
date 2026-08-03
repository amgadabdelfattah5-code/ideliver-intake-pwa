'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';

interface AdminOrder {
  orderId: number;
  status: string;
  customerName: string;
  merchantName: string;
  merchantIdentityLabel?: string;
  collectedPrice: string;
  collectedShippingFee: string;
  collectedTotal: string;
  productPriceRecipient: string;
  shippingFeeRecipient: string;
  paymentRef: string | null;
}

interface DataEntry {
  recipientAddress: string;
  recipientGovernorate: string;
  recipientPhone: string;
  price: string;
  shippingFeePrinted: string;
  total: string;
  notes: string;
}

interface AdminRow {
  orderId: number;
  tracking: string;
  currentStatus: string;
  customerName: string;
  merchantName: string;
  merchantIdentityLabel: string;
  recipientAddress: string;
  recipientGovernorate: string;
  recipientPhone: string;
  printedPrice: string;
  printedShippingFee: string;
  printedTotal: string;
  collectedPrice: string;
  collectedShippingFee: string;
  collectedTotal: string;
  productPriceRecipient: string;
  shippingFeeRecipient: string;
  notes: string;
  paymentRef: string;
}

interface AdminFilters {
  tracking: string;
  merchantName: string;
  customerName: string;
  recipientGovernorate: string;
  recipientAddress: string;
  recipientPhone: string;
  printedPrice: string;
  printedShippingFee: string;
  printedTotal: string;
  productPriceRecipient: string;
  shippingFeeRecipient: string;
  currentStatus: string;
  notes: string;
  paymentRef: string;
}

const PER_PAGE = 50;

const columnWidths = [
  '2%', '2%', '4%', '8%', '7%', '5%', '10%', '7%', '6%', '6%', '6%', '8%', '8%', '8%', '5%', '8%',
];

const statusLabels: Record<string, string> = {
  pending: 'بانتظار الدفع',
  processing: 'قيد المعالجة',
  'shipment-rec': 'تم استلام الشحنة',
  shipped: 'قيد التوصيل',
  delivered: 'تم التوصيل',
  'on-hold': 'قيد الانتظار',
  completed: 'تم التوريد للتاجر',
  'merchant-paid': 'تم التحويل للتاجر',
  'merchant-sup': 'تم التوريد للتاجر',
  postponed: 'مؤجل',
  'value-transferred': 'تم تحويل قيمة الشحنة',
  'refunded-merchant': 'مرتجع (شحن على التاجر)',
  'refund-ship': 'مرتجع (شحن محصل)',
  'delivered-wallet': 'تم التوصيل (محول محفظة)',
  'sh-val-transfer': 'تم تحويل قيمة الشحن فقط',
  cancelled: 'ملغي',
  refunded: 'مرتجع (محصل شحن)',
  failed: 'فشل',
  'checkout-draft': 'مسودة',
  'returned-full': 'مرتجع كامل',
  'returned-partial': 'مرتجع جزئي',
};

const recipientLabels: Record<string, string> = {
  us_cash: 'محصّل — لنا',
  merchant_transfer: 'تحويل — للتاجر',
  not_paid: 'لم يُدفع',
};

const initialFilters: AdminFilters = {
  tracking: '',
  merchantName: '',
  customerName: '',
  recipientGovernorate: '',
  recipientAddress: '',
  recipientPhone: '',
  printedPrice: '',
  printedShippingFee: '',
  printedTotal: '',
  productPriceRecipient: '',
  shippingFeeRecipient: '',
  currentStatus: '',
  notes: '',
  paymentRef: '',
};

function statusLabel(value: string): string {
  return statusLabels[value] ?? value;
}

async function exportRowsToXLSX(rows: AdminRow[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الطلبات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  ws.addRow(['رقم الطلب', 'التاجر', 'المستلم', 'المحافظة', 'العنوان', 'رقم الهاتف', 'سعر المنتج', 'مصاريف الشحن', 'الإجمالي', 'سعر المنتج المحصّل', 'مصاريف الشحن المحصّلة', 'الإجمالي المحصّل', 'مستلم المنتج', 'مستلم الشحن', 'الحالة', 'ملاحظات', 'مرجع الدفع']);
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365F' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { horizontal: 'right' };
  });

  rows.forEach((row) => {
    ws.addRow([
      row.orderId,
      row.merchantIdentityLabel || row.merchantName,
      row.customerName,
      row.recipientGovernorate,
      row.recipientAddress,
      row.recipientPhone,
      row.printedPrice,
      row.printedShippingFee,
      row.printedTotal,
      row.collectedPrice,
      row.collectedShippingFee,
      row.collectedTotal,
      recipientLabels[row.productPriceRecipient] || '',
      recipientLabels[row.shippingFeeRecipient] || '',
      statusLabel(row.currentStatus),
      row.notes,
      row.paymentRef,
    ]);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'admin-orders-' + new Date().toISOString().slice(0, 10) + '.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [serialInput, setSerialInput] = useState('1');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [filters, setFilters] = useState<AdminFilters>(initialFilters);
  const [accessState, setAccessState] =
    useState<'checking' | 'allowed' | 'forbidden'>('checking');
  const [loading, setLoading] = useState(true);
  const [dataEntriesLoadState, setDataEntriesLoadState] =
    useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadDataEntries(orderIds: number[]) {
      if (orderIds.length === 0) return;
      setDataEntriesLoadState('loading');

      try {
        const ids = orderIds.join(',');
        const detailsResponse = await fetch(
          `/api/driver/orders/data-entries?ids=${encodeURIComponent(ids)}`
        );
        const detailsData = await detailsResponse.json();
        if (!detailsResponse.ok) {
          throw new Error(detailsData.error || 'data_entries_failed');
        }
        if (cancelled) return;

        setRows((previousRows) =>
          previousRows.map((row) => {
            const entry = detailsData.dataEntries?.[String(row.orderId)] as
              | DataEntry
              | undefined;
            if (!entry) return row;

            return {
              ...row,
              recipientAddress: entry.recipientAddress,
              recipientGovernorate: entry.recipientGovernorate,
              recipientPhone: entry.recipientPhone,
              printedPrice: entry.price,
              printedShippingFee: entry.shippingFeePrinted,
              printedTotal: entry.total,
              notes: entry.notes,
            };
          })
        );
        if (!cancelled) setDataEntriesLoadState('loaded');
      } catch {
        if (!cancelled) setDataEntriesLoadState('failed');
      }
    }

    async function loadRows() {
      try {
        const authResponse = await fetch('/api/auth/me');
        const authData = await authResponse.json();
        if (!authResponse.ok) throw new Error('تعذّر التحقق من الحساب');

        if (!authData.user?.isAdmin && !authData.user?.permissions?.includes('orders')) {
          if (!cancelled) setAccessState('forbidden');
          return;
        }

        if (cancelled) return;
        setAccessState('allowed');

        const ordersResponse = await fetch(`/api/admin/orders?page=${page}`);
        const ordersData = await ordersResponse.json();
        if (!ordersResponse.ok) {
          throw new Error(ordersData.error || 'تعذّر تحميل الطلبات');
        }

        if (cancelled) return;
        const orders = (ordersData.orders || []) as AdminOrder[];
        setTotalPages(Math.max(1, Number(ordersData.pages) || 1));
        setTotal(Number(ordersData.total) || 0);
        setRows(
          orders.map((order) => ({
            orderId: order.orderId,
            tracking: String(order.orderId),
            currentStatus: order.status,
            customerName: order.customerName,
            merchantName: order.merchantName,
            merchantIdentityLabel: order.merchantIdentityLabel || order.merchantName,
            recipientAddress: '',
            recipientGovernorate: '',
            recipientPhone: '',
            printedPrice: '',
            printedShippingFee: '',
            printedTotal: '',
            collectedPrice: order.collectedPrice || '',
            collectedShippingFee: order.collectedShippingFee || '',
            collectedTotal: order.collectedTotal || '',
            productPriceRecipient: order.productPriceRecipient || '',
            shippingFeeRecipient: order.shippingFeeRecipient || '',
            notes: '',
            paymentRef: order.paymentRef || '',
          }))
        );
        void loadDataEntries(orders.map((order) => order.orderId));
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
  }, [page]);

  const visibleRows = useMemo(() => {
    const normalizedFilters = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, value.toLocaleLowerCase()])
    ) as Record<keyof AdminFilters, string>;

    return rows.filter(
      (row) =>
        row.tracking.toLocaleLowerCase().includes(normalizedFilters.tracking) &&
        row.merchantName.toLocaleLowerCase().includes(normalizedFilters.merchantName) &&
        row.customerName.toLocaleLowerCase().includes(normalizedFilters.customerName) &&
        row.recipientGovernorate
          .toLocaleLowerCase()
          .includes(normalizedFilters.recipientGovernorate) &&
        row.recipientAddress
          .toLocaleLowerCase()
          .includes(normalizedFilters.recipientAddress) &&
        row.recipientPhone.toLocaleLowerCase().includes(normalizedFilters.recipientPhone) &&
        row.printedPrice.toLocaleLowerCase().includes(normalizedFilters.printedPrice) &&
        row.printedShippingFee
          .toLocaleLowerCase()
          .includes(normalizedFilters.printedShippingFee) &&
        row.printedTotal.toLocaleLowerCase().includes(normalizedFilters.printedTotal) &&
        row.productPriceRecipient
          .toLocaleLowerCase()
          .includes(normalizedFilters.productPriceRecipient) &&
        row.shippingFeeRecipient
          .toLocaleLowerCase()
          .includes(normalizedFilters.shippingFeeRecipient) &&
        row.currentStatus.toLocaleLowerCase().includes(normalizedFilters.currentStatus) &&
        row.notes.toLocaleLowerCase().includes(normalizedFilters.notes) &&
        row.paymentRef.toLocaleLowerCase().includes(normalizedFilters.paymentRef)
    );
  }, [filters, rows]);

  const filterOptions = useMemo(() => {
    function distinct(get: (row: AdminRow) => string): string[] {
      return Array.from(new Set(rows.map(get).filter((value) => value.trim() !== ''))).sort(
        (a, b) => a.localeCompare(b, 'ar')
      );
    }

    return {
      tracking: distinct((row) => row.tracking),
      merchantName: distinct((row) => row.merchantName),
      customerName: distinct((row) => row.customerName),
      recipientGovernorate: distinct((row) => row.recipientGovernorate),
      recipientAddress: distinct((row) => row.recipientAddress),
      recipientPhone: distinct((row) => row.recipientPhone),
      printedPrice: distinct((row) => row.printedPrice),
      printedShippingFee: distinct((row) => row.printedShippingFee),
      printedTotal: distinct((row) => row.printedTotal),
      productPriceRecipient: distinct((row) => row.productPriceRecipient),
      shippingFeeRecipient: distinct((row) => row.shippingFeeRecipient),
      currentStatus: distinct((row) => row.currentStatus),
      notes: distinct((row) => row.notes),
      paymentRef: distinct((row) => row.paymentRef),
    } satisfies Record<keyof AdminFilters, string[]>;
  }, [rows]);

  function renderFilterCell(
    key: keyof AdminFilters,
    label: string,
    optionLabel?: (value: string) => string
  ) {
    const datalistId = `admin-orders-filter-${key}`;
    return (
      <th className="overflow-hidden p-1" key={key}>
        <input
          aria-label={`تصفية حسب ${label}`}
          className="h-7 w-full min-w-0 rounded border border-slate-300 bg-white px-1 font-medium text-slate-800 outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
          list={datalistId}
          onChange={(event) =>
            setFilters((currentFilters) => ({
              ...currentFilters,
              [key]: event.target.value,
            }))
          }
          placeholder="تصفية..."
          value={filters[key]}
        />
        <datalist id={datalistId}>
          {filterOptions[key].map((option) => (
            <option key={option} label={optionLabel?.(option)} value={option} />
          ))}
        </datalist>
      </th>
    );
  }

  function changePage(nextPage: number) {
    setRows([]);
    setLoading(true);
    setError('');
    setDataEntriesLoadState('idle');
    setFilters(initialFilters);
    setSelectedIds(new Set());
    setPage(nextPage);
    setPageInput(String(nextPage));
    setSerialInput(String((nextPage - 1) * PER_PAGE + 1));
  }

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.orderId));

  function toggleAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleRows.forEach((r) => next.delete(r.orderId));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleRows.forEach((r) => next.add(r.orderId));
        return next;
      });
    }
  }

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const exportRows =
    selectedIds.size > 0 ? visibleRows.filter((r) => selectedIds.has(r.orderId)) : visibleRows;

  function handlePageInput(value: string) {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) changePage(n);
    else setPageInput(String(page));
  }

  function handleSerialInput(value: string) {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 1 && n <= total) changePage(Math.ceil(n / PER_PAGE));
    else setSerialInput(String((page - 1) * PER_PAGE + 1));
  }

  if (accessState === 'forbidden') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 text-[#17365F]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="font-bold">غير متاح لهذا الحساب</p>
          <Link className="idv-button idv-button-light idv-button-small mt-4 text-sm" href="/">
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
            <h1 className="text-xl font-bold">كل الطلبات</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="idv-button idv-button-light idv-button-small text-sm"
              disabled={
                loading || dataEntriesLoadState === 'loading' || visibleRows.length === 0
              }
              onClick={() => void exportRowsToXLSX(exportRows)}
              type="button"
            >
              تنزيل Excel{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
            <Link className="idv-button idv-button-light idv-button-small text-sm" href="/">
              رجوع
            </Link>
          </div>
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
            لا توجد طلبات حالياً.
          </p>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="mb-3 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[900px] table-fixed border-collapse text-right text-[11px]">
                <colgroup>
                  {columnWidths.map((width, index) => (
                    <col key={index} style={{ width }} />
                  ))}
                </colgroup>
                <tbody>
                  <tr className="align-middle">
                    <th className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        aria-label="تحديد الكل"
                        className="cursor-pointer accent-[#17365F]"
                      />
                    </th>
                    <th className="p-1" />
                    {renderFilterCell('tracking', 'رقم الطلب')}
                    {renderFilterCell('merchantName', 'التاجر')}
                    {renderFilterCell('customerName', 'المستلم')}
                    {renderFilterCell('recipientGovernorate', 'المحافظة')}
                    {renderFilterCell('recipientAddress', 'العنوان')}
                    {renderFilterCell('recipientPhone', 'رقم الهاتف')}
                    {renderFilterCell('printedPrice', 'سعر المنتج')}
                    {renderFilterCell('printedShippingFee', 'مصاريف الشحن')}
                    {renderFilterCell('printedTotal', 'الإجمالي')}
                    {renderFilterCell('productPriceRecipient', 'مستلم المنتج', (value) => recipientLabels[value])}
                    {renderFilterCell('shippingFeeRecipient', 'مستلم الشحن', (value) => recipientLabels[value])}
                    {renderFilterCell('currentStatus', 'الحالة', statusLabel)}
                    {renderFilterCell('notes', 'ملاحظات')}
                    {renderFilterCell('paymentRef', 'مرجع الدفع')}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[900px] table-fixed border-collapse text-right text-[11px]">
                <colgroup>
                  {columnWidths.map((width, index) => (
                    <col key={index} style={{ width }} />
                  ))}
                </colgroup>
                <thead className="bg-slate-100 text-[#17365F]">
                  <tr className="align-top">
                    <th className="border-b border-slate-200 p-1 text-center">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        aria-label="تحديد الكل"
                        className="cursor-pointer accent-[#17365F]"
                      />
                    </th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">م</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">رقم الطلب</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">التاجر</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">المستلم</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">المحافظة</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">العنوان</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">رقم الهاتف</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">سعر المنتج</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">مصاريف الشحن</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">الإجمالي</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">مستلم المنتج</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">مستلم الشحن</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">الحالة</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">ملاحظات</th>
                    <th className="break-words border-b border-slate-200 p-1 font-bold">مرجع الدفع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleRows.map((row, index) => (
                    <tr className={`align-middle${selectedIds.has(row.orderId) ? ' bg-blue-50' : ''}`} key={row.orderId}>
                      <td className="p-1 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.orderId)}
                          onChange={() => toggleRow(row.orderId)}
                          aria-label={`تحديد طلب ${row.orderId}`}
                          className="cursor-pointer accent-[#17365F]"
                        />
                      </td>
                      <td className="overflow-hidden truncate p-1 text-slate-500">{(page - 1) * PER_PAGE + index + 1}</td>
                      <td className="overflow-hidden truncate p-1 font-bold text-slate-800" title={row.tracking || undefined}>{row.tracking || '—'}</td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={row.merchantName || undefined}>{row.merchantName || '—'}</td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={row.customerName || undefined}>{row.customerName || '—'}</td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={row.recipientGovernorate || undefined}>{row.recipientGovernorate || (dataEntriesLoadState === 'loading' ? '…' : '—')}</td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={row.recipientAddress || undefined}>{row.recipientAddress || (dataEntriesLoadState === 'loading' ? '…' : '—')}</td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={row.recipientPhone || undefined}>{row.recipientPhone || (dataEntriesLoadState === 'loading' ? '…' : '—')}</td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={(row.collectedPrice || row.printedPrice) || undefined}>
                        {row.collectedPrice ? (
                          <span className="rounded bg-green-50 px-1 text-green-700">{row.collectedPrice}</span>
                        ) : (
                          row.printedPrice || (dataEntriesLoadState === 'loading' ? '…' : '—')
                        )}
                      </td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={(row.collectedShippingFee || row.printedShippingFee) || undefined}>
                        {row.collectedShippingFee ? (
                          <span className="rounded bg-green-50 px-1 text-green-700">{row.collectedShippingFee}</span>
                        ) : (
                          row.printedShippingFee || (dataEntriesLoadState === 'loading' ? '…' : '—')
                        )}
                      </td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={(row.collectedTotal || row.printedTotal) || undefined}>
                        {row.collectedTotal ? (
                          <span className="rounded bg-green-50 px-1 text-green-700">{row.collectedTotal}</span>
                        ) : (
                          row.printedTotal || (dataEntriesLoadState === 'loading' ? '…' : '—')
                        )}
                      </td>
                      <td className="overflow-hidden truncate p-1 font-semibold">
                        {row.productPriceRecipient ? (
                          <span className="rounded bg-slate-100 px-1 text-slate-700">
                            {recipientLabels[row.productPriceRecipient] || '—'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="overflow-hidden truncate p-1 font-semibold">
                        {row.shippingFeeRecipient ? (
                          <span className="rounded bg-slate-100 px-1 text-slate-700">
                            {recipientLabels[row.shippingFeeRecipient] || '—'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={statusLabel(row.currentStatus)}>{statusLabel(row.currentStatus) || '—'}</td>
                      <td className="overflow-hidden truncate p-1 font-semibold text-slate-700" title={row.notes || undefined}>{row.notes || (dataEntriesLoadState === 'loading' ? '…' : '—')}</td>
                      <td className="overflow-hidden p-1 font-semibold">
                        {row.paymentRef ? (
                          <span className="rounded bg-green-50 px-1 text-green-700" title={row.paymentRef}>{row.paymentRef}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {visibleRows.length === 0 && (
                <p className="p-5 text-center text-sm font-medium text-slate-600">
                  لا توجد طلبات تطابق عوامل التصفية.
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                className="idv-button idv-button-light idv-button-small text-sm"
                disabled={page === 1}
                onClick={() => changePage(page - 1)}
                type="button"
              >
                ← السابق
              </button>
              <span className="flex items-center gap-1 text-sm font-semibold">
                <input
                  aria-label="الانتقال إلى رقم مسلسل"
                  className="w-14 rounded border border-slate-300 bg-white px-1 text-center font-semibold outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onBlur={(e) => handleSerialInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSerialInput(serialInput); }}
                />
                –{Math.min(page * PER_PAGE, total)} من {total}
                &nbsp;|&nbsp; صفحة{' '}
                <input
                  aria-label="الانتقال إلى صفحة"
                  className="w-10 rounded border border-slate-300 bg-white px-1 text-center font-semibold outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={(e) => handlePageInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePageInput(pageInput); }}
                />
                {' '}من {totalPages}
              </span>
              <button
                className="idv-button idv-button-light idv-button-small text-sm"
                disabled={page === totalPages}
                onClick={() => changePage(page + 1)}
                type="button"
              >
                التالي →
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
