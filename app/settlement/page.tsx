'use client';

import { useEffect, useState } from 'react';

interface StaffUser { wpUserId: number; username: string; email: string; role: string; }
interface Merchant { wpUserId: number; name: string; merchantId: string; identityLabel?: string; }
interface EligibleOrder {
  order_id: number; order_status: string;
  product_credit: number; shipping_charge: number; order_net: number;
  collected_price: string; collected_shipping_fee: string;
  product_price_recipient: string; shipping_fee_recipient: string;
  billing_name: string; billing_phone: string; governorate: string;
}
interface Attention { order_id: number; reason: string; }
interface Adjustment { id: number; kind: string; ref_order_id: number | null; amount: number; reason: string; payout_id: number | null; created_at: string; }
interface Balance { carry_balance: number; cutover_complete: boolean; open_payout_id: number | null; open_payout_status: string | null; open_payout_net: number | null; }
interface Payout { id: number; status: string; net_transferred: number; external_ref: string | null; created_at: string; committed_at: string | null; }

const RECIP_LABELS: Record<string, string> = {
  us_cash: 'محصل - لنا', us_transfer: 'محصل - لنا',
  merchant_transfer: 'تحويل - للتاجر', not_paid: 'لم يحصلون',
};
const RECIP_OPTIONS = [
  { value: 'us_cash', label: 'محصل - لنا' },
  { value: 'merchant_transfer', label: 'تحويل - للتاجر' },
  { value: 'not_paid', label: 'لم يحصلون' },
];

function egp(piastres: number) {
  return (piastres / 100).toFixed(2);
}

