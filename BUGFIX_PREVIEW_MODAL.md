# Bug: photo preview modal buttons intermittently missing

## File
`app/capture/page.tsx` — preview modal, lines ~551-699 (the `previewIndex !== null` block).

## Symptom
When opening a captured/uploaded photo in the full-screen preview:
- Sometimes the top bar (إغلاق / تكبير / تصغير / إعادة ضبط) is missing and only the bottom حذف الصورة button shows.
- Sometimes the opposite: top bar shows, bottom حذف button is missing.
- Inconsistent, not tied to a specific photo or action — looks like a timing issue, not app state (both header and footer are rendered by the same JSX conditionals every time the modal opens; neither depends on which photo is selected).

## Root cause
The modal is:
```
<div className="fixed inset-0 z-50 flex touch-none flex-col bg-black/95">
  <div className="shrink-0 ...">...header (close/zoom)...</div>
  <div className="relative flex min-h-0 flex-1 ...">...image...</div>
  {status !== 'sent' && <div className="shrink-0 ...">...delete button...</div>}
</div>
```
`fixed inset-0` is sized against the *current* browser viewport at paint time. On mobile, the address bar / nav chrome shows or hides as the camera/file picker closes or the page scrolls, changing the real visible viewport height shortly after the modal mounts. Because there's no `100dvh`/`visualViewport` resize handling, the flex column can be laid out against a stale (too-short or too-tall) viewport height for one frame, clipping either the header or footer outside the visible area until the browser settles. This matches the symptom: which end gets clipped depends on whether the chrome is animating in or out at that exact moment — pure timing, not logic.

## Fix
1. Replace `fixed inset-0` sizing with a dynamic-viewport-safe approach:
   - Use `h-[100dvh]` (or `h-screen` + a `window.visualViewport` resize listener that re-applies `height` in px) on the modal root instead of relying on `inset-0` alone.
   - If `dvh` isn't reliably supported in the target browsers, add a `useEffect` that listens to `window.visualViewport.resize` / `window.resize` and sets the modal's height via inline style (`element.style.height = `${window.visualViewport.height}px``), updating on mount and on every resize event while the modal is open.
2. Make sure header and footer are NOT removed from the layout flow during the resize — keep `shrink-0` as is, just fix the container height source.
3. Do not change the `status !== 'sent'` gating logic — that's intentional (no delete after the session is sent) and unrelated to this bug.
4. Test by: opening the camera capture sheet on an Android phone (Chrome) and an iPhone (Safari), capturing a photo, immediately tapping the thumbnail to open preview right as the camera UI dismisses (the moment toolbars animate) — repeat ~10x and confirm header+footer are always both present together.

## Out of scope
- Don't touch zoom/pan/pinch logic (`clampZoom`, `getTouchDistance`, pointer/touch handlers) — unrelated and already working.
- Don't add a new dependency — `useEffect` + `window.visualViewport` is native browser API, no install needed.
