'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const permissionLabels: Record<string, string> = {
  capture: 'تصوير الإيصالات',
  review: 'قائمة المراجعة',
  print: 'قائمة الطباعة',
  whatsapp: 'WhatsApp',
  settlement: 'تسوية حساب التاجر',
  orders: 'كل الطلبات',
  driver: 'زيارات المندوبين',
  merchants: 'إدارة التجار',
};
const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#17365F] outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20';

interface Account {
  id: string;
  username: string;
  permissions: string[];
  isAdmin: boolean;
  isProtected: boolean;
}

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [error, setError] = useState('');

  const loadAccounts = async () => {
    const response = await fetch('/api/admin/accounts');
    if (response.ok) setAccounts(await response.json());
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.user?.isAdmin !== true) return router.replace('/');
        setReady(true);
        void loadAccounts();
      });
  }, [router]);

  const toggle = (slug: string, current: string[], set: (value: string[]) => void) =>
    set(current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);

  const permissionFields = (current: string[], set: (value: string[]) => void) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(permissionLabels).map(([slug, label]) => (
        <label className="flex items-center gap-2 text-sm" key={slug}>
          <input type="checkbox" checked={current.includes(slug)} onChange={() => toggle(slug, current, set)} />
          {label}
        </label>
      ))}
    </div>
  );

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) return setError('كلمتا المرور غير متطابقتين');
    const response = await fetch('/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, permissions }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setUsername(''); setPassword(''); setConfirmPassword(''); setPermissions([]);
    await loadAccounts();
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const response = await fetch('/api/admin/accounts/' + editing.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: editing.permissions, ...(editPassword && { password: editPassword }) }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setEditing(null); setEditPassword(''); setError('');
    await loadAccounts();
  };

  const deleteAccount = async (account: Account) => {
    if (!confirm('هل تريد حذف حساب ' + account.username + '؟')) return;
    const response = await fetch('/api/admin/accounts/' + account.id, { method: 'DELETE' });
    if (response.ok) await loadAccounts();
  };

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-[#f5f7fa] px-4 py-8 text-[#17365F]" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">إدارة الحسابات</h1>
          <button className="idv-button idv-button-light" onClick={() => router.push('/')}>الرئيسية</button>
        </div>

        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3">اسم المستخدم</th><th className="p-3">الصلاحيات</th><th className="p-3">الإجراءات</th></tr></thead>
            <tbody>{accounts.map((account) => (
              <tr className="border-t border-slate-200" key={account.id}>
                <td className="p-3 font-semibold">{account.username} {account.isProtected && <span className="rounded bg-slate-100 px-2 py-1 text-xs">🔒 محمي</span>}</td>
                <td className="p-3">{account.isAdmin ? 'مدير النظام' : account.permissions.map((slug) => permissionLabels[slug]).join('، ') || 'بدون صلاحيات'}</td>
                <td className="p-3">{!account.isProtected && <div className="flex gap-2"><button className="idv-button idv-button-light idv-button-small" onClick={() => { setEditing(account); setEditPassword(''); setError(''); }}>تعديل</button><button className="idv-button idv-button-small" onClick={() => void deleteAccount(account)}>حذف</button></div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>

        <form className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={createAccount}>
          <h2 className="text-lg font-bold">إضافة حساب</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>اسم المستخدم<input className={inputClass} value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label>كلمة المرور<input className={inputClass} type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label>تأكيد كلمة المرور<input className={inputClass} type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          </div>
          {permissionFields(permissions, setPermissions)}
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          <button className="idv-button idv-button-orange" type="submit">إضافة الحساب</button>
        </form>

        {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form className="w-full max-w-lg space-y-4 rounded-lg bg-white p-5 shadow-xl" onSubmit={saveEdit}>
            <h2 className="text-lg font-bold">تعديل {editing.username}</h2>
            {permissionFields(editing.permissions, (value) => setEditing({ ...editing, permissions: value }))}
            <label className="block">كلمة مرور جديدة (اختياري)<input className={inputClass} type="password" minLength={8} value={editPassword} onChange={(event) => setEditPassword(event.target.value)} /></label>
            {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
            <div className="flex gap-2"><button className="idv-button idv-button-orange" type="submit">حفظ</button><button className="idv-button idv-button-light" type="button" onClick={() => setEditing(null)}>إلغاء</button></div>
          </form>
        </div>}
      </div>
    </main>
  );
}
