# Phase 2 · External Signing — AFTER critique (light migration)

**Date:** 2026-05-26
**Method:** `/interface-craft critique` AFTER-pass against the relit admin surface, verified
visually at 1440 + 390 + ConfirmDialog overlay against the BEFORE inventory (35 targets + 3 craft fixes).
**Scope:** Admin dashboard surface only — `client.tsx`, `SendInviteForm.tsx`, `InviteTable.tsx`.
Public signer (`/sign/[token]`, `VerificationForm.tsx`) deliberately untouched.

**Screenshots:**
- `extsigning-after-1440.png` — full admin page (header + SendInviteForm), now in LightShell + breadcrumb
- `extsigning-after-table-1440.png` — InviteTable scrolled into view (status/type tags + actions)
- `extsigning-after-390.png` — mobile
- `extsigning-after-confirm-1440.png` — ConfirmDialog overlay (light panel)

---

## Verdict

The last dark island in the dashboard is gone. The page now wears the same chrome as
Overview/Settings/Team/Payments: `LightShell fill bordered` with a `‹ External Signing`
breadcrumb top-left, `#eeeeee` canvas, white `shadow-seeko` send-form card, and a light
invite table. Every status/type tag is AA-on-white. No regressions to layout, copy, or motion —
this was a pure recolor + chrome unification.

---

## Checklist (from BEFORE-pass) — all verified

- [x] **Wrapped in LightShell + breadcrumb** — breadcrumb visible top-left at 1440 + 390; matches Payments/Team chrome
- [x] **White card + `shadow-seeko`, no dark `Card`** — send-form is `rounded-2xl border-0 bg-white shadow-seeko`
- [x] **All inputs/toggles/chips relit** — recipient input `LIGHT_INPUT`; Template/Upload PDF segmented track `#f4f4f4` with active = white card + `shadow-seeko`; External NDA radio selected azure-tinted; Guardian toggle light; expiration chips light
- [x] **Status + type tags AA on white** — `signed` = quiet grey `#808080` (done state), `Invoice` = amber `#946a00` on `/10` wash, `Signing` = neutral grey on `#f4f4f4`. `pending`/`verified`/`revoked` map to amber/azure/destructive via `LIGHT_SIGNING_STATUS` (seeded data is all `signed`, so loud states unverified visually but verified in code — palette is the same AA-on-white ramp already shipped on Payments)
- [x] **ConfirmDialog** — white panel + `shadow-seeko`, azure chip + `#0a63cc` alert icon, `#808080`/`#111` rows, mono recipient, ghost `DIALOG_CANCEL` + dark `DIALOG_SAVE` Send
- [x] **Empty + loading states light** — code verified (`bg-[#f4f4f4]` chip, `#9a9a9a` icon, `#111` title, `#808080` body); data present so not captured live
- [x] **No dark tokens remain** — `grep` for `text-foreground`/`bg-muted`/`seeko-accent`/`*-300`/`border-border` across the 3 files returns clean
- [x] **Animations preserved (colors only)** — header `springs.smooth` entrance intact; no motion added or removed

---

## Residual craft notes (non-blocking)

1. **Loud-status visual coverage** — all seeded invites are `signed`. The amber `pending`
   (needs-attention) and azure `verified` badges are correct in `LIGHT_SIGNING_STATUS` but
   not exercised by the current data. Acceptable: the ladder mirrors the AA-on-white palette
   already validated on the Payments invoice badges.
2. **`Send Invite` disabled state** — empty-email state renders the dark `#111` button at
   reduced opacity (greyed). Intentional shadcn `disabled:` treatment; reads correctly as
   inactive. Enabled state (email filled) shows solid `#111` — confirmed in the ConfirmDialog shot.
3. **Mobile bottom nav + avatar pill remain dark chrome** — out of scope; these are global
   chrome elements retired in Phase 3, consistent with every other migrated page.

## Token diff summary

- `lightKit.ts`: added `LIGHT_SIGNING_STATUS` (loudness ladder inverted vs invoices — `pending` loud, `signed`/`expired` quiet)
- `client.tsx`: dark bare div → `LightShell` + breadcrumb; azure icon chip; `#111` h1; `#808080` subtitle
- `SendInviteForm.tsx`: dark `Card` → white `shadow-seeko`; all controls → light kit; `DatePicker light`; `DIALOG_SAVE`/`DIALOG_CANCEL` on dialog footer
- `InviteTable.tsx`: `LIGHT_SIGNING_STATUS` status map; light type tags; light search/filter/group chips; light table head + rows; light empty/loading/archive
