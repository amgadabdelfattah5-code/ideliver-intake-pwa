'use client';

import Link from 'next/link';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

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

const maxBulkPhotos = 20;

const statusLabels: Record<CaptureStatus, string> = {
  idle: 'في الانتظار',
  searching: 'جاري البحث',
  creating: 'جاري الإنشاء',
  capturing: 'جاري الرفع',
  sending: 'جاري الإرسال',
  sent: 'تم الإرسال',
};

function statusLabel(status: CaptureStatus): string {
  return statusLabels[status];
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.readAsDataURL(file);
  });
}

// ponytail: mirrors clampZoom in app/review/page.tsx; extracted to lib if a 3rd caller appears.
function clampZoom(value: number): number {
  return Math.min(4, Math.max(1, Number(value.toFixed(2))));
}

// ponytail: structural type so both React.TouchList and DOM TouchList fit without imports.
type TouchPointList = ArrayLike<{ clientX: number; clientY: number }>;

function getTouchDistance(touches: TouchPointList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getTouchCenter(touches: TouchPointList): { x: number; y: number } {
  if (touches.length === 0) return { x: 0, y: 0 };
  if (touches.length === 1) return { x: touches[0].clientX, y: touches[0].clientY };
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

export default function CapturePage() {
  const [query, setQuery] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [message, setMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [deleting, setDeleting] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const imageViewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const touchGestureRef = useRef<{
    distance: number;
    centerX: number;
    centerY: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);

  const applyImageView = useCallback((zoom: number, pan: { x: number; y: number }) => {
    const nextZoom = clampZoom(zoom);
    const nextPan = nextZoom === 1 ? { x: 0, y: 0 } : pan;

    imageViewRef.current = { zoom: nextZoom, pan: nextPan };
    setImageZoom(nextZoom);
    setImagePan(nextPan);
  }, []);

  const resetImageView = useCallback(() => {
    applyImageView(1, { x: 0, y: 0 });
  }, [applyImageView]);

  const changeImageZoom = useCallback((delta: number) => {
    applyImageView(imageViewRef.current.zoom + delta, imageViewRef.current.pan);
  }, [applyImageView]);

  const openPreview = (index: number) => {
    setPreviewIndex(index);
    resetImageView();
  };

  const closePreview = () => {
    setPreviewIndex(null);
    dragRef.current = null;
    touchGestureRef.current = null;
    resetImageView();
  };

  const deletePhotoAtIndex = async (index: number) => {
    if (deleting) return;
    if (status === 'sent' || status === 'sending') {
      setMessage('لا يمكن حذف الصورة بعد إرسال الجلسة للذكاء الاصطناعي.');
      return;
    }

    const photo = photos[index];
    if (!photo) return;

    if (!window.confirm('هل تريد حذف هذه الصورة وإعادة رفع صورة أوضح؟')) return;

    setDeleting(true);
    setMessage('');

    try {
      const response = await fetch(`/api/orders/${photo.orderId}`, { method: 'DELETE' });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || 'فشل حذف الصورة');
        return;
      }

      URL.revokeObjectURL(photo.previewUrl);
      const remaining = photos.filter((item) => item.orderId !== photo.orderId);
      setPhotos(remaining);

      // adjust the open preview (if any) to the next/previous photo, or close it
      setPreviewIndex((current) => {
        if (current === null) return null;
        if (remaining.length === 0) return null;
        if (current < index) return current;
        if (current === index) return Math.min(index, remaining.length - 1);
        return current - 1;
      });

      if (remaining.length === 0) {
        setMessage('تم حذف الصورة ولا توجد صور أخرى.');
      } else {
        resetImageView();
      }
    } catch {
      setMessage('تعذّر حذف الصورة.');
    } finally {
      setDeleting(false);
    }
  };

  const searchMerchants = async () => {
    setMessage('');
    setHasSearched(false);
    setStatus('searching');

    try {
      const response = await fetch(`/api/merchants?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || 'فشل البحث عن التاجر');
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
        setMessage(data.error || 'تعذّر بدء الجلسة');
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

  const uploadPhoto = async (file: File) => {
    if (!sessionId) throw new Error('لا توجد جلسة نشطة');

    const photoDataUrl = await fileToDataUrl(file);

    const response = await fetch(`/api/sessions/${sessionId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoDataUrl }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'فشل رفع الصورة');
    }

    setPhotos((current) => [
      ...current,
      {
        orderId: data.order.id,
        sequence: data.order.sequence,
        previewUrl: URL.createObjectURL(file),
      },
    ]);
  };

  const capturePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !sessionId) return;

    setMessage('');
    setUploadProgress('');
    setStatus('capturing');

    try {
      await uploadPhoto(file);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'فشل رفع الصورة');
    } finally {
      event.target.value = '';
      setUploadProgress('');
      setStatus('idle');
    }
  };

  const bulkUploadPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0 || !sessionId) return;

    const files = selectedFiles.slice(0, maxBulkPhotos);
    setMessage(
      selectedFiles.length > maxBulkPhotos
        ? `سيتم رفع أول ${maxBulkPhotos} صورة فقط في هذه الدفعة.`
        : ''
    );
    setStatus('capturing');

    let currentProgress = 'رفع جماعي';

    try {
      for (const [index, file] of files.entries()) {
        currentProgress = `جاري رفع الصورة ${index + 1} من ${files.length}`;
        setUploadProgress(currentProgress);
        await uploadPhoto(file);
      }

      setMessage(
        selectedFiles.length > maxBulkPhotos
          ? `تم رفع أول ${files.length} صورة. ابدأ دفعة جديدة للصور المتبقية.`
          : `تم رفع ${files.length} صورة. راجع المصغّرات ثم أرسلها لاستخراج البيانات.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${currentProgress} فشل: ${error.message}`
          : 'فشل الرفع الجماعي'
      );
    } finally {
      event.target.value = '';
      setUploadProgress('');
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
        setMessage(data.error || 'تعذّر إرسال الجلسة');
        setStatus('idle');
        return;
      }

      setMessage(`تم إرسال ${data.orderCount} صورة إلى الذكاء الاصطناعي وجاري استخراج البيانات.`);
      setStatus('sent');
    } catch {
      setMessage('تعذّر إرسال الجلسة');
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
    setUploadProgress('');
    setPreviewIndex(null);
    dragRef.current = null;
    touchGestureRef.current = null;
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#F27321]">تدفّق الهاتف</p>
            <h1 className="text-xl font-bold text-[#17365F]">تصوير الإيصالات</h1>
          </div>
          <Link className="text-sm font-medium text-[#17365F]" href="/">
            الرئيسية
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-5">
        {!sessionId && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">البحث عن التاجر</span>
              <div className="mt-2 flex gap-2">
                <input
                  className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#F27321] focus:ring-2 focus:ring-[#F27321]/20"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') searchMerchants();
                  }}
                  placeholder="اسم التاجر أو الهاتف أو الرقم"
                />
                <button
                  className="idv-button h-11 text-sm"
                  disabled={status === 'searching'}
                  onClick={searchMerchants}
                  type="button"
                >
                  {status === 'searching' ? 'جاري البحث' : 'بحث'}
                </button>
              </div>
            </label>

            {merchants.length > 0 && (
              <div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
                {merchants.map((merchant) => (
                  <button
                    className="idv-button idv-button-light my-2 w-full justify-start rounded-md px-3 py-3 text-left"
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
                لا توجد نتائج. جرّب البحث برقم التاجر أو الهاتف أو جزء من الاسم.
              </p>
            )}
          </div>
        )}

        {sessionId && selectedMerchant && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">الجلسة الحالية</p>
              <h2 className="mt-1 text-lg font-bold text-[#17365F]">{selectedMerchant.name}</h2>
              <p className="mt-1 text-xs text-slate-500">الجلسة {sessionId}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">الطلبات</p>
                  <p className="text-3xl font-bold text-[#17365F]">{photos.length}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">الحالة</p>
                  <p className="text-lg font-bold text-[#17365F]">{statusLabel(status)}</p>
                </div>
              </div>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <div
                    className="relative aspect-square cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-white"
                    key={photo.orderId}
                    onClick={() => openPreview(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openPreview(index);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={`إيصال ${photo.sequence}`}
                      className="h-full w-full object-cover"
                      src={photo.previewUrl}
                    />
                    {status !== 'sent' && (
                      <button
                        aria-label="حذف الصورة"
                        className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-sm font-bold leading-none text-white shadow-md disabled:opacity-50"
                        disabled={deleting || status === 'sending'}
                        onClick={(event) => {
                          event.stopPropagation();
                          void deletePhotoAtIndex(index);
                        }}
                        type="button"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <input
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={capturePhoto}
              ref={cameraInputRef}
              type="file"
            />
            <input
              accept="image/*"
              className="hidden"
              multiple
              onChange={bulkUploadPhotos}
              ref={bulkInputRef}
              type="file"
            />

            {status !== 'sent' ? (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className="idv-button idv-button-orange h-12 text-sm"
                    disabled={status === 'capturing' || status === 'sending'}
                    onClick={() => cameraInputRef.current?.click()}
                    type="button"
                  >
                    {status === 'capturing' ? 'جاري الرفع...' : 'تصوير إيصال'}
                  </button>

                  <button
                    className="idv-button idv-button-light h-12 text-sm"
                    disabled={status === 'capturing' || status === 'sending'}
                    onClick={() => bulkInputRef.current?.click()}
                    type="button"
                  >
                    رفع جماعي (حد أقصى 20 صورة)
                  </button>
                </div>

                {uploadProgress && (
                  <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#17365F]">
                    {uploadProgress}
                  </p>
                )}

                <button
                  className="idv-button h-12 text-sm"
                  disabled={photos.length === 0 || status === 'sending'}
                  onClick={sendSession}
                  type="button"
                >
                  {status === 'sending' ? 'جاري الإرسال...' : `إرسال ${photos.length} طلب`}
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                <Link
                  className="idv-button h-12 text-sm"
                  href={sessionId ? `/review?session=${encodeURIComponent(sessionId)}` : '/review'}
                >
                  فتح قائمة المراجعة
                </Link>
                <button
                  className="idv-button idv-button-light h-12 text-sm"
                  onClick={resetSession}
                  type="button"
                >
                  بدء جلسة جديدة
                </button>
              </div>
            )}
          </div>
        )}

        {previewIndex !== null && photos[previewIndex] && (
          <div className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] touch-none flex-col bg-black/95" role="dialog" aria-modal="true">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
              <button
                className="idv-button idv-button-light idv-button-small text-sm"
                onClick={closePreview}
                type="button"
              >
                إغلاق
              </button>
              <span className="text-xs font-semibold text-white/80">
                الصورة {photos[previewIndex].sequence}
              </span>
              <div className="flex gap-1">
                <button
                  className="idv-button idv-button-light idv-button-small px-3 text-sm"
                  disabled={deleting}
                  onClick={() => changeImageZoom(0.25)}
                  type="button"
                >
                  تكبير
                </button>
                <button
                  className="idv-button idv-button-light idv-button-small px-3 text-sm"
                  disabled={deleting}
                  onClick={() => changeImageZoom(-0.25)}
                  type="button"
                >
                  تصغير
                </button>
                <button
                  className="idv-button idv-button-light idv-button-small px-3 text-sm"
                  disabled={deleting}
                  onClick={resetImageView}
                  type="button"
                >
                  إعادة ضبط
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`إيصال ${photos[previewIndex].sequence}`}
                className={`max-h-full max-w-full touch-none object-contain ${
                  imageZoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                }`}
                draggable={false}
                onPointerDown={(event) => {
                  // ponytail: pointer handlers are mouse-only; touch gestures own their own path below.
                  if (imageViewRef.current.zoom === 1 || event.pointerType !== 'mouse') return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                    panX: imageViewRef.current.pan.x,
                    panY: imageViewRef.current.pan.y,
                  };
                }}
                onPointerMove={(event) => {
                  if (!dragRef.current) return;
                  applyImageView(imageViewRef.current.zoom, {
                    x: dragRef.current.panX + event.clientX - dragRef.current.x,
                    y: dragRef.current.panY + event.clientY - dragRef.current.y,
                  });
                }}
                onPointerUp={() => {
                  dragRef.current = null;
                }}
                onPointerCancel={() => {
                  dragRef.current = null;
                }}
                onLostPointerCapture={() => {
                  dragRef.current = null;
                }}
                onTouchStart={(event) => {
                  if (event.touches.length === 0) return;
                  const center = getTouchCenter(event.touches);
                  touchGestureRef.current = {
                    distance: getTouchDistance(event.touches),
                    centerX: center.x,
                    centerY: center.y,
                    zoom: imageViewRef.current.zoom,
                    panX: imageViewRef.current.pan.x,
                    panY: imageViewRef.current.pan.y,
                  };
                }}
                onTouchMove={(event) => {
                  const gesture = touchGestureRef.current;
                  if (!gesture || event.touches.length === 0) return;
                  event.preventDefault();
                  const center = getTouchCenter(event.touches);

                  if (event.touches.length >= 2 && gesture.distance > 0) {
                    const scale = getTouchDistance(event.touches) / gesture.distance;
                    const nextZoom = clampZoom(gesture.zoom * scale);
                    applyImageView(nextZoom, {
                      x: gesture.panX + (center.x - gesture.centerX),
                      y: gesture.panY + (center.y - gesture.centerY),
                    });
                  } else if (event.touches.length === 1 && imageViewRef.current.zoom > 1) {
                    applyImageView(imageViewRef.current.zoom, {
                      x: gesture.panX + (center.x - gesture.centerX),
                      y: gesture.panY + (center.y - gesture.centerY),
                    });
                  }
                }}
                onTouchEnd={(event) => {
                  if (event.touches.length === 0) {
                    touchGestureRef.current = null;
                    return;
                  }
                  // re-baseline for the remaining finger(s) so a lifted pinch finger keeps panning
                  const center = getTouchCenter(event.touches);
                  touchGestureRef.current = {
                    distance: getTouchDistance(event.touches),
                    centerX: center.x,
                    centerY: center.y,
                    zoom: imageViewRef.current.zoom,
                    panX: imageViewRef.current.pan.x,
                    panY: imageViewRef.current.pan.y,
                  };
                }}
                onTouchCancel={() => {
                  touchGestureRef.current = null;
                }}
                src={photos[previewIndex].previewUrl}
                style={{
                  transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
                  transformOrigin: 'center',
                }}
              />
            </div>

            {status !== 'sent' && (
              <div className="shrink-0 bg-black/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <button
                  className="idv-button idv-button-light idv-button-small w-full text-sm [--idv-fg:#dc2626]"
                  disabled={deleting || status === 'sending'}
                  onClick={() => deletePhotoAtIndex(previewIndex)}
                  type="button"
                >
                  {deleting ? 'جاري الحذف...' : 'حذف الصورة'}
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
