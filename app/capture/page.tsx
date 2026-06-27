'use client';

import Link from 'next/link';
import { ChangeEvent, useRef, useState } from 'react';

interface Merchant {
  id: string;
  wpUserId: number;
  merchantId: string;
  name: string;
  phone: string;
  governorate?: string;
  city?: string;
  address?: string;
}

interface CapturedPhoto {
  orderId: string;
  sequence: number;
  previewUrl: string;
}

type CaptureStatus = 'idle' | 'searching' | 'creating' | 'capturing' | 'sending' | 'sent';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.readAsDataURL(file);
  });
}

export default function CapturePage() {
  const [query, setQuery] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [message, setMessage] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchMerchants = async () => {
    setMessage('');
    setHasSearched(false);
    setStatus('searching');

    try {
      const response = await fetch(`/api/merchants?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || 'Merchant search failed');
        return;
      }

      setMerchants(data.merchants || []);
      setHasSearched(true);
    } finally {
      setStatus('idle');
    }
  };

  const createSession = async (merchant: Merchant) => {
    setMessage('');
    setStatus('creating');

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: merchant.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || 'Could not start session');
        return;
      }

      setSelectedMerchant(merchant);
      setSessionId(data.session.id);
      setPhotos([]);
      setMerchants([]);
      setHasSearched(false);
      setQuery(merchant.name);
    } finally {
      setStatus('idle');
    }
  };

  const capturePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !sessionId) return;

    setMessage('');
    setStatus('capturing');

    try {
      const photoDataUrl = await fileToDataUrl(file);

      const response = await fetch(`/api/sessions/${sessionId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoDataUrl }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || 'Photo upload failed');
        return;
      }

      setPhotos((current) => [
        ...current,
        {
          orderId: data.order.id,
          sequence: data.order.sequence,
          previewUrl: URL.createObjectURL(file),
        },
      ]);
    } finally {
      event.target.value = '';
      setStatus('idle');
    }
  };

  const sendSession = async () => {
    if (!sessionId) return;

    setMessage('');
    setStatus('sending');

    try {
      const response = await fetch(`/api/sessions/${sessionId}/send`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || 'Could not send session');
        setStatus('idle');
        return;
      }

      setMessage(`${data.orderCount} orders sent to ${data.extraction.provider} for review.`);
      setStatus('sent');
    } catch {
      setMessage('Could not send session');
      setStatus('idle');
    }
  };

  const resetSession = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setSelectedMerchant(null);
    setSessionId(null);
    setPhotos([]);
    setStatus('idle');
    setMessage('');
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#F27321]">Phone flow</p>
            <h1 className="text-xl font-bold text-[#17365F]">Capture receipts</h1>
          </div>
          <Link className="text-sm font-medium text-[#17365F]" href="/">
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-5">
        {!sessionId && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Search merchant</span>
              <div className="mt-2 flex gap-2">
                <input
                  className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') searchMerchants();
                  }}
                  placeholder="Merchant name, phone, or ID"
                />
                <button
                  className="h-11 rounded-md bg-[#17365F] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={status === 'searching'}
                  onClick={searchMerchants}
                  type="button"
                >
                  {status === 'searching' ? 'Searching' : 'Search'}
                </button>
              </div>
            </label>

            {merchants.length > 0 && (
              <div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
                {merchants.map((merchant) => (
                  <button
                    className="block w-full px-3 py-3 text-left hover:bg-slate-50"
                    key={merchant.id}
                    onClick={() => createSession(merchant)}
                    type="button"
                  >
                    <span className="block text-sm font-semibold text-[#17365F]">
                      {merchant.name}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {merchant.phone || merchant.merchantId}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {hasSearched && status !== 'searching' && merchants.length === 0 && (
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                No merchants found. Try searching by merchant ID, phone number, or part of the name.
              </p>
            )}
          </div>
        )}

        {sessionId && selectedMerchant && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">Active session</p>
              <h2 className="mt-1 text-lg font-bold text-[#17365F]">{selectedMerchant.name}</h2>
              <p className="mt-1 text-xs text-slate-500">Session {sessionId}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Orders</p>
                  <p className="text-3xl font-bold text-[#17365F]">{photos.length}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">Status</p>
                  <p className="text-lg font-bold capitalize text-[#17365F]">{status}</p>
                </div>
              </div>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div
                    className="aspect-square overflow-hidden rounded-md border border-slate-200 bg-white"
                    key={photo.orderId}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={`Receipt ${photo.sequence}`}
                      className="h-full w-full object-cover"
                      src={photo.previewUrl}
                    />
                  </div>
                ))}
              </div>
            )}

            <input
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={capturePhoto}
              ref={fileInputRef}
              type="file"
            />

            {status !== 'sent' ? (
              <div className="grid gap-3">
                <button
                  className="h-12 rounded-md bg-[#F27321] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={status === 'capturing' || status === 'sending'}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {status === 'capturing' ? 'Uploading photo...' : 'Capture receipt'}
                </button>

                <button
                  className="h-12 rounded-md bg-[#17365F] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={photos.length === 0 || status === 'sending'}
                  onClick={sendSession}
                  type="button"
                >
                  {status === 'sending' ? 'Sending...' : `Send ${photos.length} orders`}
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                <Link
                  className="flex h-12 items-center justify-center rounded-md bg-[#17365F] px-4 text-sm font-semibold text-white"
                  href={sessionId ? `/review?session=${encodeURIComponent(sessionId)}` : '/review'}
                >
                  Open review queue
                </Link>
                <button
                  className="h-12 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
                  onClick={resetSession}
                  type="button"
                >
                  Start another session
                </button>
              </div>
            )}
          </div>
        )}

        {message && (
          <p className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
