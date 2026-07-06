# SPEC: Review UX — thumbnail fix, rotate button, completion screen

Three independent changes to `app/capture/page.tsx`, `app/review/page.tsx`, and `next.config.ts`.

---

## 1 — Fix blank thumbnails in capture phase (regression from CSP)

**Root cause:** `next.config.ts` added a `Content-Security-Policy` with `img-src 'self' data:`. The thumbnails in `capture/page.tsx` use `URL.createObjectURL(file)` (line 249), which produces a `blob:` URL. The CSP now blocks `blob:` URLs for images, causing all thumbnails — and the full-size preview — to be blank.

**File:** `next.config.ts`

**Fix:** add `blob:` to the `img-src` directive.

Before:
```ts
{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';" },
```

After:
```ts
{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none';" },
```

No other changes to `next.config.ts`.

---

## 2 — Add rotate buttons in review image viewer

**File:** `app/review/page.tsx`

### New state
Add one state variable near the other image-view state (around line 167):
```ts
const [imageRotation, setImageRotation] = useState(0); // degrees: 0 | 90 | 180 | 270
```

### Reset rotation with view
In `resetImageView` (line 182–185), also reset rotation:
```ts
const resetImageView = useCallback(() => {
  setImageZoom(1);
  setImagePan({ x: 0, y: 0 });
  setImageRotation(0);
}, []);
```

### Apply rotation in the image transform
The `<img>` style at line 494–497 currently:
```ts
style={{
  transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
  transformOrigin: 'center',
}}
```
Change to:
```ts
style={{
  transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom}) rotate(${imageRotation}deg)`,
  transformOrigin: 'center',
}}
```

### Add rotate buttons in the button bar
The button bar (lines 440–462) currently has three buttons: `+`, `-`, `إعادة`. Add two rotate buttons between `-` and `إعادة`:

```tsx
<div className="absolute right-2 top-2 z-10 flex gap-1">
  <button
    className="idv-button idv-button-light idv-button-small h-8 min-w-8 px-3 text-sm"
    onClick={() => changeImageZoom(0.25)}
    type="button"
  >
    +
  </button>
  <button
    className="idv-button idv-button-light idv-button-small h-8 min-w-8 px-3 text-sm"
    onClick={() => changeImageZoom(-0.25)}
    type="button"
  >
    -
  </button>
  <button
    className="idv-button idv-button-light idv-button-small h-8 px-3 text-sm"
    onClick={() => setImageRotation((r) => (r + 90) % 360)}
    type="button"
  >
    ↻
  </button>
  <button
    className="idv-button idv-button-light idv-button-small h-8 px-3 text-sm"
    onClick={() => setImageRotation((r) => (r - 90 + 360) % 360)}
    type="button"
  >
    ↺
  </button>
  <button
    className="idv-button idv-button-light idv-button-small h-8 px-3 text-xs"
    onClick={resetImageView}
    type="button"
  >
    إعادة
  </button>
</div>
```

---

## 3 — Completion screen after all orders in a session are submitted

**File:** `app/review/page.tsx`

When the reviewer submits the last order in a session (`data.remainingInSession === 0`), instead of silently returning to the queue, show a full-screen completion card. The card has:
- A success message: "تم إرسال X طلبات للتاجر Y بنجاح. شكراً على عملك!" (use the count and merchant name from state at the moment of the last submit)
- Two buttons: one to home (`/`), one to review queue (`/review`)
- A countdown that auto-navigates to `/review` after 15 seconds if neither button is pressed

### New state
Add near the other state declarations (around line 168):
```ts
const [completionInfo, setCompletionInfo] = useState<{ merchantName: string; orderCount: number } | null>(null);
```

### Trigger the completion screen on last submit
In `submitOrder` (lines 273–280), replace:
```ts
if (data.remainingInSession === 0) {
  setSelectedSession(null);
  setCurrentOrderIndex(0);
  await loadQueue();
  setMessage('اكتملت جميع طلبات الجلسة.');
  return;
}
```
With:
```ts
if (data.remainingInSession === 0) {
  setCompletionInfo({
    merchantName: selectedSession.merchant.name,
    orderCount: pendingOrders.length,
  });
  setSelectedSession(null);
  setCurrentOrderIndex(0);
  return;
}
```
Note: do NOT call `loadQueue()` here — the completion screen is showing, not the queue. The queue loads when the user navigates to `/review`.

### Auto-redirect countdown effect
Add a `useEffect` (alongside the existing `useEffect` at line 225) that fires when `completionInfo` becomes non-null, counts down 15 seconds, then navigates to `/review`:

```ts
useEffect(() => {
  if (!completionInfo) return;
  const timer = window.setTimeout(() => {
    window.location.href = '/review';
  }, 15_000);
  return () => window.clearTimeout(timer);
}, [completionInfo]);
```

### Render the completion screen
In the JSX return, before the `!selectedSession ? (...)` block (around line 372), add a completion screen branch. If `completionInfo` is set, render this card instead of the queue or session view:

```tsx
{completionInfo ? (
  <div className="flex min-h-[60vh] items-center justify-center py-10">
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-6">
      <div className="text-5xl">✅</div>
      <div>
        <h2 className="text-xl font-bold text-[#17365F]">
          تم إرسال {completionInfo.orderCount} {completionInfo.orderCount === 1 ? 'طلب' : 'طلبات'} بنجاح
        </h2>
        <p className="mt-1 text-sm text-slate-500">{completionInfo.merchantName}</p>
        <p className="mt-3 text-sm font-medium text-slate-700">
          شكراً على عملك! سيتم توجيهك إلى قائمة المراجعة تلقائياً بعد 15 ثانية.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <a
          className="idv-button idv-button-light h-11 text-sm"
          href="/"
        >
          الرئيسية
        </a>
        <a
          className="idv-button h-11 text-sm"
          href="/review"
        >
          قائمة المراجعة
        </a>
      </div>
    </div>
  </div>
) : !selectedSession ? (
  /* ...existing queue JSX unchanged... */
) : (
  /* ...existing session/order JSX unchanged... */
)}
```

Use `<a href="...">` (not `<Link>`) so the navigation is a hard nav that resets all state cleanly (especially `completionInfo`). Do not add a `setCompletionInfo(null)` call on button click — the page unmounts on navigate.

---

## Out of scope
- No changes to any API routes.
- No changes to the capture page rotate/preview — that modal already has zoom/pan; rotate was only requested for the review step.
- No changes to the delete-order path when `remainingInSession === 0` — that's "nothing left to delete", not "all submitted"; keep the existing behavior (load queue, show message).
- Re-run lint + build after all three changes.
