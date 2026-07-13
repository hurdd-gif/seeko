/* ── Light form-control class kits — now scheme-aware. Every recipe consumes
 * the semantic OKLCH tokens from globals.css (`--ink-*`, `--surface-*`,
 * `--wash-*`), which re-declare under `.dark`, so these kits theme both
 * schemes from one string. Values resolve to the exact shipped hexes in
 * light. Applied per-element via className; twMerge resolves last-wins. ── */
/* Text inputs indicate focus with a border-stroke change only — no ring glow
 * (user-decided 2026-07-03). `ring-0` defeats the shadcn Input base ring.
 * Chrome paints autofilled inputs grey-blue regardless of scheme — pin the
 * input's color-scheme per theme and paint over the autofill tint with an
 * inset shadow + explicit text-fill via var(), so the hack follows the theme
 * (light values are the exact shipped hexes: surface-1=#fff, ink-strong=#2a2a2a).
 *
 * PLACEHOLDER: ink-muted (#808080, 3.5:1), not ink-faintest. The ramp annotates
 * faintest as `2.0:1 — hints (decorative)`, and the Portal Light block says the
 * faint tiers are for decorative text ONLY. A placeholder is neither decorative
 * nor optional — "you@seeko.studio" is the field's own instructions, and at 2.0:1
 * it was the least legible text on the sign-in page. Stopping at ink-muted rather
 * than the 4.9:1 tier is deliberate: a placeholder that clears AA for body copy
 * starts reading as a filled-in value. */
export const LIGHT_INPUT =
  'border border-wash-8 bg-surface-1 text-ink-strong placeholder:text-ink-muted rounded-lg [color-scheme:light] dark:[color-scheme:dark] autofill:shadow-[inset_0_0_0_1000px_var(--surface-1)] autofill:[-webkit-text-fill-color:var(--ink-strong)] transition-[border-color] duration-150 ease-out focus-visible:ring-0 focus-visible:border-seeko-accent';
export const BTN_BASE =
  'rounded-[14px] px-4 h-9 text-[13px] font-medium transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]';
/* Primary pill: ink-title fill + surface-1 label — the pair inverts cleanly in
 * .dark (near-white pill, card-dark label) without a dedicated foreground token. */
export const BTN_PRIMARY = `${BTN_BASE} bg-ink-title text-surface-1 hover:bg-ink-strong`;
export const BTN_SECONDARY = `${BTN_BASE} bg-surface-4 text-ink-strong hover:bg-surface-5`;
export const CARD_TITLE = 'text-[15px] font-semibold text-ink-title';
export const CARD_DESC = 'text-[13px] text-ink-muted';
export const HAIRLINE = 'h-px bg-wash-6';
/* Dialog footer/action buttons in the light theme: black primary, subtle ghost.
 * Appended to shadcn <Button> className so twMerge recolors them last-wins.
 * Disabled: the Button base fades to opacity-50, which turns the black pill into
 * a solid mid-grey that reads as an ENABLED secondary button — so override with
 * an unmistakably inert washed-grey fill + grey label (the Wise/Mercury pattern:
 * disabled primaries lose their fill, they don't just dim). */
export const DIALOG_SAVE =
  'bg-ink-title text-surface-1 hover:bg-ink-strong disabled:opacity-100 disabled:bg-wash-6 disabled:text-ink-faintest';
export const DIALOG_CANCEL = 'text-ink-body hover:bg-wash-4 hover:text-ink-title';

/* Restrained AA-on-white department label colors (see 2026-05-26 phase1-team
 * plan; derived via /color-expert). Distinct dept identity, all ≥4.5:1 on white.
 * `#0d7aff` is reserved for the online dot (graphic, 3:1) — Coding text uses the
 * deepened `#0a63cc` to clear AA. */
