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
