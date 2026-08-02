'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { MerchantRequest } from '@/lib/wp-client';

type Tab = 'active' | 'requests' | 'add';
type Merchant = { wpUserId: number; merchantId: string; name: string; phone: string; governorate: string; city: string };

const GOVERNORATES = ['القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم', 'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد', 'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية', 'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا', 'شمال سيناء', 'سوهاج'];
const EMPTY_FORM = { full_name: '', company_name: '', whatsapp_phone: '', governorate: '', area: '', pickup_address: '', product_nature: '', payment_method: '', wallet_number: '', wallet_name: '', bank_account: '', bank_name: '', bank_holder_name: '' };
const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#17365F] outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20';

export default function MerchantsPage() {
  const [tab, setTab] = useState<Tab>('requests');
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden'>('loading');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [requestStatus, setRequestStatus] = useState('pending');
  const [requests, setRequests] = useState<MerchantRequest[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState<number | 'add' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [reqSearch, setReqSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then((res) => res.json()).then((data) => setState(data.user?.role === 'admin' ? 'ready' : 'forbidden')).catch(() => setState('forbidden'));
  }, []);

  useEffect(() => {
    if (state !== 'ready' || tab !== 'active') return;
    const timer = setTimeout(() => {
      fetch(`/api/merchants?q=${encodeURIComponent(query)}`)
        .then(async (res) => { if (!res.ok) throw new Error(); return res.json(); })
        .then((data) => setMerchants(data.merchants || []))
        .catch(() => setNotice('تعذر تحميل التجار.'));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, state, tab]);

  const loadRequests = useCallback(() => {
    if (state !== 'ready') return;
    fetch(`/api/merchant-requests?status=${requestStatus}&page=${page}&per_page=50`)
      .then(async (res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => { setRequests(data.requests || []); setPages(Math.max(1, Number(data.pages) || 1)); })
      .catch(() => setNotice('تعذر تحميل طلبات الانضمام.'));
  }, [page, requestStatus, state]);

  useEffect(() => { if (tab === 'requests') loadRequests(); }, [loadRequests, tab]);

  const decide = async (id: number, action: 'approve' | 'reject') => {
    setBusy(id); setNotice('');
    const res = await fetch(`/api/merchant-requests/${id}/${action}`, { method: 'POST' });
    const data = await res.json();
    setNotice(res.ok ? (action === 'approve' ? 'تمت الموافقة على الطلب.' : 'تم رفض الطلب.') : data.error || 'تعذر تنفيذ الإجراء.');
    setBusy(null);
    if (res.ok) loadRequests();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy('add'); setNotice('');
    const res = await fetch('/api/merchants/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    if (res.ok) { setNotice('تمت إضافة التاجر بنجاح.'); setForm(EMPTY_FORM); }
    else setNotice(data.error || 'تعذر إضافة التاجر.');
    setBusy(null);
  };

  const field = (name: keyof typeof EMPTY_FORM, label: string, required = false) => <label className="block"><span className="text-sm font-semibold">{label}</span><input className={inputClass} required={required} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></label>;

  if (state === 'loading') return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-[#17365F]">جاري التحميل...</main>;
  if (state === 'forbidden') return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb]"><Link className="idv-button idv-button-light" href="/">للمدير فقط</Link></main>;

  return <main className="min-h-screen bg-[#f6f8fb] text-[#17365F]" dir="rtl">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4"><div><p className="text-sm font-semibold text-[#F27321]">iDeliver Egypt</p><h1 className="text-xl font-bold">إدارة التجار</h1></div><Link className="idv-button idv-button-light idv-button-small" href="/">رجوع</Link></div></header>
    <section className="mx-auto max-w-6xl px-4 py-6">
      <nav className="mb-4 flex flex-wrap gap-2">{([['active','التجار النشطون'],['requests','طلبات الانضمام'],['add','إضافة تاجر جديد']] as const).map(([key, label]) => <button type="button" className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === key ? 'bg-[#17365F] text-white' : 'border border-slate-200 bg-white'}`} key={key} onClick={() => { setTab(key); setNotice(''); }}>{label}</button>)}</nav>
      {notice && <p className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">{notice}</p>}

      {tab === 'active' && <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block max-w-md"><span className="text-sm font-semibold">بحث</span><input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="الاسم أو رقم الهاتف" /></label>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{['رقم التاجر','الاسم','الهاتف','المحافظة','المدينة'].map((h) => <th className="px-3 py-2 text-right" key={h}>{h}</th>)}</tr></thead><tbody>{merchants.map((m) => <tr className="border-t border-slate-100" key={m.wpUserId}><td className="px-3 py-2">{m.merchantId}</td><td className="px-3 py-2">{m.name}</td><td className="px-3 py-2">{m.phone}</td><td className="px-3 py-2">{m.governorate}</td><td className="px-3 py-2">{m.city}</td></tr>)}</tbody></table></div>
      </div>}

      {tab === 'requests' && <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <select className={`${inputClass} max-w-52`} value={requestStatus} onChange={(e) => { setRequestStatus(e.target.value); setPage(1); setSelected(null); }}><option value="pending">قيد الانتظار</option><option value="approved">مقبول</option><option value="rejected">مرفوض</option><option value="all">الكل</option></select>
          <input className={`${inputClass} max-w-64`} placeholder="بحث بالاسم أو الموبايل..." value={reqSearch} onChange={(e) => { setReqSearch(e.target.value); setSelected(null); }} />
        </div>
        <div className="overflow-x-auto"><table className="min-w-max text-sm"><thead className="bg-slate-50"><tr>{['التاريخ','الاسم','الشركة','الهاتف','المحافظة','الحالة','الإجراءات'].map((h) => <th className="px-3 py-2 text-right" key={h}>{h}</th>)}</tr></thead><tbody>{requests.filter((r) => !reqSearch || r.full_name.includes(reqSearch) || r.company_name.includes(reqSearch) || r.whatsapp_phone.includes(reqSearch)).map((row) => (<>
          <tr className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" key={row.id} onClick={() => setSelected(selected === row.id ? null : row.id)}>
            <td className="px-3 py-2 whitespace-nowrap">{new Date(row.date).toLocaleDateString('ar-EG')}</td>
            <td className="px-3 py-2">{row.full_name}</td>
            <td className="px-3 py-2">{row.company_name}</td>
            <td className="px-3 py-2">{row.whatsapp_phone}</td>
            <td className="px-3 py-2">{row.governorate}</td>
            <td className="px-3 py-2">{row.status}</td>
            <td className="px-3 py-2"><div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button className="idv-button idv-button-light idv-button-small" onClick={() => setSelected(selected === row.id ? null : row.id)}>{selected === row.id ? 'إخفاء' : 'عرض'}</button>
              {row.status === 'pending' && <><button className="idv-button idv-button-small bg-green-700 text-white" disabled={busy === row.id} onClick={() => decide(row.id, 'approve')}>موافقة</button><button className="idv-button idv-button-danger idv-button-small" disabled={busy === row.id} onClick={() => decide(row.id, 'reject')}>رفض</button></>}
            </div></td>
          </tr>
          {selected === row.id && <tr key={`${row.id}-detail`} className="bg-slate-50 border-t border-slate-200"><td colSpan={7} className="px-4 py-4">
            <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
              {[['الاسم الكامل', row.full_name],['البراند / الشركة', row.company_name],['رقم الواتساب', row.whatsapp_phone],['هاتف إضافي', row.extra_phone],['المحافظة', row.governorate],['المنطقة', row.area],['طبيعة المنتج', row.product_nature],['طريقة الدفع', row.payment_method],['رابط السوشيال', row.social_link],['الحالة', row.status]].map(([label, value]) => value ? <div key={label}><span className="font-semibold text-slate-500">{label}: </span><span>{value}</span></div> : null)}
              {row.pickup_address && <div className="md:col-span-2"><span className="font-semibold text-slate-500">عنوان الاستلام: </span><span>{row.pickup_address}</span></div>}
            </div>
          </td></tr>}
        </>))}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between"><button className="idv-button idv-button-light idv-button-small" disabled={page === 1} onClick={() => setPage((v) => v - 1)}>السابق</button><span className="text-sm">صفحة {page} من {pages}</span><button className="idv-button idv-button-light idv-button-small" disabled={page >= pages} onClick={() => setPage((v) => v + 1)}>التالي</button></div>
      </div>}

      {tab === 'add' && <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">{field('full_name','اسم التاجر المسؤول',true)}{field('company_name','اسم البراند / الشركة',true)}<label className="block"><span className="text-sm font-semibold">رقم الواتساب</span><input className={inputClass} required placeholder="010xxxxxxxx" value={form.whatsapp_phone} onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })} /></label><label className="block"><span className="text-sm font-semibold">المحافظة</span><select className={inputClass} value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })}><option value=""></option>{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select></label>{field('area','المنطقة')}{field('product_nature','طبيعة المنتج')}<label className="block md:col-span-2"><span className="text-sm font-semibold">عنوان الاستلام بالتفصيل</span><textarea className={`${inputClass} min-h-24`} value={form.pickup_address} onChange={(e) => setForm({ ...form, pickup_address: e.target.value })} /></label><label className="block"><span className="text-sm font-semibold">طريقة الدفع</span><select className={inputClass} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}><option value=""></option><option>محفظة إلكترونية</option><option>رقم إنستا باي</option><option>تحويل بنكي</option></select></label>
        {(form.payment_method === 'محفظة إلكترونية' || form.payment_method === 'رقم إنستا باي') && <>{field('wallet_number','رقم المحفظة / إنستا باي')}{field('wallet_name','اسم صاحب الحساب')}</>}
        {form.payment_method === 'تحويل بنكي' && <>{field('bank_account','رقم الحساب البنكي')}{field('bank_name','اسم البنك')}{field('bank_holder_name','اسم صاحب الحساب')}</>}
        </div><button className="idv-button idv-button-orange mt-5" disabled={busy === 'add'} type="submit">{busy === 'add' ? 'جاري الإضافة...' : 'إضافة التاجر'}</button>
      </form>}
    </section>
  </main>;
}
