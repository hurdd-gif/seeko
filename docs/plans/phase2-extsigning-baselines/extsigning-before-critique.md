# Phase 2 · External Signing — BEFORE critique (light migration)

**Date:** 2026-05-26
**Method:** `/interface-craft critique` BEFORE-pass against the live dark surfaces + source read.
**Scope:** Admin dashboard surface only — `client.tsx` (header), `SendInviteForm.tsx`, `InviteTable.tsx`.
The public signer (`/sign/[token]`, `VerificationForm.tsx`) is the **external-party** surface — out of
scope, mirroring Payments where `PaymentRequestDialog` + investor portal were excluded.

**Screenshots:**
- `extsigning-before-1440.png` — full admin page (header + SendInviteForm + InviteTable), floating in OLD dark DesktopHeader chrome
- `extsigning-before-390.png` — mobile
- `extsigning-before-confirm-1440.png` — ConfirmDialog overlay

---

## First impressions (dark baseline)

The page is the last dark island in the dashboard: bold white "External Signing" title in a
`seeko-accent/10` chip, a dark `Card` send-form with numbered steps, and a dense dark invite table.
It floats in the **old dark DesktopHeader** (Overview/Tasks/Docs/Activity tabs + dark avatar pill) —
no `LightShell`, no breadcrumb, inconsistent with the migrated Overview/Settings/Team/Payments.
Status colors are dark-mode neons (`seeko-accent`, `blue-300`, `red-300`, `amber-300`) that fail AA on white.

---

## Migration-target inventory (dark → planned light)

### A. `client.tsx` — page header / chrome
| # | BEFORE (dark) | Planned AFTER (light) |
|---|---------------|------------------------|
| 1 | owns no chrome; bare `max-w-4xl p-6` div in dark DesktopHeader | wrap in `LightShell fill bordered leftSlot={‹ External Signing}` — matches Payments/Team |
| 2 | icon chip `bg-seeko-accent/10 ring-seeko-accent/20`, `text-seeko-accent` | `bg-[#0a63cc]/10` chip, `text-[#0a63cc]` icon |
| 3 | `text-2xl font-bold text-foreground` h1 | `text-[#111]` (light heading) |
| 4 | `text-muted-foreground` subtitle | `text-[#808080]` |

### B. `SendInviteForm.tsx` — the send-invite card
| # | BEFORE (dark) | Planned AFTER (light) |
|---|---------------|------------------------|
| 5 | dark `Card`/`CardContent` | `rounded-2xl border-0 bg-white shadow-seeko` |
| 6 | step badges `bg-foreground text-background` | `bg-[#111] text-white` (kept — reads on white) |
| 7 | step labels `text-foreground`; dark `Input` | `text-[#111]`; `LIGHT_INPUT` |
| 8 | divider `h-px bg-border` | `border-t border-black/[0.06]` |
| 9 | template toggle track `bg-muted/50`, active `bg-background … ring-border`, inactive `text-muted-foreground` | track `bg-[#f4f4f4] border-black/[0.06]`, active `bg-white text-[#111] shadow-seeko`, inactive `text-[#808080] hover:text-[#111]` |
| 10 | template radios selected `border-seeko-accent/40 bg-seeko-accent/5`, `accent-seeko-accent` | selected `border-[#0a63cc]/40 bg-[#0a63cc]/[0.06]`, `accent-[#0a63cc]`, `text-[#111]`/`text-[#808080]` |
| 11 | PDF dashed `border-border hover:border-muted-foreground/30`, `text-muted-foreground` | `border-black/[0.12] hover:border-black/[0.2]`, `text-[#9a9a9a]` |
| 12 | uploaded-file chip `border-border bg-muted/30` | `border-black/[0.06] bg-[#f7f7f7]` |
| 13 | section-preview panel `border-border bg-muted/30`, `prose-invert` | `border-black/[0.06] bg-[#f7f7f7]`, drop `prose-invert` → light prose |
| 14 | Guardian toggle active `bg-seeko-accent/8 ring-seeko-accent/25`, chip `bg-seeko-accent/15 text-seeko-accent`, check `border-seeko-accent bg-seeko-accent text-background`; inactive `bg-muted/30`, chip `bg-muted text-muted-foreground` | active `bg-[#0a63cc]/[0.06] ring-[#0a63cc]/25`, chip `bg-[#0a63cc]/[0.12] text-[#0a63cc]`, check `border-[#0a63cc] bg-[#0a63cc] text-white`; inactive `bg-[#f7f7f7] hover:bg-black/[0.04]`, chip `bg-[#f4f4f4] text-[#808080]`; labels `text-[#111]`/`text-[#808080]` |
| 15 | options toggle `text-muted-foreground hover:text-foreground` | `text-[#808080] hover:text-[#111]` |
| 16 | options panel `border-border/50 bg-muted/20` | `border-black/[0.06] bg-[#f7f7f7]` |
| 17 | expiration chips active `bg-foreground text-background`, inactive `bg-muted/60 ring-border/50` | active `bg-[#111] text-white`, inactive `bg-[#f4f4f4] text-[#808080] ring-black/[0.06] hover:text-[#111]` |
| 18 | calendar hint `text-muted-foreground/70`; `DatePicker` (dark) | `text-[#9a9a9a]`; `DatePicker light` prop |
| 19 | personal-note textarea `border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:border-ring` | `LIGHT_INPUT` + `resize-none` |
| 20 | Submit `bg-seeko-accent text-background hover:bg-seeko-accent/90` | `DIALOG_SAVE` (dark `#111` pill) |
| 21 | ConfirmDialog overlay `bg-black/60 backdrop-blur-sm`, panel `border-border bg-card shadow-2xl`, accent chip `bg-seeko-accent/15 ring-seeko-accent/30`, accent icon, rows `text-foreground`/`text-muted-foreground`, Cancel `outline`, Send `bg-seeko-accent text-background` | overlay kept; panel `bg-white shadow-seeko` (light), chip `bg-[#0a63cc]/[0.12]`, icon `#0a63cc`, rows `#111`/`#808080`, Cancel `DIALOG_CANCEL`, Send `DIALOG_SAVE` |

