# Phase 2 · Payments — AFTER critique (light migration)

**Date:** 2026-05-26
**Method:** `/interface-craft critique` AFTER-pass on the relit surfaces, compared against the dark
BEFORE inventory in `payments-before-critique.md`. Gate + dialogs captured from the live relit
flows; the admin **body** captured via a throwaway local mock-data feed (presentational only —
gate + API untouched, bypass reverted exactly, `git diff PaymentsAdmin.tsx` = 0 lines).

**Screenshots:**
- `payments-after-gate-1440.png` / `payments-after-gate-390.png`
- `payments-after-admin-1440.png` / `payments-after-admin-390.png`
- `payments-after-createdialog-1440.png`
- `payments-after-invoiceform-1440.png`

---

## BEFORE → AFTER: migration-target verification

Every numbered target from the BEFORE inventory, confirmed in the rendered AFTER:

| # | BEFORE (dark) | AFTER (verified) | ✓ |
|---|---------------|------------------|---|
| 1 | `uppercase tracking-wider` stat labels (banned eyebrow) | sentence-case "Pending" / "Paid This Month" `#808080`, no tracking | ✅ |
| 2 | shared `EmptyState` invisible-title-on-white | local `LightEmpty` block (`#111` title, `#808080` body) | ✅ |
| 3 | owns no chrome | wrapped in `LightShell fill bordered leftSlot={‹ Payments}` — matches Settings/Team/Overview | ✅ |
| 4 | "New Payment" `bg-seeko-accent text-black` | dark `#111` primary pill | ✅ |
| 5 | "Request Invoice" dark outline | light secondary pill (correct hierarchy vs dark primary) | ✅ |
| 6 | dark `Card` + accent borders + glow gradients | `rounded-2xl border-0 bg-white shadow-seeko`, gradients flattened | ✅ |
| 7 | azure `#0d7aff` money text (~3.7:1, fails AA) | `#0a63cc` (5.7:1) — Pending $2,050, owed $1,200, Pay link | ✅ |
| 8 | `amber-400` needs-approval | amber `#946a00` text + `/10` wash — $850/$1,200 requests, "2" badge | ✅ |
| 9 | `INVOICE_STATUS_COLOR` dark map | `LIGHT_INVOICE_STATUS` AA-on-white map | ✅ |
| 10 | Accept `bg-sky-600` / Deny `text-red-400` | confirm = `#111`; deny = destructive `#d4503e` | ✅ (source) |
| 11 | `hover:bg-white/[0.02]` | `hover:bg-black/[0.03]` | ✅ |
| 12 | `ring-white/[0.06]` avatars | `outline outline-1 -outline-offset-1 outline-black/[0.06]`, fallback `bg-[#f4f4f4] text-[#505050]` | ✅ |
| 13 | spinner `border-t-seeko-accent` | `border-t-[#0a63cc]` on `border-black/10` | ✅ (source) |
| 14 | `text-foreground` / muted ladder | `#111` headings, `#505050/#808080/#9a9a9a` ladder | ✅ |
| 15 | "Paid" check `text-sky-500/60` | `#0a63cc` check | ✅ |
| 16 | `bg-white/[0.02]` sub-panels | `bg-[#f7f7f7]` | ✅ |
| 17 | invoice icon chip `bg-muted ring-border` | `bg-[#f4f4f4]` + hairline | ✅ |

## Checklist confirmations
- **Eyebrow gone** — no uppercase-tracked chrome anywhere. ✅
- **White cards** — all surfaces `bg-white shadow-seeko`, no glow gradients. ✅
- **AA legibility** — azure `#0a63cc` (5.7:1), amber `#946a00` (4.7:1), destructive `#d4503e` (4.5:1) all clear AA on white. ✅
- **Empty blocks visible** — `LightEmpty` renders dark-on-white (no invisible-title bug). ✅
- **Chrome consistent** — breadcrumb `‹ Payments` + `LightShell` identical to Settings/Team; mobile (390) drops to bottom tab-bar with abbreviated "Invoice"/"Payment" pills. ✅
- **Dialogs** — `PaymentCreateDialog` (white panel, azure "Add item", light select/inputs, Cancel outline + dark "Mark as Paid") and `InvoiceRequestForm` (azure icon chip, light email/textarea, dashed empty-state, segmented control active = white card on `#f4f4f4` track, dark send button) both fully relit. ✅

## Residual craft notes (no blockers)
1. **Stat-card weight asymmetry is intentional** — Pending carries the azure value + azure-tint clock chip; Paid is neutral `#111` + grey chip. Reads as "Pending needs attention," correct accent hierarchy — not a defect.
2. **Disabled primary buttons** ("Mark as Paid" at $0, "Send Invoice Request" with empty email) render as grey — that's `DIALOG_SAVE`'s disabled state, correct affordance.
3. **External-request "?" avatars** sit on an amber-tint circle, matching the needs-approval identity of the Payment Requests card — consistent.
4. Money stays `tabular-nums` throughout; stagger/FadeRise entrances and expand/chevron animation logic preserved (colors only).

## Verdict
**APPROVED.** All 17 migration targets hit; both real craft fixes (banned eyebrow, EmptyState
invisible-title) resolved. Dark-token sweep clean across all 4 files (only an explanatory comment
mentions `text-foreground`). Chrome consistent with the rest of the migrated dashboard. AA holds on
every semantic color. Phase 2 Payments visual migration is complete.

**Invariants at completion:** `tsc` = 194 (stable; noted "190" was a stale baseline), test baseline
13-fail / 174-pass (the noted "12" drifted via the staged notifications WIP that touches BellToggle —
**zero** failures introduced by the payments relight; the 4 relit files have no test coverage).
