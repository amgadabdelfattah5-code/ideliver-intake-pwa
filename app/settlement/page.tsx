'use client';

import { useEffect, useRef, useState } from 'react';

interface StaffUser { wpUserId: number; username: string; email: string; role: string; }
interface Merchant { wpUserId: number; name: string; merchantId: string; }
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
  us_cash: 'ÙØ­ØµÙ - ÙÙØ§', us_transfer: 'ÙØ­ØµÙ - ÙÙØ§',
  merchant_transfer: 'ØªØ­ÙÙÙ - ÙÙØªØ§Ø¬Ø±', not_paid: 'ÙÙ ÙÙØ­ØµÙÙÙ',
};
const RECIP_OPTIONS = [
  { value: 'us_cash', label: 'ÙØ­ØµÙ - ÙÙØ§' },
  { value: 'merchant_transfer', label: 'ØªØ­ÙÙÙ - ÙÙØªØ§Ø¬Ø±' },
  { value: 'not_paid', label: 'ÙÙ ÙÙØ­ØµÙÙÙ' },
];

function egp(piastres: number) {
  return (piastres / 100).toFixed(2);
}

export default function SettlementPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState<number>(0);
  const [merchantSearch, setMerchantSearch] = useState('');
  const [merchantDropdownOpen, setMerchantDropdownOpen] = useState(false);
  const merchantInputRef = useRef<HTMLInputElement>(null);
  const [eligible, setEligible] = useState<EligibleOrder[]>([]);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [totals, setTotals] = useState<{ count: number; lines_net: number } | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [unclaimedAdj, setUnclaimedAdj] = useState<Adjustment[]>([]);
  const [claimedAdj, setClaimedAdj] = useState<Adjustment[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Row edit state
  const [rowEdits, setRowEdits] = useState<Record<number, { product_amount: string; shipping_amount: string; product_recipient: string; shipping_recipient: string }>>({});
  const [rowSaving, setRowSaving] = useState<Record<number, boolean>>({});

  // Adjustment form state
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjKind] = useState('standalone');
  const [onAcctAmount, setOnAcctAmount] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  // Payout state
  const [payoutRef, setPayoutRef] = useState('');
  const [zeroReason, setZeroReason] = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);

  // Adjustment inline edit
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
      // init row edits
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
      setMsg('ØªÙ Ø­ÙØ¸ Ø§ÙØ·ÙØ¨ #' + orderId);
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('Ø®Ø·Ø£: ' + e.message);
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
      setMsg('ØªÙ Ø¥Ø¶Ø§ÙØ© Ø§ÙØªØ¹Ø¯ÙÙ');
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('Ø®Ø·Ø£: ' + e.message);
    } finally {
      setAdjSubmitting(false);
    }
  }

  async function deleteAdj(adjId: number) {
    if (!confirm('Ø­Ø°Ù ÙØ°Ø§ Ø§ÙØªØ¹Ø¯ÙÙØ')) return;
    try {
      const res = await fetch('/api/settlement/adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'delete', merchant_id: merchantId, adjustment_id: adjId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg('ØªÙ Ø§ÙØ­Ø°Ù');
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('Ø®Ø·Ø£: ' + e.message);
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
      setMsg('ØªÙ Ø§ÙØªØ¹Ø¯ÙÙ');
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('Ø®Ø·Ø£: ' + e.message);
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
      setMsg('ØªÙ: ' + op);
      await loadData(merchantId);
    } catch (e: any) {
      setMsg('Ø®Ø·Ø£: ' + e.message);
    } finally {
      setPayoutSubmitting(false);
    }
  }

  if (!user) return <div className="p-8 text-center text-[#17365F]">Ø¬Ø§Ø±Ù Ø§ÙØªØ­ÙÙÙ...</div>;
  if (user.role !== 'admin') return <div className="p-8 text-center text-red-600">ØºÙØ± ÙØµØ±Ø­</div>;

  const netEgp = totals && balance ? ((totals.lines_net + balance.carry_balance) / 100).toFixed(2) : null;
  const openStatus = balance?.open_payout_status ?? null;
  const selectedMerchant = merchants.find(m => m.wpUserId === merchantId);
  const selectedMerchantName = selectedMerchant ? `${selectedMerchant.name} (${selectedMerchant.merchantId})` : '';
  const filteredMerchants = merchants.filter(m => {
    const query = merchantSearch.toLowerCase();
    return m.name.toLowerCase().includes(query) || String(m.merchantId).toLowerCase().includes(query);
  });

  return (
    <main className="min-h-screen bg-[#f6f8fb]" dir="rtl">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-[#17365F]">Ø§ÙØªØ³ÙÙØ©</h1>
          <a href="/" className="text-sm text-slate-500 hover:text-[#17365F]">â Ø§ÙØ±Ø¦ÙØ³ÙØ©</a>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">

        {/* ââ Merchant picker ââ */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm font-semibold text-[#17365F] mb-1">Ø§ÙØªØ§Ø¬Ø±</label>
          <div className="relative">
            <input
              ref={merchantInputRef}
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-[#17365F]"
              placeholder="ابحث عن تاجر..."
              value={merchantDropdownOpen ? merchantSearch : selectedMerchantName || merchantSearch}
              onClick={() => {
                if (merchantId) setMerchantSearch('');
                setMerchantDropdownOpen(true);
              }}
              onChange={e => {
                setMerchantSearch(e.target.value);
                setMerchantDropdownOpen(true);
              }}
              onBlur={() => setTimeout(() => setMerchantDropdownOpen(false), 150)}
            />
            {merchantDropdownOpen && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                {filteredMerchants.length > 0 ? filteredMerchants.map(m => {
                  const displayName = `${m.name} (${m.merchantId})`;
                  return (
                    <button
                      key={m.wpUserId}
                      type="button"
                      className="block w-full px-3 py-2 text-right text-sm text-[#17365F] hover:bg-slate-100"
                      onClick={() => {
                        onMerchantChange(m.wpUserId);
                        setMerchantDropdownOpen(false);
                        setMerchantSearch(displayName);
                      }}
                    >
                      {displayName}
                    </button>
                  );
                }) : (
                  <div className="px-3 py-2 text-sm text-slate-500">لا نتائج</div>
                )}
              </div>
            )}
          </div>
        </div>

        {msg && (
          <div className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{msg}</div>
        )}

        {loading && <div className="text-center text-sm text-slate-500 py-4">Ø¬Ø§Ø±Ù Ø§ÙØªØ­ÙÙÙ...</div>}

        {merchantId > 0 && !loading && balance && (
          <>
            {/* ââ Balance summary ââ */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-bold text-[#17365F] mb-3">ÙÙØ®Øµ Ø§ÙØ±ØµÙØ¯</h2>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <th className="py-1 text-right font-medium text-slate-600 w-48">Ø§ÙØ±ØµÙØ¯ Ø§ÙÙÙØ±Ø­ÙÙÙ</th>
                    <td className="py-1">{egp(balance.carry_balance)} Ø¬.Ù</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <th className="py-1 text-right font-medium text-slate-600">Ø§ÙØªÙÙ Ø§ÙØªØ­ÙÙÙ</th>
                    <td className="py-1">{balance.cutover_complete ? 'â' : 'â ÙØ¬Ø¨ ØªØ´ØºÙÙ Ø§ÙØªØ¹Ø¨Ø¦Ø© Ø§ÙØ£ÙÙÙØ©'}</td>
                  </tr>
                  <tr>
                    <th className="py-1 text-right font-medium text-slate-600">Ø¯ÙØ¹Ø© ÙÙØªÙØ­Ø©</th>
                    <td className="py-1">
                      {balance.open_payout_id
                        ? `#${balance.open_payout_id} (${balance.open_payout_status})`
                        : 'ÙØ§ ÙÙØ¬Ø¯'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ââ Eligible orders ââ */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-bold text-[#17365F] mb-3">Ø§ÙØ·ÙØ¨Ø§Øª Ø§ÙÙØ¤ÙÙØ© ({totals?.count ?? 0})</h2>
              {eligible.length === 0 ? (
                <p className="text-sm text-slate-500">ÙØ§ ØªÙØ¬Ø¯ Ø·ÙØ¨Ø§Øª ÙØ¤ÙÙØ©.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Ø§ÙØ·ÙØ¨','Ø§ÙØ§Ø³Ù','Ø§ÙÙØ§ØªÙ','Ø§ÙÙØ­Ø§ÙØ¸Ø©','Ø§ÙØ­Ø§ÙØ©','Ø§ÙÙÙØªØ¬ (Ø¬.Ù)','Ø§ÙØ´Ø­Ù (Ø¬.Ù)','Ø­ÙØ¸'].map(h => (
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
                                {rowSaving[o.order_id] ? '...' : 'Ø­ÙØ¸'}
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

            {/* ââ Attention ââ */}
            {attention.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-base font-bold text-amber-800 mb-2">ØªØ­ØªØ§Ø¬ ÙØ±Ø§Ø¬Ø¹Ø© ({attention.length})</h2>
                <ul className="space-y-1">
                  {attention.map(a => (
                    <li key={a.order_id} className="text-sm text-amber-700">#{a.order_id} â {a.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* ââ Adjustments ââ */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
              <h2 className="text-base font-bold text-[#17365F]">Ø§ÙØªØ¹Ø¯ÙÙØ§Øª</h2>

              {/* Add standalone adjustment */}
              <div className="rounded border border-slate-200 p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-600">Ø¥Ø¶Ø§ÙØ© ØªØ¹Ø¯ÙÙ</p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="number" step="0.01" placeholder="Ø§ÙÙØ¨ÙØº (Ø¬.ÙØ Ø³Ø§ÙØ¨ ÙÙØ®ØµÙ)"
                    className="rounded border border-slate-300 px-2 py-1 text-sm w-40"
                    value={adjAmount}
                    onChange={e => setAdjAmount(e.target.value)}
                  />
                  <input
                    type="text" placeholder="Ø§ÙØ³Ø¨Ø¨"
                    className="rounded border border-slate-300 px-2 py-1 text-sm flex-1 min-w-32"
                    value={adjReason}
                    onChange={e => setAdjReason(e.target.value)}
                  />
                  <button
                    className="rounded bg-[#17365F] px-3 py-1 text-sm text-white hover:bg-[#16335C] disabled:opacity-50"
                    disabled={adjSubmitting || !adjAmount || !adjReason}
                    onClick={() => addAdj(adjReason, adjAmount)}
                  >
                    Ø¥Ø¶Ø§ÙØ©
                  </button>
                </div>
              </div>

              {/* Add ØªØ­Øª Ø§ÙØ­Ø³Ø§Ø¨ */}
              <div className="rounded border border-slate-200 p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-600">ØªØ­Øª Ø§ÙØ­Ø³Ø§Ø¨ (Ø®ØµÙ)</p>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" min="0" placeholder="Ø§ÙÙØ¨ÙØº (Ø¬.Ù)"
                    className="rounded border border-slate-300 px-2 py-1 text-sm w-40"
                    value={onAcctAmount}
                    onChange={e => setOnAcctAmount(e.target.value)}
                  />
                  <button
                    className="rounded bg-amber-600 px-3 py-1 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                    disabled={adjSubmitting || !onAcctAmount}
                    onClick={() => addAdj('ØªØ­Øª Ø§ÙØ­Ø³Ø§Ø¨', onAcctAmount)}
                  >
                    Ø¥Ø¶Ø§ÙØ© ØªØ­Øª Ø§ÙØ­Ø³Ø§Ø¨
                  </button>
                </div>
              </div>

              {/* Unclaimed adjustments */}
              {unclaimedAdj.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">Ø§ÙØªØ¹Ø¯ÙÙØ§Øª ØºÙØ± Ø§ÙÙÙØ·Ø§ÙÙØ¨ Ø¨ÙØ§</p>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {['#','Ø§ÙÙÙØ¹','Ø§ÙÙØ¨ÙØº','Ø§ÙØ³Ø¨Ø¨','ØªØ§Ø±ÙØ®','Ø¥Ø¬Ø±Ø§Ø¡'].map(h => (
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
                                <button className="rounded bg-green-600 px-2 py-0.5 text-white text-xs" onClick={() => saveAdjEdit(a.id)}>Ø­ÙØ¸</button>
                                <button className="rounded bg-slate-400 px-2 py-0.5 text-white text-xs" onClick={() => setEditingAdj(null)}>Ø¥ÙØºØ§Ø¡</button>
                              </>
                            ) : (
                              <>
                                <button className="rounded bg-blue-600 px-2 py-0.5 text-white text-xs" onClick={() => { setEditingAdj(a.id); setEditAdjAmount(egp(a.amount)); setEditAdjReason(a.reason); }}>ØªØ¹Ø¯ÙÙ</button>
                                <button className="rounded bg-red-600 px-2 py-0.5 text-white text-xs" onClick={() => deleteAdj(a.id)}>Ø­Ø°Ù</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Claimed adjustments */}
              {claimedAdj.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">Ø§ÙØªØ¹Ø¯ÙÙØ§Øª Ø§ÙÙÙØ·Ø§ÙÙØ¨ Ø¨ÙØ§ (ÙÙÙÙØ©)</p>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>{['#','Ø§ÙÙÙØ¹','Ø§ÙÙØ¨ÙØº','Ø§ÙØ³Ø¨Ø¨','Ø¯ÙØ¹Ø©','ØªØ§Ø±ÙØ®'].map(h => <th key={h} className="px-2 py-1 text-right font-semibold text-slate-600">{h}</th>)}</tr>
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

            {/* ââ Excel buttons ââ */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 flex gap-3 flex-wrap">
              <button
                className="rounded bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-800"
                onClick={() => { window.location.href = `/api/settlement/export?merchant_id=${merchantId}&type=main`; }}
              >
                ØªØ­ÙÙÙ Excel (Ø±Ø¦ÙØ³Ù)
              </button>
              <button
                className="rounded bg-teal-700 px-4 py-2 text-sm text-white hover:bg-teal-800"
                onClick={() => { window.location.href = `/api/settlement/export?merchant_id=${merchantId}&type=review`; }}
              >
                ØªØ­ÙÙÙ Excel (ÙØ±Ø§Ø¬Ø¹Ø©)
              </button>
            </div>

            {/* ââ Net preview ââ */}
            {totals && balance && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <th className="py-1 text-right font-medium text-slate-600 w-48">ØµØ§ÙÙ Ø§ÙØ·ÙØ¨Ø§Øª</th>
                      <td className="py-1">{egp(totals.lines_net)} Ø¬.Ù</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <th className="py-1 text-right font-medium text-slate-600">Ø§ÙÙÙØ±Ø­ÙÙÙ</th>
                      <td className="py-1">{egp(balance.carry_balance)} Ø¬.Ù</td>
                    </tr>
                    <tr>
                      <th className="py-1 text-right font-bold text-[#17365F]">= Ø§ÙÙØ³ØªØ­Ù ÙÙØªØ­ÙÙÙ</th>
                      <td className="py-1 font-bold text-[#17365F]">{netEgp} Ø¬.Ù</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ââ Ø¥Ø¹Ø¯Ø§Ø¯ Ø§ÙØ¯ÙØ¹Ø© ââ */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-base font-bold text-[#17365F]">Ø¥Ø¹Ø¯Ø§Ø¯ Ø§ÙØ¯ÙØ¹Ø©</h2>
              <div className="flex gap-2 flex-wrap">
                {!openStatus && (
                  <button
                    className="rounded bg-[#17365F] px-4 py-2 text-sm text-white hover:bg-[#16335C] disabled:opacity-50"
                    disabled={payoutSubmitting}
                    onClick={() => doPayout('prepare')}
                  >
                    Ø¥Ø¹Ø¯Ø§Ø¯ Ø¯ÙØ¹Ø©
                  </button>
                )}
                {openStatus === 'draft' && (
                  <>
                    <button className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={payoutSubmitting} onClick={() => doPayout('begin')}>Ø¨Ø¯Ø¡ Ø§ÙØªØ­ÙÙÙ</button>
                    <button className="rounded bg-slate-500 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={payoutSubmitting} onClick={() => doPayout('cancel')}>Ø¥ÙØºØ§Ø¡</button>
                    <button className="rounded bg-amber-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={payoutSubmitting || !zeroReason} onClick={() => doPayout('commit_zero', { reason: zeroReason })}>Ø¥ØºÙØ§Ù Ø¨ØµÙØ±</button>
                    <input type="text" placeholder="Ø³Ø¨Ø¨ Ø§ÙØ¥ØºÙØ§Ù Ø¨ØµÙØ±" className="rounded border border-slate-300 px-2 py-1 text-sm flex-1 min-w-32" value={zeroReason} onChange={e => setZeroReason(e.target.value)} />
                  </>
                )}
                {openStatus === 'sending' && (
                  <>
                    <input type="text" placeholder="ÙØ±Ø¬Ø¹ Ø§ÙØªØ­ÙÙÙ Ø§ÙØ®Ø§Ø±Ø¬Ù" className="rounded border border-slate-300 px-2 py-2 text-sm flex-1 min-w-48" value={payoutRef} onChange={e => setPayoutRef(e.target.value)} />
                    <button className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={payoutSubmitting || !payoutRef} onClick={() => doPayout('confirm', { external_ref: payoutRef })}>ØªØ£ÙÙØ¯ Ø§ÙØªØ­ÙÙÙ</button>
                    <button className="rounded bg-slate-500 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={payoutSubmitting} onClick={() => doPayout('cancel')}>Ø¥ÙØºØ§Ø¡</button>
                  </>
                )}
              </div>
            </div>

            {/* ââ Recent payouts ââ */}
            {payouts.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-base font-bold text-[#17365F] mb-3">Ø§ÙØ¯ÙØ¹Ø§Øª Ø§ÙØ£Ø®ÙØ±Ø©</h2>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>{['#','Ø§ÙØ­Ø§ÙØ©','Ø§ÙØµØ§ÙÙ','ÙØ±Ø¬Ø¹','ØªØ§Ø±ÙØ® Ø§ÙØ¥ÙØ´Ø§Ø¡','ØªØ§Ø±ÙØ® Ø§ÙØ¥ØºÙØ§Ù'].map(h => <th key={h} className="px-2 py-2 text-right font-semibold text-slate-600">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {payouts.map(p => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-2 py-1">#{p.id}</td>
                        <td className="px-2 py-1">{p.status}</td>
                        <td className="px-2 py-1">{egp(p.net_transferred)} Ø¬.Ù</td>
                        <td className="px-2 py-1">{p.external_ref ?? 'â'}</td>
                        <td className="px-2 py-1">{p.created_at?.slice(0, 10)}</td>
                        <td className="px-2 py-1">{p.committed_at?.slice(0, 10) ?? 'â'}</td>
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