### C. `InviteTable.tsx` — sent-invites table
| # | BEFORE (dark) | Planned AFTER (light) |
|---|---------------|------------------------|
| 22 | STATUS_CLASSES: pending `seeko-accent`, verified `blue-300`, signed/expired `border-border text-muted-foreground`, revoked `red-300` | reuse `LIGHT_INVOICE_STATUS` family — pending `#946a00`+wash (needs attention), verified `#0a63cc`+wash, signed/expired neutral `#808080`+wash, revoked `#d4503e`+wash |
| 23 | TYPE_TAG signing `bg-muted/40 text-muted-foreground`, invoice `amber-300/80` | signing `bg-[#f4f4f4] text-[#808080]`, invoice `bg-[#b8801a]/10 text-[#946a00]` |
| 24 | search input `border-border bg-muted/20 … ring-seeko-accent/40` | `LIGHT_INPUT`-style (`bg-white border-black/[0.08] ring-[#0a63cc]/30`) |
| 25 | group toggle active `border-seeko-accent/40 bg-seeko-accent/10 text-seeko-accent`, inactive `border-border bg-muted/20 text-muted-foreground` | active `border-[#0a63cc]/40 bg-[#0a63cc]/10 text-[#0a63cc]`, inactive `border-black/[0.06] bg-white text-[#808080] hover:text-[#111]` |
| 26 | status filter chips active `bg-foreground text-background`, inactive `bg-muted/40 text-muted-foreground` | active `bg-[#111] text-white`, inactive `bg-[#f4f4f4] text-[#808080] hover:text-[#111]` |
| 27 | table wrap `border-border`, head `bg-muted/30`, `th text-muted-foreground` | `border-black/[0.06]`, head `bg-[#f7f7f7]`, `th text-[#808080]` |
| 28 | rows `border-border/50 hover:bg-muted/20`, recipient `text-foreground font-mono`, doc `text-muted-foreground` | `border-black/[0.06] hover:bg-black/[0.03]`, recipient `text-[#111]`, doc `text-[#808080]` |
| 29 | guardian tag `bg-muted/40 text-muted-foreground` | `bg-[#f4f4f4] text-[#808080]` |
| 30 | action btns: resend `hover:bg-muted` `text-muted-foreground→foreground`, revoke `hover:bg-destructive/10 →destructive`, download `hover:bg-seeko-accent/10 →seeko-accent` | resend `hover:bg-black/[0.04]` `#9a9a9a→#111`, revoke `hover:bg-[#d4503e]/10 →#d4503e`, download `hover:bg-[#0a63cc]/10 →#0a63cc` |
| 31 | empty-state chip `bg-muted ring-border`, icon + title `text-muted-foreground` | local light empty: chip `bg-[#f4f4f4]`, icon `#9a9a9a`, title `#111`, body `#808080` |
| 32 | loading spinner `text-muted-foreground` | `border-black/10 border-t-[#0a63cc]` spinner (match Payments) |
| 33 | section heading "Sent Invites" `text-muted-foreground` | `text-[#808080]` |
| 34 | archive toggle `text-muted-foreground hover:text-foreground`, panel `border-border opacity-60` | `text-[#808080] hover:text-[#111]`, `border-black/[0.06] opacity-60` |
| 35 | group caret `text-muted-foreground` | `text-[#9a9a9a]` |

## Real craft fixes (not just recolor)
1. **Chrome unification** — adopt `LightShell` + `‹ External Signing` breadcrumb (target #1); kills the last dark island.
2. **Empty-state visible-on-white** — replace `text-muted-foreground` title with a local light empty block (`#111` title) — same EmptyState-invisible-title risk seen on Payments.
3. **AA status colors** — neon `blue-300`/`red-300`/`amber-300`/`seeko-accent` → the AA-on-white `LIGHT_INVOICE_STATUS` family.

## Checklist (to verify in AFTER-pass)
- [ ] Wrapped in LightShell + breadcrumb, consistent with Payments/Team
- [ ] White card + `shadow-seeko`, no dark `Card`
- [ ] All inputs/toggles/chips relit; segmented active = white-card-on-`#f4f4f4`
- [ ] Status + type tags AA on white (`LIGHT_INVOICE_STATUS` family)
- [ ] ConfirmDialog white panel, light rows, `DIALOG_CANCEL`/`DIALOG_SAVE`
- [ ] Empty + loading states light & visible
- [ ] No `text-foreground`/`bg-muted`/`seeko-accent`/`*-300` dark tokens remain in the 3 files
- [ ] Animations preserved (colors only)
