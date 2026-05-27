# Phase 2 · Payments — BEFORE critique (dark baseline)

**Date:** 2026-05-26
**Method:** `/interface-craft critique` on the dark baseline. Gate captured visually
(`payments-before-gate.png`, 1440); the 900-line admin **body** is critiqued from source
(`PaymentsAdmin.tsx`) because it sits behind a passkey + JWT-cookie gate that headless
Playwright cannot satisfy without a real device or the recovery secret (which must not be
requested/printed). A temporary `useState(true)` bypass was attempted and reverted — it
fails because `fetchData()` resets `authenticated=false` on the API 401, so the body never
renders with real data without a genuine session. Visual QA of the **relit** body at T4 will
use a throwaway local mock-data feed (presentational only; the real gate + API stay intact).

---

## Surfaces in scope

1. **PaymentsPasskeyGate** (entry) — `payments-before-gate.png`
2. **PaymentsAdmin body** — Hero · 2 Stat cards · Payment Requests (amber) · Invoice Requests ·
   People list · Recent Payments. Sub-rows: `PaidPaymentRow`, `PendingRequestRow`,
   `InvoiceRequestRow`. Owns **no chrome** — relies on the dashboard layout.
3. Dialogs (separate components, relit later in T3): `PaymentCreateDialog`, `InvoiceRequestForm`.

## First impressions (dark baseline)
Coherent dark dashboard: layered `Card` surfaces, azure (`--seeko-accent` `#0d7aff`) as the
money/primary accent, amber as the "needs approval" accent, staggered entrances. It reads well
on near-black but is built entirely on dark tokens — nothing here survives a white background as-is.

## Dark-token / structural inventory → migration targets

| # | Location | Dark baseline | Light target (T2 decision) |
|---|----------|---------------|----------------------------|
| 1 | Stat card labels (`l.254`) | `uppercase tracking-wider text-muted-foreground` | **BANNED eyebrow** — sentence-case `text-[13px] text-[#808080]` |
| 2 | EmptyState "No results" / "No completed payments" (`l.423,494`) | shared `EmptyState` (`text-foreground` title) | **invisible-title bug on white** → local light empty block per page |
| 3 | Whole component | owns no chrome | wrap in `<LightShell fill bordered leftSlot={‹ Payments}>` (Settings/Team idiom) |
| 4 | "New Payment" primary (`l.226`) | `bg-seeko-accent text-black hover:bg-seeko-accent/90` | `BTN_PRIMARY` (`bg-[#111] text-white`) |
| 5 | "Request Invoice" (`l.219`) | `Button variant="outline"` (dark) | `BTN_SECONDARY` light |
| 6 | Cards (`l.245,287,333,373,480`) | dark `Card` (+ accent borders + glow gradients) | `rounded-2xl border-0 bg-white shadow-seeko`; **flatten the `from-*/[0.06]` glow gradients** |
| 7 | Pending amount + filter pills + Pay btn | azure `#0d7aff` as **text** (`var(--color-seeko-accent)`, `text-seeko-accent`) | `#0d7aff` is ~3.7:1 on white = **fails AA for text** → `#0a63cc` (5.7:1), per Team-phase precedent |
| 8 | Payment Requests card + `PendingRequestRow` | `amber-500/25` border, `amber-400` text/amount, `text-amber-300` fallback | light amber: text `#946a00`, wash `#b8801a/10` (Docs pending precedent) |
| 9 | `INVOICE_STATUS_COLOR` map (`l.760`) | `blue-400 / amber-400 / sky-400 / red-400` + `/10` washes | AA-on-white: verified/approved `#0a63cc`, submitted `#946a00`, rejected/revoked `#d4503e`, pending/expired neutral `#808080` |
| 10 | Accept / Deny (`l.733,743`) | `bg-sky-600 text-white` / `text-red-400 hover:bg-red-500/10` | confirm = `BTN_PRIMARY`; deny = destructive `#d4503e` light |
| 11 | Row hovers (`l.432,547,660,825`) | `hover:bg-white/[0.02]` | `hover:bg-black/[0.03]` |
| 12 | Avatar rings (`l.434,550`) | `ring-1 ring-white/[0.06]`, fallback `bg-secondary text-foreground` | `outline outline-1 -outline-offset-1 outline-black/[0.06]`, fallback `bg-[#f4f4f4] text-[#505050]` (image-outline idiom) |
| 13 | Loading spinner (`l.418`) | `border-t-seeko-accent` on `border-muted-foreground/20` | `border-t-[#0a63cc]` on `border-black/10` |
| 14 | Body text / chevrons | `text-foreground` / `text-muted-foreground(/40,/50,/60)` | `#111` headings, `#505050`/`#808080`/`#9a9a9a` muted ladder |
| 15 | "Paid" check (`l.462`) | `text-sky-500/60` | `#0a63cc` |
| 16 | Sub-panels (`l.588,609,721`) | `bg-white/[0.02]` | `bg-[#f7f7f7]` / `bg-black/[0.02]` |
| 17 | Invoice icon chip (`l.828`) | `bg-muted ring-border` | `bg-[#f4f4f4]` + hairline |

## Structural notes (carry over unchanged)
- Money is already `tabular-nums` throughout — good, keep it.
- Expandable rows (height auto + chevron rotate) — animation logic stays; only colors change.
- Stagger/FadeRise entrances stay.
- PayPal copy-to-clipboard affordance stays (recolor hover from `seeko-accent` → `#0a63cc`).

## Verdict
Dark baseline is internally consistent but 100% dark-token. Migration is mechanical
application of the established lightKit + two real craft fixes (banned eyebrow on stat labels;
EmptyState invisible-title) + a chrome wrap. **No new design language needed** — same kit as
Settings/Docs/Team. Proceed to T2 (design + plan).
