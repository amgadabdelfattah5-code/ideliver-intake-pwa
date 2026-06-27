'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

interface StaffUser {
  wpUserId: number;
  username: string;
  email: string;
}

export default function Home() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        setError(data.error || 'Login failed');
        return;
      }

      setUser({
        wpUserId: data.user.id,
        username: data.user.username,
        email: data.user.email,
      });
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4">
        <p className="text-sm font-medium text-[#17365F]">Loading iDeliver Intake...</p>
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
                AI intake workspace for receipt capture and shipment review
              </h1>
              <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
                Staff sign in here before capturing merchant pickup receipts, sending photos to Hermes OCR, and reviewing extracted shipment data.
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
                  <h1 className="mt-1 text-2xl font-bold text-[#17365F]">Intake login</h1>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Use your WordPress account and app password to access the internal PWA.
              </p>
            </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <label className="block">
              <span className="text-sm font-semibold text-[#17365F]">WordPress user</span>
              <input
                className="mt-1 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base font-medium text-[#17365F] shadow-sm outline-none placeholder:text-slate-400 focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/25"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="name@example.com"
                autoComplete="username"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#17365F]">App password</span>
              <input
                className="mt-1 h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base font-medium text-[#17365F] shadow-sm outline-none placeholder:text-slate-400 focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/25"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="WordPress app password"
              />
            </label>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}

            <button
              className="h-12 w-full rounded-md bg-[#F27321] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#d96318] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting || !username || !password}
              type="submit"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium leading-5 text-slate-500">
                Protected staff workspace for capture, OCR review, and shipment submission.
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
            <h1 className="text-xl font-bold text-[#17365F]">Intake workspace</h1>
          </div>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={handleLogout}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Phone flow</p>
          <h2 className="mt-1 text-lg font-bold text-[#17365F]">Capture pickup receipts</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Search a merchant, start one pickup session, photograph each receipt, then send the
            session into extraction.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center rounded-md bg-[#F27321] px-4 text-sm font-semibold text-white hover:bg-[#d96318]"
            href="/capture"
          >
            Open capture
          </Link>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Laptop flow</p>
          <h2 className="mt-1 text-lg font-bold text-[#17365F]">Review extracted orders</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Work ready sessions by merchant, compare photos against AI fields, correct data, and
            submit shipments.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center rounded-md bg-[#17365F] px-4 text-sm font-semibold text-white hover:bg-[#102947]"
            href="/review"
          >
            Open review
          </Link>
        </div>
      </section>
    </main>
  );
}