export const LIGHT_DEPT_COLOR: Record<string, string> = {
  'Coding':         'text-dept-ink-coding',
  'Visual Art':     'text-dept-ink-visual-art',
  'UI/UX':          'text-dept-ink-ui-ux',
  'Animation':      'text-dept-ink-animation',
  'Asset Creation': 'text-dept-ink-asset-creation',
};
/* Matching department badge backgrounds: hue/10 tint + label text. Amber uses
 * the brighter dept-wash-animation for the wash with the darker ink for text. */
export const LIGHT_DEPT_BADGE: Record<string, string> = {
  'Coding':         'bg-dept-ink-coding/10 text-dept-ink-coding',
  'Visual Art':     'bg-dept-ink-visual-art/10 text-dept-ink-visual-art',
  'UI/UX':          'bg-dept-ink-ui-ux/10 text-dept-ink-ui-ux',
  'Animation':      'bg-dept-wash-animation/10 text-dept-ink-animation',
  'Asset Creation': 'bg-dept-ink-asset-creation/10 text-dept-ink-asset-creation',
};

/* Invoice-request status badge colors on white (Payments admin). Mirrors the dark
 * INVOICE_STATUS_COLOR keys, mapped to the AA-on-white ladder: azure `#0a63cc` for
 * verified/approved, amber `#946a00` for submitted, destructive `#d4503e` for
 * rejected/revoked, neutral grey for pending/expired. */
export const LIGHT_INVOICE_STATUS: Record<string, string> = {
  pending:  'text-ink-muted border-wash-8',
  verified: 'text-seeko-accent-ink border-seeko-accent-ink/30 bg-seeko-accent-ink/10',
  signed:   'text-dept-ink-animation border-dept-wash-animation/40 bg-dept-wash-animation/10',
  approved: 'text-seeko-accent-ink border-seeko-accent-ink/30 bg-seeko-accent-ink/10',
  rejected: 'text-danger border-danger/30 bg-danger/10',
  expired:  'text-ink-faint border-wash-8',
  revoked:  'text-danger border-danger/30 bg-danger/10',
};

/* External-signing invite status on white (External Signing admin). The loudness
 * ladder differs from invoices. Mapped to the AA-on-white ramp:
 *   pending  = amber  `#946a00` — LOUD (blocks an external party from acting),
 *   verified = azure  `#0a63cc` — mid-flow (recipient verified, about to sign),
 *   signed   = green  `#15803d` — the terminal ACHIEVEMENT of the custody chain.
 *              Single-sourced with the signer's OWN success screen (LIGHT_TERMINAL_ICON
 *              .signed / LIGHT_SUCCESS_CHIP), so a completed signature reads the same
 *              celebrated green to admin and signer alike — not the dead grey it was.
 *   expired  = neutral grey `#9a9a9a` — stale/dead (not alarming),
 *   revoked  = destructive `#d4503e` — admin hard-stop. */
export const LIGHT_SIGNING_STATUS: Record<string, string> = {
  pending:  'text-dept-ink-animation border-dept-wash-animation/40 bg-dept-wash-animation/10',
  verified: 'text-seeko-accent-ink border-seeko-accent-ink/30 bg-seeko-accent-ink/10',
  signed:   'text-success border-success/30 bg-success/10',
  expired:  'text-ink-faint border-wash-8',
  revoked:  'text-danger border-danger/30 bg-danger/10',
};

/* Humanized custody-phase labels for the admin table status cell — the textual
 * twin of LIGHT_SIGNING_STATUS. Raw DB enums ("pending"/"verified") read as
 * implementation leaking through; these phrase WHERE the document sits in the
 * signing chain, so the status column becomes the table's spine rather than a
 * lowercase tag. Fall back to the raw status for any unmapped value. */
export const SIGNING_STATUS_LABEL: Record<string, string> = {
  pending:  'Awaiting verification',
  verified: 'Ready to sign',
  signed:   'Signed',
  expired:  'Expired',
  revoked:  'Revoked',
};

