'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

interface StaffUser {
  wpUserId: number;
  username: string;
  email: string;
  role: 'admin' | 'pickup' | 'data_entry';
}

const REMEMBER_STORAGE_KEY = 'idv_remember';

// Only the username is remembered — never the password — so a stolen
// device/browser profile doesn't hand over a working credential.
function readRememberedUsername(): string | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(REMEMBER_STORAGE_KEY);
  return saved || null;
}

export default function Home() {
  const [initialUsername] = useState(readRememberedUsername);
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState(initialUsername ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(initialUsername != null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'فشل تسجيل الدخول');
        return;
      }

      if (rememberMe) {
        localStorage.setItem(REMEMBER_STORAGE_KEY, username);
      } else {
        localStorage.removeItem(REMEMBER_STORAGE_KEY);
      }

      setUser({
        wpUserId: data.user.id,
        username: data.user.username,
        email: data.user.email,
        role: data.user.role,
      });
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    const remembered = readRememberedUsername();
    setUsername(remembered ?? '');
    setPassword('');
    setRememberMe(remembered != null);
    setUser(null);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4">
        <p className="text-sm font-medium text-[#17365F]">جاري تحميل iDeliver Intake...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#f5f7fa] text-[#17365F]">
        <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-6">
          <div className="hidden lg:block">
            <div className="max-w-xl">
              <div
                aria-label="iDeliver"
                className="h-24 w-48 rounded-md border border-slate-200 bg-white bg-contain bg-center bg-no-repeat px-5 py-4 shadow-sm"
                role="img"
                style={{ backgroundImage: "url('/ideliver-logo.png')" }}
              />
              <p className="mt-8 text-sm font-bold uppercase text-[#F27321]">
                iDeliver Egypt
              </p>
              <h1 className="mt-3 max-w-lg text-4xl font-bold leading-tight text-[#17365F]">
                مساحة عمل مدعومة بالذكاء الاصطناعي لتصوير الإيصالات ومراجعة الشحنات
              </h1>
              <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
                يسجّل الموظفون الدخول هنا قبل تصوير إيصالات استلام التُجّار، أو إرسال الصور
                لاستخراج البيانات، أو مراجعة بيانات الشحنات المُستخرجة.
              </p>
            </div>
          </div>

          <section className="w-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6">
              <div className="flex items-center gap-4">
                <div
                  aria-label="iDeliver"
                  className="h-16 w-28 rounded-md border border-slate-200 bg-white bg-contain bg-center bg-no-repeat p-2 shadow-sm"
                  role="img"
                  style={{ backgroundImage: "url('/ideliver-logo.png')" }}
                />
                <div>
                  <p className="text-sm font-bold text-[#F27321]">iDeliver Egypt</p>
                  <h1 className="mt-1 text-2xl font-bold text-[#17365F]">تسجيل الدخول</h1>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                استخدم حساب WordPress وكلمة مرور التطبيق للوصول إلى مساحة العمل الداخلية.
              </p>
            </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <label className="block">
              <span className="text-sm font-semibold text-[#17365F]">مستخدم WordPress</span>
              <input
                className="mt-1 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base font-medium text-[#17365F] shadow-sm outline-none placeholder:text-slate-400 focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/25"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="name@example.com"
                autoComplete="username"
              />
            </label>

            <div className="block">
              <span className="text-sm font-semibold text-[#17365F]">كلمة مرور التطبيق</span>
              <div className="relative mt-1">
                <input
                  className="h-12 w-full rounded-md border border-slate-300 bg-white pl-11 pr-3 text-base font-medium text-[#17365F] shadow-sm outline-none placeholder:text-slate-400 focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/25"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="كلمة مرور تطبيق WordPress"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-500 hover:text-[#17365F]"
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-[#F27321]"
              />
              <span className="text-sm font-medium text-[#17365F]">تذكرني</span>
            </label>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}

            <button
              className="idv-button idv-button-orange h-12 w-full text-sm"
              disabled={submitting || !username || !password}
              type="submit"
            >
              {submitting ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium leading-5 text-slate-500">
                مساحة عمل محمية للموظفين لتصوير الإيصالات ومراجعة البيانات وإرسال الشحنات.
              </p>
            </div>
        </section>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#F27321]">iDeliver Egypt</p>
            <h1 className="text-xl font-bold text-[#17365F]">مساحة العمل</h1>
          </div>
          <button
            className="idv-button idv-button-light idv-button-small text-sm"
            onClick={handleLogout}
            type="button"
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-[1fr_1fr_1fr]">
        {(user.role === 'admin' || user.role === 'pickup') && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">تدفّق الهاتف</p>
            <h2 className="mt-1 text-lg font-bold text-[#17365F]">تصوير إيصالات الاستلام</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ابحث عن تاجر، ابدأ جلسة استلام واحدة، صور كل إيصال، ثم أرسل الجلسة لاستخراج البيانات.
            </p>
            <Link
              className="idv-button idv-button-orange mt-5 h-10 text-sm"
              href="/capture"
            >
              فتح التصوير
            </Link>
          </div>
        )}

        {(user.role === 'admin' || user.role === 'pickup' || user.role === 'data_entry') && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">تدفّق المراجعة</p>
            <h2 className="mt-1 text-lg font-bold text-[#17365F]">قائمة المراجعة</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              عالج الجلسات الجاهزة حسب التاجر، قارن الصور بالبيانات المُستخرجة، صحّح، ثم أرسل الشحنات.
            </p>
            <Link
              className="idv-button mt-5 h-10 text-sm"
              href="/review"
            >
              فتح المراجعة
            </Link>
          </div>
        )}

        {(user.role === 'admin' || user.role === 'pickup' || user.role === 'data_entry') && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">تدفّق الطباعة</p>
            <h2 className="mt-1 text-lg font-bold text-[#17365F]">قائمة الطباعة</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              اطبع استيكرات الشحن للطلبات المُرسَلة مجمّعة حسب التاجر، أو احذفها من قائمة الطباعة.
            </p>
            <Link
              className="idv-button mt-5 h-10 text-sm"
              href="/print"
            >
              فتح الطباعة
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
