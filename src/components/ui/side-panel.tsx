"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { X } from "lucide-react"
import { pushDialogClose, isTopDialogClose } from "./dialog"

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — SidePanel (right-docked push panel)
 *
 *    0ms   panel width springs 0 → WIDTH; because it is a flex
 *          sibling of the content column, the column is PUSHED
 *          left in perfect sync (mx-auto recenters each frame)
 *          spring: visualDuration 0.45s, bounce 0 — interruptible,
 *          re-targets mid-flight if closed while still opening
 *  EXIT    width springs back to 0, content slides out right
 *  reduce  width snap collapses to a plain crossfade
 *
 * NOT a modal: no backdrop, no dim, no blur, no scroll lock —
 * the page stays fully interactive (user call: "it is an
 * addition", clicking another row swaps the panel's contents).
 * ───────────────────────────────────────────────────────── */

const PANEL_SPRING = { type: "spring" as const, visualDuration: 0.45, bounce: 0 }

/** Host element the panel portals into — a flex sibling of the page's main
 * scroll column (see routes/docs.tsx). `display: contents` so the animated
 * panel itself is the flex child. */
export const SIDE_PANEL_SLOT_ID = "side-panel-slot"

export function SidePanelSlot() {
  return <div id={SIDE_PANEL_SLOT_ID} className="contents" />
}

interface SidePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  /** Header row content (icon + title). Rendered left of the action cluster. */
  header?: React.ReactNode
  /** Extra action buttons rendered in the header, before the close button. */
  actions?: React.ReactNode
  /** Panel width in px once fully open. */
  width?: number
  /** When this value changes (e.g. the open document's id), the body scroll
   * position resets to the top — swapping content mid-scroll would otherwise
   * open the next document at the previous one's scroll offset. */
  scrollKey?: unknown
}

/** Right-docked panel that pushes the page content aside as it opens.
 * Non-modal — Escape still closes it via the shared Dialog stack, so a
 * dialog stacked on top (e.g. share) closes first, the panel second. */
function SidePanel({ open, onOpenChange, children, header, actions, width = 620, scrollKey }: SidePanelProps) {
  const reduce = useReducedMotion()
  const [slot, setSlot] = React.useState<HTMLElement | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [scrollKey])

  React.useEffect(() => {
    setSlot(document.getElementById(SIDE_PANEL_SLOT_ID))
  }, [])

  React.useEffect(() => {
    if (!open) return
    const close = () => onOpenChange(false)
    const unregister = pushDialogClose(close)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopDialogClose(close)) onOpenChange(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      unregister()
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onOpenChange])

  // With a slot: flex-sibling push panel (width animates, content column
  // shifts left). Without one (e.g. investor docs layout): fixed overlay
  // sliding in from the right edge — still backdrop-free.
  const inSlot = slot !== null

  const panel = (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          role="complementary"
          className={
            inSlot
              ? "relative min-h-0 shrink-0 overflow-hidden bg-[#e8e8e7]"
              : "fixed inset-y-0 right-0 z-[60] overflow-hidden bg-[#e8e8e7] shadow-seeko-pop"
          }
          style={inSlot && !reduce ? undefined : { width }}
          initial={reduce ? { opacity: 0 } : inSlot ? { width: 0 } : { x: "100%" }}
          animate={reduce ? { opacity: 1 } : inSlot ? { width } : { x: 0 }}
          exit={reduce ? { opacity: 0 } : inSlot ? { width: 0 } : { x: "100%" }}
          transition={reduce ? { duration: 0.15 } : PANEL_SPRING}
        >
          {/* Split divider — full-height soft grey seam marking the screen
              split (user calls: darker grey, fully extended). */}
          <span aria-hidden className="absolute inset-y-0 left-0 z-10 w-[2px] bg-black/[0.11]" />
          {/* Fixed-width inner frame so content never reflows mid-slide — it
              rides the panel's growing left edge like a drawer being pulled. */}
          <div style={{ width }} className="flex h-full flex-col">
            {/* Quiet toolbar row (Notion split-peek pattern): small muted
                identity on the left, compact icon controls on the right.
                The document itself carries the big title on the sheet below. */}
            <div className="flex h-12 shrink-0 items-center gap-2 pl-5 pr-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
              <div className="flex shrink-0 items-center gap-0.5">
                {actions}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex size-8 items-center justify-center rounded-lg text-[#6f6f6f] transition-[background-color,color] duration-150 ease-out hover:bg-black/[0.05] hover:text-[#111] active:bg-black/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
                >
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 [scrollbar-width:thin] [scrollbar-color:theme(colors.black/0.08)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/10">
              {children}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )

  if (typeof document === "undefined") return null
  return createPortal(panel, slot ?? document.body)
}

export { SidePanel }