/* ── Light recipient-ceremony kit (external signer `/sign/[token]`, migrated
 * dark→light to rejoin the design system). Built on the same AA-on-white ramp
 * as the kits above and reuses the canonical `shadow-seeko` elevation token
 * (never re-inline a shadow) so the ceremony card reads as the SAME material as
 * every other light app card. Decisions from the before-critique
 * (docs/qa/external-signing/):
 * lift the card with shadow-over-border (not a faint hairline), and preserve
 * the terminal color ladder signed=azure / expired=amber / revoked=red. ──── */

// Hero ceremony card: white surface lifted by the canonical shadow. Its 0.5px
// hairline ring IS the border (shadow-over-border); the soft drop matches all
// other light app cards. `rounded-2xl` outer — nest inner elements (collapsed
// agreement ref, inputs, OTP cells) at smaller radii for concentric corners.
export const LIGHT_RECIPIENT_CARD = 'bg-surface-1 rounded-2xl shadow-seeko';
// Card / section title ("External NDA", "Sign the Agreement").
export const LIGHT_RECIPIENT_TITLE = 'text-ink-title font-semibold';
// Secondary copy on the card ("Document signing request", the sign sub-copy).
// `#6e6e6e` (4.74:1 on white) clears WCAG AA for body text — the signer mockup's
// original `#A2A2A2` (~2.6:1) failed it. Darker than the generic `#808080` muted
// used elsewhere precisely because this copy carries real meaning on the ceremony.
export const LIGHT_RECIPIENT_MUTED = 'text-ink-muted-strong';
// Faintest text — fine print only. (There is no "Powered by" footer; the signer
// light-theme pass removed the footer + logo, so reserve this strictly for decorative /
// non-essential glyphs — never for instructional copy, which must clear AA.)
export const LIGHT_RECIPIENT_FAINT = 'text-ink-faint';
// Divider / inset border within the ceremony (apply with border-t / border-b).
export const LIGHT_RECIPIENT_HAIRLINE = 'border-wash-6';

// Shared focus-visible ring for every light-ceremony control on the white
// surface. The global `--color-ring` is a near-white dark-theme ring (rgba(240,
// 240,240,0.18) — invisible on white), so the shadcn <Button> base ring and every
// plain <button> on the ceremony (segmented Draw/Type, Clear, Resend, the
// collapsed agreement toggle, the sheet close) would have NO visible keyboard
// focus indicator. They all reuse this azure ring — the design lock reserves
// `#0d7aff` for focus — mirroring the azure ring already proven on
// LIGHT_OTP_CELL, with an offset so it reads on both the white card and the
// black-pill CTA. Append to a control's className; twMerge resolves it last-wins
// over the dark `ring-ring` default.
export const LIGHT_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1';

// Frame-level variant of LIGHT_FOCUS_RING: rings a styled CONTAINER when one of
// its focusable children takes keyboard focus (`:has(:focus-visible)`). For the
// signature pad, whose real control is a transparent, inset <input> — a ring on
// the input itself would float mid-pad, so the bordered frame lights up instead,
// exactly as a single bordered field would. Same azure/offset as LIGHT_FOCUS_RING;
// keyboard-only (`:focus-visible`, not `:focus`) so a mouse click doesn't ring it.
// The frame's own `overflow-hidden` clips its content, not its box-shadow, so the
// offset ring still paints outside the border box.
export const LIGHT_FOCUS_RING_WITHIN =
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-seeko-accent/40 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-surface-1';

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
  'border border-wash-10 bg-surface-1 text-ink-title rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seeko-accent/30 focus-visible:border-seeko-accent';

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
  signed:   'bg-success/10 text-success',
  expired:  'bg-wash-4 text-ink-muted-strong',
  revoked:  'bg-danger/10 text-danger',
  notfound: 'bg-wash-4 text-ink-faint',
};
// Success affordance shared by the signed terminal chip + the just-signed
// confirmation check in AgreementForm (replaces the azure seeko-accent check in
// the light ceremony). Kept as a literal class so the Tailwind v4 scanner sees it.
export const LIGHT_SUCCESS_CHIP = 'bg-success/10 text-success';
export const LIGHT_SUCCESS_TEXT = 'text-success';
