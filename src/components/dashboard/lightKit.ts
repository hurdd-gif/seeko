/* ── Light form-control class kits (shadcn primitives are dark-themed via
 * `@theme inline` tokens that bake literal hex into utilities at build time,
 * so a runtime token override can't relight them — we override per-element
 * via className, which twMerge resolves last-wins). ───────────────────── */
export const LIGHT_INPUT =
  'border border-black/[0.08] bg-white text-[#2a2a2a] placeholder:text-[#b3b3b3] rounded-lg focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30';
export const BTN_BASE =
  'rounded-full px-4 h-9 text-[13px] font-medium transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]';
export const BTN_PRIMARY = `${BTN_BASE} bg-[#111] text-white hover:bg-[#2a2a2a]`;
export const BTN_SECONDARY = `${BTN_BASE} bg-[#f4f4f4] text-[#2a2a2a] hover:bg-[#ececec]`;
export const CARD_TITLE = 'text-[15px] font-semibold text-[#111]';
export const CARD_DESC = 'text-[13px] text-[#808080]';
export const HAIRLINE = 'h-px bg-black/[0.06]';
/* Dialog footer/action buttons in the light theme: black primary, subtle ghost.
 * Appended to shadcn <Button> className so twMerge recolors them last-wins. */
export const DIALOG_SAVE = 'bg-[#111] text-white hover:bg-[#2a2a2a]';
export const DIALOG_CANCEL = 'text-[#505050] hover:bg-black/[0.04] hover:text-[#111]';

/* Restrained AA-on-white department label colors (see 2026-05-26 phase1-team
 * plan; derived via /color-expert). Distinct dept identity, all ≥4.5:1 on white.
 * `#0d7aff` is reserved for the online dot (graphic, 3:1) — Coding text uses the
 * deepened `#0a63cc` to clear AA. */
export const LIGHT_DEPT_COLOR: Record<string, string> = {
  'Coding':         'text-[#0a63cc]',
  'Visual Art':     'text-[#3f5fb5]',
  'UI/UX':          'text-[#6e4fc4]',
  'Animation':      'text-[#946a00]',
  'Asset Creation': 'text-[#bd3f7c]',
};
/* Matching department badge backgrounds: hue/10 tint + label text. Amber uses
 * the brighter `#b8801a` for the wash with the darker `#946a00` for the text. */
export const LIGHT_DEPT_BADGE: Record<string, string> = {
  'Coding':         'bg-[#0a63cc]/10 text-[#0a63cc]',
  'Visual Art':     'bg-[#3f5fb5]/10 text-[#3f5fb5]',
  'UI/UX':          'bg-[#6e4fc4]/10 text-[#6e4fc4]',
  'Animation':      'bg-[#b8801a]/10 text-[#946a00]',
  'Asset Creation': 'bg-[#bd3f7c]/10 text-[#bd3f7c]',
};

/* Invoice-request status badge colors on white (Payments admin). Mirrors the dark
 * INVOICE_STATUS_COLOR keys, mapped to the AA-on-white ladder: azure `#0a63cc` for
 * verified/approved, amber `#946a00` for submitted, destructive `#d4503e` for
 * rejected/revoked, neutral grey for pending/expired. */
export const LIGHT_INVOICE_STATUS: Record<string, string> = {
  pending:  'text-[#808080] border-black/[0.08]',
  verified: 'text-[#0a63cc] border-[#0a63cc]/30 bg-[#0a63cc]/10',
  signed:   'text-[#946a00] border-[#b8801a]/40 bg-[#b8801a]/10',
  approved: 'text-[#0a63cc] border-[#0a63cc]/30 bg-[#0a63cc]/10',
  rejected: 'text-[#d4503e] border-[#d4503e]/30 bg-[#d4503e]/10',
  expired:  'text-[#9a9a9a] border-black/[0.08]',
  revoked:  'text-[#d4503e] border-[#d4503e]/30 bg-[#d4503e]/10',
};

/* External-signing invite status on white (External Signing admin). The loudness
 * ladder differs from invoices: here `pending` is the LOUD status (it blocks an
 * external party from acting) and `signed`/`expired` are quiet (done/dead), the
 * inverse emphasis of LIGHT_INVOICE_STATUS. Mapped to the same AA-on-white ramp:
 * amber `#946a00` = pending (needs attention), azure `#0a63cc` = verified (mid-flow),
 * neutral grey = signed/expired (quiet), destructive `#d4503e` = revoked. */
export const LIGHT_SIGNING_STATUS: Record<string, string> = {
  pending:  'text-[#946a00] border-[#b8801a]/40 bg-[#b8801a]/10',
  verified: 'text-[#0a63cc] border-[#0a63cc]/30 bg-[#0a63cc]/10',
  signed:   'text-[#808080] border-black/[0.08]',
  expired:  'text-[#9a9a9a] border-black/[0.08]',
  revoked:  'text-[#d4503e] border-[#d4503e]/30 bg-[#d4503e]/10',
};

/* ── Light recipient-ceremony kit (external signer `/sign/[token]`, migrated
 * dark→light to rejoin the design system). Built on the same AA-on-white ramp
 * as the kits above and reuses the canonical `shadow-seeko` elevation token
 * (never re-inline a shadow) so the ceremony card reads as the SAME material as
 * every other light app card — that consistency is the entire point of the
 * migration. Decisions from the before-critique (docs/qa/external-signing/):
 * lift the card with shadow-over-border (not a faint hairline), and preserve
 * the terminal color ladder signed=azure / expired=amber / revoked=red. ──── */

