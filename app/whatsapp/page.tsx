'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { WALog } from '@/lib/wp-client';

const STATUSES = [
  'pending', 'processing', 'shipment-rec', 'shipped', 'delivered', 'on-hold',
  'completed', 'merchant-paid', 'merchant-sup', 'postponed', 'value-transferred',
  'refunded-merchant', 'refund-ship', 'delivered-wallet', 'sh-val-transfer',
  'cancelled', 'refunded', 'failed', 'checkout-draft',
];
const API_FIELDS = ['api_url', 'api_key', 'instance', 'admin_phone', 'merchant_admin_phone'];
const GROUP_FIELDS = ['approval_pickup_group_numbers', 'approval_followup_group_numbers', 'approval_group_followup_delay_minutes'];
const OTHER_TEMPLATES = ['tpl_admin', 'tpl_merchant_request', 'tpl_merchant_approval'];
const DUMMY: Record<string, string> = {
  '{customer_name}': 'أحمد محمد', '{billing_first_name}': 'أحمد', '{shipping_first_name}': 'محمد',
  '{billing_address}': 'شارع التحرير، القاهرة', '{shipping_address}': 'شارع التحرير، القاهرة',
  '{order_id}': '1234', '{order_total}': '500 EGP', '{order_status}': 'قيد التوصيل',
  '{items_list}': '2x منتج تجريبي\n1x منتج آخر', '{shipping_phone}': '01012345678',
  '{merchant_name}': 'محل البركة', '{company_name}': 'شركة البركة للتجارة',
  '{review_link}': 'https://ideliveregypt.com/wp-admin/...',
};
const LABELS: Record<string, string> = {
  api_url: 'Base URL', api_key: 'API Token', instance: 'Instance ID', admin_phone: 'Admin Phone Trigger',
  merchant_admin_phone: 'Admin Phone (Merchant Requests)', approval_pickup_group_numbers: 'Pickup Group Team Numbers',
  approval_followup_group_numbers: 'Follow-up Group Team Numbers', approval_group_followup_delay_minutes: 'Follow-up Delay (minutes)',
  tpl_admin: 'Admin Message Template', tpl_merchant_request: 'Merchant Request Template', tpl_merchant_approval: 'Merchant Approval Welcome Template',
};
const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#17365F] outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20';

function preview(text: string) {
  return Object.entries(DUMMY).reduce((value, [key, replacement]) => value.split(key).join(replacement), text);
}

