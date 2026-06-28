# Preview modal: header buttons overflow, delete button hidden on short screens

## File
`app/capture/page.tsx` — preview modal, lines ~552-699 (the `previewIndex !== null` block).

## Symptom (see screenshot)
Header is one row: `إغلاق | الصورة 4 | تكبير تصغير` — on narrow/short phones this row overflows so `اعادة ضبط` gets pushed off-screen entirely (not just clipped — not rendered visibly). The `حذف الصورة` button is in a separate footer pinned to the bottom of the modal, which can fall below the visible viewport on short screens, so it doesn't appear either.

## Fix — restructure header into a 2x2 button block + move delete under the photo

Replace the current single-row header (lines 553-590) with a 2x2 grid, RTL order (right to left): label `الصورة N` stays as a small heading above/beside the block, not inline with the buttons.

Target layout, top to bottom:
1. Label row: `الصورة N` (own line, centered or right-aligned).
2. 2x2 button grid (RTL reading order: top-right → top-left → bottom-right → bottom-left):
   - Top row: `تكبير` (right), `تصغير` (left)
   - Bottom row: `اعادة ضبط` (right), `إغلاق` (left)
3. Image area (unchanged, flex-1 min-h-0).
4. `حذف الصورة` button directly under the image (not pinned to viewport bottom) — so it's always adjacent to the photo and visible regardless of screen height, instead of being a `shrink-0` footer fighting for space at the bottom of a `h-[100dvh]` column.

## Concrete markup change

Replace:
```tsx
<div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
  <button onClick={closePreview} ...>إغلاق</button>
  <span ...>الصورة {photos[previewIndex].sequence}</span>
  <div className="flex gap-1">
    <button onClick={() => changeImageZoom(0.25)} ...>تكبير</button>
    <button onClick={() => changeImageZoom(-0.25)} ...>تصغير</button>
    <button onClick={resetImageView} ...>إعادة ضبط</button>
  </div>
</div>
```

With:
```tsx
<div className="flex shrink-0 flex-col items-center gap-2 px-3 py-2">
  <span className="text-xs font-semibold text-white/80">
    الصورة {photos[previewIndex].sequence}
  </span>
  <div className="grid grid-cols-2 gap-2" dir="rtl">
    <button className="idv-button idv-button-light idv-button-small px-3 text-sm" disabled={deleting} onClick={() => changeImageZoom(0.25)} type="button">تكبير</button>
    <button className="idv-button idv-button-light idv-button-small px-3 text-sm" disabled={deleting} onClick={() => changeImageZoom(-0.25)} type="button">تصغير</button>
    <button className="idv-button idv-button-light idv-button-small px-3 text-sm" disabled={deleting} onClick={resetImageView} type="button">إعادة ضبط</button>
    <button className="idv-button idv-button-light idv-button-small text-sm" onClick={closePreview} type="button">إغلاق</button>
  </div>
</div>
```

Then move the delete button from the footer (currently after the image div, gated by `status !== 'sent'`) to immediately after the image `<img>`'s closing `</div>` — i.e. delete the existing footer block:
```tsx
{status !== 'sent' && (
  <div className="shrink-0 bg-black/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
    <button ...>حذف الصورة</button>
  </div>
)}
```
and re-insert it as a `shrink-0` block directly under the image container (still gated by the same `status !== 'sent'` condition, same button code, just relocated in the DOM so it sits right under the photo instead of at the bottom of the whole modal).

## Notes for GLM
- `dir="rtl"` on the grid makes CSS grid place the first child (تكبير) in the top-right cell — verify visually after the change; if grid order ends up reversed, swap the order of the four buttons in the JSX rather than fighting the grid with extra CSS.
- Keep all existing button styling classes (`idv-button idv-button-light idv-button-small`) and the `[--idv-fg:#dc2626]` red styling on the delete button — only the position/grouping changes, not the visual style of individual buttons.
- Don't touch zoom/pan/pinch logic, `clampZoom`, touch/pointer handlers, or the `h-[100dvh]` viewport fix already applied — unrelated to this layout change.
- Test on a short-viewport phone (or browser devtools mobile emulation with a small height) to confirm all 5 buttons (تكبير, تصغير, اعادة ضبط, إغلاق, حذف الصورة) are visible without scrolling, regardless of photo aspect ratio.
