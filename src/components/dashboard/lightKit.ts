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
