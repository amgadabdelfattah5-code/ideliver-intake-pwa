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
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 py-10">
        <section className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-semibold text-[#F27321]">iDeliver Egypt</p>
            <h1 className="mt-2 text-2xl font-bold text-[#17365F]">Intake workspace</h1>
            <p className="mt-2 text-sm text-slate-600">
              Sign in to capture pickup receipts and review extracted orders.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">WordPress user</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="name@example.com"
                autoComplete="username"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">App password</span>
              <input
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </label>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <button
              className="h-11 w-full rounded-md bg-[#17365F] px-4 text-sm font-semibold text-white transition hover:bg-[#102947] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting || !username || !password}
              type="submit"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
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
