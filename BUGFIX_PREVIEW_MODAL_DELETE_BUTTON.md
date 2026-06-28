# Preview modal: move حذف الصورة into the header button block

## File
`app/capture/page.tsx` — preview modal header, lines ~552-590, and the delete button block at ~686-697.

## Problem
حذف الصورة is still not visible. It currently sits in its own `shrink-0` block right after the image container, competing with the `flex-1 min-h-0` image for space inside the `h-[100dvh]` column — on some screens it still gets squeezed out.

## Fix
Move `حذف الصورة` out of its standalone block entirely and into the header's button grid, directly below the existing 2x2 grid, so the header becomes one self-contained block (label + 2x2 grid + delete row) that is never affected by image sizing.

1. Delete the standalone delete block (currently right after the image `</div>`, ~lines 686-697):
```tsx
{status !== 'sent' && (
  <div className="shrink-0 px-3 py-2">
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
```

2. Re-insert the same button (same classes, same gating, same handler) immediately after the closing `</div>` of the 2x2 grid (line ~589), still inside the header's `flex shrink-0 flex-col items-center gap-2 px-3 py-2` container, so it renders as a full-width row under the grid:
```tsx
<div className="flex shrink-0 flex-col items-center gap-2 px-3 py-2">
  <span className="text-xs font-semibold text-white/80">
    الصورة {photos[previewIndex].sequence}
  </span>
  <div className="grid grid-cols-2 gap-2" dir="rtl">
    {/* تكبير / تصغير / إعادة ضبط / إغلاق — unchanged */}
  </div>
  {status !== 'sent' && (
    <button
      className="idv-button idv-button-light idv-button-small w-full text-sm [--idv-fg:#dc2626]"
      disabled={deleting || status === 'sending'}
      onClick={() => deletePhotoAtIndex(previewIndex)}
      type="button"
    >
      {deleting ? 'جاري الحذف...' : 'حذف الصورة'}
    </button>
  )}
</div>
```

## Result
Header block now has, top to bottom: label, 2x2 grid (تكبير/تصغير, إعادة ضبط/إغلاق), then حذف الصورة as a full-width row underneath — all 5 buttons grouped in one `shrink-0` header that never competes with the image for layout space.

## Out of scope
Don't touch the image area, zoom/pan/pinch logic, or the `h-[100dvh]` viewport fix. Re-run lint + build after the change.
