'use client';

import { useState, useRef } from 'react';

export default function CapturePage() {
  const [merchantId, setMerchantId] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [status, setStatus] = useState<'idle' | 'creating' | 'capturing' | 'sending' | 'sent'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create session
  const createSession = async () => {
    if (!merchantId) return;
    setStatus('creating');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId }),
      });
      const data = await res.json();
      if (data.success) {
        setSessionId(data.session.id);
        setPhotoCount(0);
      }
    } finally {
      setStatus('idle');
    }
  };

  // Capture photo
  const capturePhoto = async (file: File) => {
    if (!sessionId) return;
    setStatus('capturing');
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`/api/sessions/${sessionId}/photos`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setPhotoCount(data.sessionPhotoCount);
      }
    } finally {
      setStatus('idle');
    }
  };

  // Send session
  const sendSession = async () => {
    if (!sessionId) return;
    setStatus('sending');
    try {
      const res = await fetch(`/api/sessions/${sessionId}/send`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setStatus('sent');
      }
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-4">
        <h1 className="text-xl font-bold mb-4">📦 Order Capture</h1>

        {!sessionId ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Merchant ID</label>
              <input
                type="text"
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="e.g., 795024"
              />
            </div>
            <button
              onClick={createSession}
              disabled={!merchantId || status === 'creating'}
              className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
            >
              {status === 'creating' ? 'Creating...' : 'Start Session'}
            </button>
          </>
        ) : status === 'sent' ? (
          <div className="text-center py-8">
            <p className="text-lg font-medium text-green-600">✓ Sent for extraction</p>
            <p className="text-sm text-gray-500 mt-2">
              {photoCount} orders captured. AI extraction running in background.
            </p>
            <button
              onClick={() => {
                setSessionId(null);
                setPhotoCount(0);
                setStatus('idle');
              }}
              className="mt-4 text-blue-600 underline"
            >
              Start New Session
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-gray-600">Session ID: {sessionId}</p>
              <p className="text-2xl font-bold mt-2">Orders: {photoCount}</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) capturePhoto(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={status === 'capturing'}
              className="w-full bg-green-600 text-white py-3 rounded mb-4 disabled:opacity-50"
            >
              {status === 'capturing' ? 'Uploading...' : '📷 Capture Photo'}
            </button>

            {photoCount > 0 && (
              <button
                onClick={sendSession}
                disabled={status === 'sending'}
                className="w-full bg-blue-600 text-white py-3 rounded disabled:opacity-50"
              >
                {status === 'sending' ? 'Sending...' : '✓ Send for Extraction'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