export default function SettlementPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState<number>(0);
  const [merchantSearch, setMerchantSearch] = useState('');
  const [eligible, setEligible] = useState<EligibleOrder[]>([]);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [totals, setTotals] = useState<{ count: number; lines_net: number } | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [unclaimedAdj, setUnclaimedAdj] = useState<Adjustment[]>([]);
  const [claimedAdj, setClaimedAdj] = useState<Adjustment[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [rowEdits, setRowEdits] = useState<Record<number, { product_amount: string; shipping_amount: string; product_recipient: string; shipping_recipient: string }>>({});
  const [rowSaving, setRowSaving] = useState<Record<number, boolean>>({});

  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjKind] = useState('standalone');
  const [onAcctAmount, setOnAcctAmount] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  const [payoutRef, setPayoutRef] = useState('');
  const [zeroReason, setZeroReason] = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);

  const [editingAdj, setEditingAdj] = useState<number | null>(null);
  const [editAdjAmount, setEditAdjAmount] = useState('');
  const [editAdjReason, setEditAdjReason] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => setUser(d?.user ?? null));
    fetch('/api/merchants').then(r => r.ok ? r.json() : null).then(d => setMerchants(d?.merchants ?? []));
  }, []);

  async function loadData(mid: number) {
    if (!mid) return;
    setLoading(true);
    setMsg('');
    try {
      const [viewRes, unclRes, clRes, payRes] = await Promise.all([
        fetch(`/api/settlement/view?merchant_id=${mid}`).then(r => r.json()),
        fetch(`/api/settlement/adjustments?merchant_id=${mid}&claimed=0`).then(r => r.json()),
        fetch(`/api/settlement/adjustments?merchant_id=${mid}&claimed=1`).then(r => r.json()),
        fetch(`/api/settlement/payouts?merchant_id=${mid}`).then(r => r.json()),
      ]);
      setEligible(viewRes.eligible ?? []);
      setAttention(viewRes.attention ?? []);
      setTotals(viewRes.totals ?? null);
      setBalance(viewRes.balance ?? null);
      setUnclaimedAdj(unclRes ?? []);
      setClaimedAdj(clRes ?? []);
      setPayouts(payRes ?? []);
      const edits: typeof rowEdits = {};
      for (const o of (viewRes.eligible ?? [])) {
        const pr = o.product_price_recipient === 'us_transfer' ? 'us_cash' : (o.product_price_recipient || 'us_cash');
        const sr = o.shipping_fee_recipient === 'us_transfer' ? 'us_cash' : (o.shipping_fee_recipient || 'us_cash');
        edits[o.order_id] = {
          product_amount: o.collected_price || '0',
          shipping_amount: o.collected_shipping_fee || '0',
          product_recipient: pr,
          shipping_recipient: sr,
        };
      }
      setRowEdits(edits);
    } finally {
      setLoading(false);
    }
  }

  function onMerchantChange(mid: number) {
    setMerchantId(mid);
    setEligible([]); setAttention([]); setTotals(null); setBalance(null);
    setUnclaimedAdj([]); setClaimedAdj([]); setPayouts([]);
    loadData(mid);
  }

  async function saveRow(orderId: number) {
    const edit = rowEdits[orderId];
    if (!edit) return;
    setRowSaving(s => ({ ...s, [orderId]: true }));
    try {
      const res = await fetch('/api/settlement/order-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, merchant_id: merchantId, ...edit }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg('تم حفظ الطلب #' + orderId);
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('خطأ: ' + e.message);
    } finally {
      setRowSaving(s => ({ ...s, [orderId]: false }));
    }
  }

  async function addAdj(reason: string, amount: string) {
    setAdjSubmitting(true);
    try {
      const res = await fetch('/api/settlement/adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'add', merchant_id: merchantId, kind: adjKind, amount, reason, submit_key: crypto.randomUUID() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAdjAmount(''); setAdjReason(''); setOnAcctAmount('');
      setMsg('تم إضافة التعديل');
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('خطأ: ' + e.message);
    } finally {
      setAdjSubmitting(false);
    }
  }

  async function deleteAdj(adjId: number) {
    if (!confirm('حذف هذا التعديل؟')) return;
    try {
      const res = await fetch('/api/settlement/adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'delete', merchant_id: merchantId, adjustment_id: adjId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg('تم الحذف');
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('خطأ: ' + e.message);
    }
  }

  async function saveAdjEdit(adjId: number) {
    try {
      const res = await fetch('/api/settlement/adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'edit', merchant_id: merchantId, adjustment_id: adjId, amount: editAdjAmount, reason: editAdjReason }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingAdj(null);
      setMsg('تم التعديل');
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('خطأ: ' + e.message);
    }
  }

  async function doPayout(op: string, extra: object = {}) {
    setPayoutSubmitting(true);
    try {
      const res = await fetch('/api/settlement/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, merchant_id: merchantId, payout_id: balance?.open_payout_id, ...extra }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPayoutRef(''); setZeroReason('');
      setMsg('تم: ' + op);
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('خطأ: ' + e.message);
    } finally {
      setPayoutSubmitting(false);
    }
  }

  if (!user) return <div className="p-8 text-center text-[#17365F]">جاري التحميل...</div>;
  if (user.role !== 'admin') return <div className="p-8 text-center text-red-600">غير مصرح</div>;

  const netEgp = totals && balance ? ((totals.lines_net + balance.carry_balance) / 100).toFixed(2) : null;
  const openStatus = balance?.open_payout_status ?? null;
  const selectedMerchant = merchants.find(m => m.wpUserId === merchantId);
  const filteredMerchants = merchants.filter(m => {
    const query = merchantSearch.toLowerCase();
    if (!query) return true;
    return (
      m.name.toLowerCase().includes(query) ||
      String(m.merchantId).toLowerCase().includes(query) ||
      (m.identityLabel || '').toLowerCase().includes(query)
    );
  });

  return (
    <main className="min-h-screen bg-[#f6f8fb]" dir="rtl">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-[#17365F]">التسوية</h1>
          <a href="/" className="text-sm text-slate-500 hover:text-[#17365F]">← الرئيسية</a>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">

        {/* Merchant picker */}
        {merchantId === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <label className="block text-sm font-semibold text-[#17365F]">البحث عن التاجر</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm text-[#17365F]"
                placeholder="اسم التاجر أو الهاتف أو الرقم"
                value={merchantSearch}
                onChange={e => setMerchantSearch(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-[#17365F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16335C] transition-colors cursor-pointer"
              >
                بحث
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredMerchants.map(m => (
                <button
                  key={m.wpUserId}
                  type="button"
                  className="idv-button idv-button-light w-full justify-center text-sm font-semibold"
                  onClick={() => { onMerchantChange(m.wpUserId); setMerchantSearch(''); }}
                >
                  {m.identityLabel || `${m.name} (${m.merchantId})`}
                </button>
              ))}
              {filteredMerchants.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-4">لا نتائج</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">التاجر المحدد</p>
              <p className="text-sm font-semibold text-[#17365F]">
                {selectedMerchant?.identityLabel || selectedMerchant?.name || merchantId}
              </p>
            </div>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => { setMerchantId(0); setMerchantSearch(''); setEligible([]); setAttention([]); setTotals(null); setBalance(null); setUnclaimedAdj([]); setClaimedAdj([]); setPayouts([]); }}
            >
              تغيير
            </button>
          </div>
        )}

        {msg && (
          <div className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{msg}</div>
        )}

        {loading && <div className="text-center text-sm text-slate-500 py-4">جاري التحميل...</div>}

        {merchantId > 0 && !loading && balance && (
          <>
            {/* Balance summary */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-bold text-[#17365F] mb-3">ملخص الرصيد</h2>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <th className="py-1 text-right font-medium text-slate-600 w-48">الرصيد المرحول</th>
                    <td className="py-1">{egp(balance.carry_balance)} ج.م</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <th className="py-1 text-right font-medium text-slate-600">اكتمال التحويل</th>
                    <td className="py-1">{balance.cutover_complete ? '✓' : '✗ يجب تشغيل التعبئة الأولية'}</td>
                  </tr>
                  <tr>
                    <th className="py-1 text-right font-medium text-slate-600">دفعة مفتوحة</th>
                    <td className="py-1">
                      {balance.open_payout_id
                        ? `#${balance.open_payout_id} (${balance.open_payout_status})`
                        : 'لا يوجد'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Eligible orders */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-bold text-[#17365F] mb-3">الطلبات المؤهلة ({totals?.count ?? 0})</h2>
              {eligible.length === 0 ? (
                <p className="text-sm text-slate-500">لا توجد طلبات مؤهلة.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {['الطلب','الاسم','الهاتف','المحافظة','الحالة','المنتج (ج.م)','الشحن (ج.م)','حفظ'].map(h => (
                          <th key={h} className="px-2 py-2 text-right font-semibold text-slate-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {eligible.map(o => {
                        const edit = rowEdits[o.order_id] ?? { product_amount: o.collected_price, shipping_amount: o.collected_shipping_fee, product_recipient: 'us_cash', shipping_recipient: 'us_cash' };
                        return (
                          <tr key={o.order_id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-2 py-1">#{o.order_id}</td>
                            <td className="px-2 py-1">{o.billing_name}</td>
                            <td className="px-2 py-1">{o.billing_phone}</td>
                            <td className="px-2 py-1">{o.governorate}</td>
                            <td className="px-2 py-1">{o.order_status}</td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <input
                                  type="number" step="0.01" min="0"
                                  className="w-20 rounded border border-slate-300 px-1 py-0.5 bg-yellow-50"
                                  value={edit.product_amount}
                                  onChange={e => setRowEdits(r => ({ ...r, [o.order_id]: { ...edit, product_amount: e.target.value } }))}
                                />
                                <div className="flex gap-1 flex-wrap">
                                  {RECIP_OPTIONS.map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      className={`px-1.5 py-0.5 text-xs rounded ${edit.product_recipient === opt.value ? 'bg-[#17365F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                      onClick={() => setRowEdits(r => ({ ...r, [o.order_id]: { ...edit, product_recipient: opt.value } }))}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <input
                                  type="number" step="0.01" min="0"
                                  className="w-20 rounded border border-slate-300 px-1 py-0.5 bg-yellow-50"
                                  value={edit.shipping_amount}
                                  onChange={e => setRowEdits(r => ({ ...r, [o.order_id]: { ...edit, shipping_amount: e.target.value } }))}
                                />
                                <div className="flex gap-1 flex-wrap">
                                  {RECIP_OPTIONS.map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      className={`px-1.5 py-0.5 text-xs rounded ${edit.shipping_recipient === opt.value ? 'bg-[#17365F] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                      onClick={() => setRowEdits(r => ({ ...r, [o.order_id]: { ...edit, shipping_recipient: opt.value } }))}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-1">
                              <button
                                className="rounded bg-[#17365F] px-2 py-1 text-xs text-white hover:bg-[#16335C] disabled:opacity-50"
                                disabled={rowSaving[o.order_id]}
                                onClick={() => saveRow(o.order_id)}
                              >
                                {rowSaving[o.order_id] ? '...' : 'حفظ'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Attention */}
            {attention.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-base font-bold text-amber-800 mb-2">تحتاج مراجعة ({attention.length})</h2>
                <ul className="space-y-1">
                  {attention.map(a => (
                    <li key={a.order_id} className="text-sm text-amber-700">#{a.order_id} — {a.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Adjustments */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
              <h2 className="text-base font-bold text-[#17365F]">التعديلات</h2>

              <div className="rounded border border-slate-200 p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-600">إضافة تعديل</p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="number" step="0.01" placeholder="المبلغ (ج.م، سالب للخصم)"
                    className="rounded border border-slate-300 px-2 py-1 text-sm w-40"
                    value={adjAmount}
                    onChange={e => setAdjAmount(e.target.value)}
                  />
                  <input
                    type="text" placeholder="السبب"
                    className="rounded border border-slate-300 px-2 py-1 text-sm flex-1 min-w-32"
                    value={adjReason}
                    onChange={e => setAdjReason(e.target.value)}
                  />
                  <button
                    className="idv-button idv-button-small disabled:opacity-50"
                    disabled={adjSubmitting || !adjAmount || !adjReason}
                    onClick={() => addAdj(adjReason, adjAmount)}
                  >
                    إضافة
                  </button>
                </div>
              </div>

              <div className="rounded border border-slate-200 p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-600">تحت الحساب (خصم)</p>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" min="0" placeholder="المبلغ (ج.م)"
                    className="rounded border border-slate-300 px-2 py-1 text-sm w-40"
                    value={onAcctAmount}
                    onChange={e => setOnAcctAmount(e.target.value)}
                  />
                  <button
                    className="idv-button idv-button-small disabled:opacity-50"
                    style={{ '--idv-bg': '#d97706', '--idv-shadow': 'rgba(120,53,15,0.45)' } as React.CSSProperties}
                    disabled={adjSubmitting || !onAcctAmount}
                    onClick={() => addAdj('تحت الحساب', onAcctAmount)}
                  >
                    إضافة تحت الحساب
                  </button>
                </div>
              </div>

              {unclaimedAdj.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">التعديلات غير المطالب بها</p>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {['#','النوع','المبلغ','السبب','تاريخ','إجراء'].map(h => (
                          <th key={h} className="px-2 py-1 text-right font-semibold text-slate-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {unclaimedAdj.map(a => (
                        <tr key={a.id} className="border-t border-slate-100">
                          <td className="px-2 py-1">{a.id}</td>
                          <td className="px-2 py-1">{a.kind}</td>
                          <td className="px-2 py-1">{egp(a.amount)}</td>
                          <td className="px-2 py-1">
                            {editingAdj === a.id ? (
                              <input className="rounded border border-slate-300 px-1 py-0.5 w-full" value={editAdjReason} onChange={e => setEditAdjReason(e.target.value)} />
                            ) : a.reason}
                          </td>
                          <td className="px-2 py-1">{a.created_at?.slice(0, 10)}</td>
                          <td className="px-2 py-1 space-x-1 space-x-reverse">
                            {editingAdj === a.id ? (
                              <>
                                <input type="number" step="0.01" className="rounded border border-slate-300 px-1 py-0.5 w-20" value={editAdjAmount} onChange={e => setEditAdjAmount(e.target.value)} />
                                <button className="idv-button idv-button-small" style={{ '--idv-bg': '#16a34a', '--idv-shadow': 'rgba(8,60,20,0.45)' } as React.CSSProperties} onClick={() => saveAdjEdit(a.id)}>حفظ</button>
                                <button className="idv-button idv-button-small" style={{ '--idv-bg': '#94a3b8', '--idv-shadow': 'rgba(40,40,60,0.35)' } as React.CSSProperties} onClick={() => setEditingAdj(null)}>إلغاء</button>
                              </>
                            ) : (
                              <>
                                <button className="idv-button idv-button-small" style={{ '--idv-bg': '#2563eb', '--idv-shadow': 'rgba(20,40,120,0.45)' } as React.CSSProperties} onClick={() => { setEditingAdj(a.id); setEditAdjAmount(egp(a.amount)); setEditAdjReason(a.reason); }}>تعديل</button>
                                <button className="idv-button idv-button-small" style={{ '--idv-bg': '#dc2626', '--idv-shadow': 'rgba(120,10,10,0.45)' } as React.CSSProperties} onClick={() => deleteAdj(a.id)}>حذف</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {claimedAdj.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">التعديلات المطالب بها (مقفلة)</p>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>{['#','النوع','المبلغ','السبب','دفعة','تاريخ'].map(h => <th key={h} className="px-2 py-1 text-right font-semibold text-slate-600">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {claimedAdj.map(a => (
                        <tr key={a.id} className="border-t border-slate-100 text-slate-500">
                          <td className="px-2 py-1">{a.id}</td>
                          <td className="px-2 py-1">{a.kind}</td>
                          <td className="px-2 py-1">{egp(a.amount)}</td>
                          <td className="px-2 py-1">{a.reason}</td>
                          <td className="px-2 py-1">#{a.payout_id}</td>
                          <td className="px-2 py-1">{a.created_at?.slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Excel buttons */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 flex gap-3 flex-wrap">
              <button
                className="idv-button"
                style={{ '--idv-bg': '#15803d', '--idv-shadow': 'rgba(8,60,20,0.45)' } as React.CSSProperties}
                onClick={() => { window.location.href = `/api/settlement/export?merchant_id=${merchantId}&type=main`; }}
              >
                تحميل Excel (رئيسي)
              </button>
              <button
                className="idv-button"
                style={{ '--idv-bg': '#0f766e', '--idv-shadow': 'rgba(8,55,50,0.45)' } as React.CSSProperties}
                onClick={() => { window.location.href = `/api/settlement/export?merchant_id=${merchantId}&type=review`; }}
              >
                تحميل Excel (مراجعة)
              </button>
            </div>

            {/* Net preview */}
            {totals && balance && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <th className="py-1 text-right font-medium text-slate-600 w-48">صافي الطلبات</th>
                      <td className="py-1">{egp(totals.lines_net)} ج.م</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th className="py-1 text-right font-medium text-slate-600">المرحول</th>
                      <td className="py-1">{egp(balance.carry_balance)} ج.م</td>
                    </tr>
                    <tr>
                      <th className="py-1 text-right font-bold text-[#17365F]">= المستحق للتحويل</th>
                      <td className="py-1 font-bold text-[#17365F]">{netEgp} ج.م</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Payout actions */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-base font-bold text-[#17365F]">إعداد الدفعة</h2>
              <div className="flex gap-2 flex-wrap">
                {!openStatus && (
                  <button
                    className="idv-button disabled:opacity-50"
                    disabled={payoutSubmitting}
                    onClick={() => doPayout('prepare')}
                  >
                    إعداد دفعة
                  </button>
                )}
                {openStatus === 'draft' && (
                  <>
                    <button className="idv-button disabled:opacity-50" style={{ '--idv-bg': '#2563eb', '--idv-shadow': 'rgba(20,40,120,0.45)' } as React.CSSProperties} disabled={payoutSubmitting} onClick={() => doPayout('begin')}>بدء التحويل</button>
                    <button className="idv-button disabled:opacity-50" style={{ '--idv-bg': '#64748b', '--idv-shadow': 'rgba(40,40,60,0.35)' } as React.CSSProperties} disabled={payoutSubmitting} onClick={() => doPayout('cancel')}>إلغاء</button>
                    <button className="idv-button disabled:opacity-50" style={{ '--idv-bg': '#d97706', '--idv-shadow': 'rgba(120,53,15,0.45)' } as React.CSSProperties} disabled={payoutSubmitting || !zeroReason} onClick={() => doPayout('commit_zero', { reason: zeroReason })}>إغلاق بصفر</button>
                    <input type="text" placeholder="سبب الإغلاق بصفر" className="rounded border border-slate-300 px-2 py-1 text-sm flex-1 min-w-32" value={zeroReason} onChange={e => setZeroReason(e.target.value)} />
                  </>
                )}
                {openStatus === 'sending' && (
                  <>
                    <input type="text" placeholder="مرجع التحويل الخارجي" className="rounded border border-slate-300 px-2 py-2 text-sm flex-1 min-w-48" value={payoutRef} onChange={e => setPayoutRef(e.target.value)} />
                    <button className="idv-button disabled:opacity-50" style={{ '--idv-bg': '#16a34a', '--idv-shadow': 'rgba(8,60,20,0.45)' } as React.CSSProperties} disabled={payoutSubmitting || !payoutRef} onClick={() => doPayout('confirm', { external_ref: payoutRef })}>تأكيد التحويل</button>
                    <button className="idv-button disabled:opacity-50" style={{ '--idv-bg': '#64748b', '--idv-shadow': 'rgba(40,40,60,0.35)' } as React.CSSProperties} disabled={payoutSubmitting} onClick={() => doPayout('cancel')}>إلغاء</button>
                  </>
                )}
              </div>
            </div>

            {/* Recent payouts */}
            {payouts.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-base font-bold text-[#17365F] mb-3">الدفعات الأخيرة</h2>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>{['#','الحالة','الصافي','مرجع','تاريخ الإنشاء','تاريخ الإغلاق'].map(h => <th key={h} className="px-2 py-2 text-right font-semibold text-slate-600">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {payouts.map(p => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-2 py-1">#{p.id}</td>
                        <td className="px-2 py-1">{p.status}</td>
                        <td className="px-2 py-1">{egp(p.net_transferred)} ج.م</td>
                        <td className="px-2 py-1">{p.external_ref ?? '—'}</td>
                        <td className="px-2 py-1">{p.created_at?.slice(0, 10)}</td>
                        <td className="px-2 py-1">{p.committed_at?.slice(0, 10) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
