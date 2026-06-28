# Add "Cancel session" button to capture screen

## File
`app/capture/page.tsx`

## Backend (already exists, no changes needed)
`DELETE /api/sessions/:id` (`app/api/sessions/[id]/route.ts`) already:
- Cancels the session and hard-deletes its unsubmitted orders/photos.
- Returns 409 with `{ error: '...' }` if any order in the session was already submitted (so an active session that already got far enough can't be silently destroyed).
- Logs an `actionLog` entry `session.cancel`.

This task is frontend-only: add a button that calls this endpoint and resets local state.

## UI change
In the active-session view (the `sessionId && selectedMerchant` block, ~lines 418-549), where the 3 action buttons currently render (تصوير إيصال / رفع جماعي / إرسال, ~lines 494-530), add a 4th button: **إلغاء الجلسة** (cancel session).

Placement: under the existing button group, before/instead of crowding the existing grid — add it as its own row below the إرسال button, styled as a clearly destructive/secondary action (e.g. `idv-button idv-button-light` with red text via `[--idv-fg:#dc2626]`, same pattern already used for the delete-photo button elsewhere in this file) so it's visually distinct from the primary actions and not mistaken for "Send".

Disable it while `status === 'capturing' || status === 'sending'` (same disabled pattern as the other buttons) — don't let pickup cancel mid-upload or mid-send.

## Behavior
1. On click, show a confirm dialog (same pattern as `deletePhotoAtIndex` — `window.confirm(...)`), e.g.:
   `هل تريد إلغاء هذه الجلسة؟ سيتم حذف جميع الصور المرفوعة ولا يمكن التراجع عن ذلك.`
2. If confirmed, call `DELETE /api/sessions/${sessionId}`.
3. On success: revoke all photo preview object URLs (`photos.forEach((p) => URL.revokeObjectURL(p.previewUrl))`) and reset the same state `resetSession()` already resets (selectedMerchant, sessionId, photos, status, message, uploadProgress, previewIndex, dragRef, touchGestureRef) — i.e. just call the existing `resetSession()` function after a successful DELETE, no need to duplicate that logic.
4. On failure (e.g. 409 because something was already submitted): show the server's `error` message via `setMessage(...)`, same pattern as other failure paths in this file. Do NOT reset state in this case — the session is still active.
5. Add a small loading guard (e.g. reuse `deleting` state or a new local `cancelling` boolean) so double-clicks can't fire two DELETE calls; disable the button while the cancel request is in flight.

## Out of scope
- Don't touch the "بدء جلسة جديدة" button in the `status === 'sent'` branch — that's a different, already-correct reset-after-send flow for a session that already finished, not a mid-session cancel.
- Don't change the API route.
- Re-run lint + build after the change.