export default function WhatsAppPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'api' | 'groups' | 'messages' | 'other' | 'logs'>('api');
  const [previews, setPreviews] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<WALog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [resending, setResending] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/auth/me'), fetch('/api/whatsapp/settings')])
      .then(async ([auth, response]) => {
        const authData = await auth.json();
        if (authData.user?.role !== 'admin') return setState('forbidden');
        if (!response.ok) throw new Error();
        setSettings(await response.json());
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    if (state !== 'ready') return;
    const query = new URLSearchParams({ limit: '50', offset: String((page - 1) * 50) });
    if (status) query.set('status', status);
    fetch(`/api/whatsapp/logs?${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        setLogs(data.logs || []);
        setTotal(Number(data.total) || 0);
      })
      .catch(() => setNotice('Failed to load logs.'));
  }, [page, state, status]);

  const set = (key: string, value: string) => setSettings((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true); setNotice('');
    const response = await fetch('/api/whatsapp/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    setNotice(response.ok ? 'Settings saved.' : 'Failed to save settings.');
    setSaving(false);
  };
  const resend = async (log: WALog) => {
    setResending(log.id); setNotice('');
    const response = await fetch('/api/whatsapp/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: log.recipient_number, message: log.message_content, log_id: log.id }) });
    if (response.ok) setLogs((rows) => rows.map((row) => row.id === log.id ? { ...row, status: 'success' } : row));
    else setNotice('Resend failed.');
    setResending(null);
  };

  if (state === 'loading') return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-[#17365F]">Loading...</main>;
  if (state === 'forbidden') return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb]"><Link className="idv-button idv-button-light" href="/">Admin access only</Link></main>;
  if (state === 'error') return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-red-700">Failed to load WhatsApp settings.</main>;

  const field = (key: string, type = 'text') => <label className="block" key={key}><span className="text-sm font-semibold">{LABELS[key]}</span><input className={inputClass} type={type} value={settings[key] || ''} onChange={(event) => set(key, event.target.value)} /></label>;
  const template = (key: string, label: string) => <div className="rounded-md border border-slate-200 p-4" key={key}><label className="block"><span className="text-sm font-semibold">{label}</span><textarea className={`${inputClass} min-h-28`} value={settings[key] || ''} onChange={(event) => set(key, event.target.value)} /></label><button className="idv-button idv-button-light idv-button-small mt-2" type="button" onClick={() => setPreviews((value) => ({ ...value, [key]: !value[key] }))}>Preview</button>{previews[key] && <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{preview(settings[key] || '')}</pre>}</div>;

  return <main className="min-h-screen bg-[#f6f8fb] text-[#17365F]">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4"><div><p className="text-sm font-semibold text-[#F27321]">iDeliver Egypt</p><h1 className="text-xl font-bold">WhatsApp Management</h1></div><Link className="idv-button idv-button-light idv-button-small" href="/">Back</Link></div></header>
    <section className="mx-auto max-w-6xl px-4 py-6">
      <nav className="mb-4 flex flex-wrap gap-2">{([['api','API Config'],['groups','Approval Groups'],['messages','Message Templates'],['other','Other Templates'],['logs','Logs']] as const).map(([key, label]) => <button className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === key ? 'bg-[#17365F] text-white' : 'border border-slate-200 bg-white'}`} key={key} onClick={() => setTab(key)}>{label}</button>)}</nav>
      {notice && <p className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">{notice}</p>}
      {tab !== 'logs' && <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {tab === 'api' && <div className="grid gap-4 md:grid-cols-2">{API_FIELDS.map((key) => field(key, key === 'api_key' ? 'password' : 'text'))}</div>}
        {tab === 'groups' && <div className="grid gap-4 md:grid-cols-2">{GROUP_FIELDS.map((key) => field(key, key.endsWith('minutes') ? 'number' : 'text'))}</div>}
        {tab === 'messages' && <div className="space-y-4">{STATUSES.map((slug) => <div className="rounded-md border border-slate-200 p-4" key={slug}>{template(`msg_${slug}`, slug)}<label className="mt-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings[`active_${slug}`] === '1'} onChange={(event) => set(`active_${slug}`, event.target.checked ? '1' : '')} />Enabled</label></div>)}</div>}
        {tab === 'other' && <div className="space-y-4">{OTHER_TEMPLATES.map((key) => template(key, LABELS[key]))}</div>}
        <button className="idv-button idv-button-orange mt-5" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save all settings'}</button>
      </div>}
      {tab === 'logs' && <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <select className={`${inputClass} mb-4 max-w-48`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option></select>
        <div className="overflow-x-auto" dir="ltr"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['Date','Order','Recipient','Message','Status','Response','Action'].map((heading) => <th className="px-2 py-2" key={heading}>{heading}</th>)}</tr></thead><tbody>{logs.map((log) => <tr className="border-t border-slate-100" key={log.id}><td className="px-2 py-2 whitespace-nowrap">{log.date}</td><td className="px-2 py-2">#{log.order_id}</td><td className="px-2 py-2">{log.recipient_number}</td><td className="max-w-xs truncate px-2 py-2" title={log.message_content}>{log.message_content}</td><td className={`px-2 py-2 font-semibold ${log.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>{log.status}</td><td className="max-w-xs truncate px-2 py-2" title={log.api_response}>{log.api_response}</td><td className="px-2 py-2">{log.status === 'failed' && <button className="idv-button idv-button-small" disabled={resending === log.id} onClick={() => resend(log)}>{resending === log.id ? 'Sending...' : 'Resend'}</button>}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between"><button className="idv-button idv-button-light idv-button-small" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span className="text-sm">Page {page} of {Math.max(1, Math.ceil(total / 50))}</span><button className="idv-button idv-button-light idv-button-small" disabled={page * 50 >= total} onClick={() => setPage((value) => value + 1)}>Next</button></div>
      </div>}
    </section>
  </main>;
}