// Hero ceremony card: white surface lifted by the canonical shadow. Its 0.5px
// hairline ring IS the border (shadow-over-border); the soft drop matches all
// other light app cards. `rounded-2xl` outer — nest inner elements (collapsed
// agreement ref, inputs, OTP cells) at smaller radii for concentric corners.
export const LIGHT_RECIPIENT_CARD = 'bg-white rounded-2xl shadow-seeko';
// Card / section title ("External NDA", "Sign the Agreement").
export const LIGHT_RECIPIENT_TITLE = 'text-[#111] font-semibold';
// Secondary copy on the card ("Document signing request", the sign sub-copy).
// `#6e6e6e` (4.74:1 on white) clears WCAG AA for body text — the signer mockup's
// original `#A2A2A2` (~2.6:1) failed it. Darker than the generic `#808080` muted
// used elsewhere precisely because this copy carries real meaning on the ceremony.
export const LIGHT_RECIPIENT_MUTED = 'text-[#6e6e6e]';
// Faintest text — fine print only. (There is no "Powered by" footer; the signer
// migration removed the footer + logo, so reserve this strictly for decorative /
// non-essential glyphs — never for instructional copy, which must clear AA.)
export const LIGHT_RECIPIENT_FAINT = 'text-[#9a9a9a]';
// Divider / inset border within the ceremony (apply with border-t / border-b).
export const LIGHT_RECIPIENT_HAIRLINE = 'border-black/[0.06]';

// Shared focus-visible ring for every light-ceremony control on the white
// surface. The global `--color-ring` is a near-white dark-theme ring (rgba(240,
// 240,240,0.18) — invisible on white), so the shadcn <Button> base ring and every
// plain <button> on the ceremony (segmented Draw/Type, Clear, Resend, the
// collapsed agreement toggle, the sheet close) would have NO visible keyboard
// focus indicator. They all reuse this azure ring — the design lock reserves
// `#0d7aff` for focus — mirroring the azure ring already proven on LIGHT_INPUT /
// LIGHT_OTP_CELL, with an offset so it reads on both the white card and the
// black-pill CTA. Append to a control's className; twMerge resolves it last-wins
// over the dark `ring-ring` default.
export const LIGHT_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7aff]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

// Frame-level variant of LIGHT_FOCUS_RING: rings a styled CONTAINER when one of
// its focusable children takes keyboard focus (`:has(:focus-visible)`). For the
// signature pad, whose real control is a transparent, inset <input> — a ring on
// the input itself would float mid-pad, so the bordered frame lights up instead,
// exactly as a single bordered field would. Same azure/offset as LIGHT_FOCUS_RING;
// keyboard-only (`:focus-visible`, not `:focus`) so a mouse click doesn't ring it.
// The frame's own `overflow-hidden` clips its content, not its box-shadow, so the
// offset ring still paints outside the border box.
export const LIGHT_FOCUS_RING_WITHIN =
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0d7aff]/40 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-white';

// Primary ceremony CTA (Send Code / Continue to Sign / I Agree & Sign). The
// canonical black pill (BTN_PRIMARY) lifted to a 44px hero height with the shared
// shadow-seeko elevation, carrying the azure LIGHT_FOCUS_RING (the shadcn base
// ring is the near-white dark `ring-ring`, invisible on this white surface).
// `w-full` so it spans the capped ceremony card. Append to a shadcn <Button> so
// twMerge recolors/resizes it last-wins over the dark default variant.
export const LIGHT_RECIPIENT_CTA = `${BTN_PRIMARY} h-11 w-full shadow-seeko ${LIGHT_FOCUS_RING}`;

// OTP digit cell (VerificationForm). White cell, large AA-dark digit, azure
// focus ring matching LIGHT_INPUT; `rounded-xl` nests concentrically in the card.
export const LIGHT_OTP_CELL =
  'border border-black/[0.10] bg-white text-[#111] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30 focus-visible:border-[#0d7aff]';

// Terminal-state icon chip (StatusPage + not-found) + the success-check token.
// Ladder REVISED from Phase 0 (was signed=azure / expired=amber) to match the
// user-authored Paper signer mockup + the /color-expert + /interface-craft gate:
//   signed  = deep green  #15803d (5.02:1) — "done/safe"; distinct from the azure
//             brand accent so azure keeps meaning "interactive" (not success).
//   expired = neutral ink #6e6e6e (4.74:1) — stale, NOT alarming; amber over-alarmed.
//   revoked = destructive #d4503e — a deliberate hard stop (admin killed it),
//             reusing the kit's destructive so revoked reads consistently.
//   notfound= neutral grey chip so a stale/invalid link still reads as branded.
// Each value pairs a /10 tint background with the icon color for a circular chip.
// LIGHT_SUCCESS_TEXT is the same green for the inline signed-confirmation check.
export const LIGHT_TERMINAL_ICON: Record<string, string> = {
  signed:   'bg-[#15803d]/10 text-[#15803d]',
  expired:  'bg-black/[0.04] text-[#6e6e6e]',
  revoked:  'bg-[#d4503e]/10 text-[#d4503e]',
  notfound: 'bg-black/[0.04] text-[#9a9a9a]',
};
// Success affordance shared by the signed terminal chip + the just-signed
// confirmation check in AgreementForm (replaces the azure seeko-accent check in
// the light ceremony). Kept as a literal class so the Tailwind v4 scanner sees it.
export const LIGHT_SUCCESS_CHIP = 'bg-[#15803d]/10 text-[#15803d]';
export const LIGHT_SUCCESS_TEXT = 'text-[#15803d]';
