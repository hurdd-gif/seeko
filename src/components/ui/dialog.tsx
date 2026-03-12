"use client"

import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { X, Maximize2, Minimize2 } from "lucide-react"

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Dialog
 *
 *    0ms   backdrop fades in (opacity 0 → 1, tween 200ms ease-out)
 *   50ms   panel springs up (y 24 → 0, scale 0.97 → 1)
 *          spring: visualDuration 0.35s, bounce 0.12
 *  EXIT    panel fades + drops (opacity → 0, y → 12, scale → 0.98, 150ms)
 *          backdrop fades out (opacity → 0, 120ms)
 * ───────────────────────────────────────────────────────── */

const DIALOG_SPRING = { type: "spring" as const, visualDuration: 0.35, bounce: 0.12 }
const BACKDROP_IN = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }
const BACKDROP_OUT = { duration: 0.12 }
const PANEL_EXIT = { duration: 0.15, ease: [0.4, 0, 1, 1] as const }

const DEFAULT_MAX_W = 900
const DEFAULT_MAX_H_PCT = 88
const MIN_W = 320
const MIN_H = 200
const MAX_W_PCT = 96
const MAX_H_PCT = 94

// Track open dialog close handlers as a stack — Escape only closes the topmost
const dialogCloseStack: Array<() => void> = []

type DialogFooterContextValue = {
  setFooter: (node: React.ReactNode) => void
}

const DialogFooterContext = React.createContext<DialogFooterContextValue | null>(null)

export function useDialogFooter() {
  const ctx = React.useContext(DialogFooterContext)
  return ctx?.setFooter ?? (() => {})
}

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  /** When true, the dialog can be resized by dragging the bottom-right corner. */
  resizable?: boolean
  /** Optional class name for the panel (e.g. max-w-4xl for a larger dialog). */
  contentClassName?: string
  /** Optional class name for the outer fixed wrapper (e.g. z-[70] to override stacking). */
  className?: string
  /** Extra action buttons rendered in the top-right toolbar (before expand/close) */
  actions?: React.ReactNode
}

function Dialog({ open, onOpenChange, children, resizable = false, contentClassName, className, actions }: DialogProps) {
  const [footer, setFooter] = React.useState<React.ReactNode>(null)
  const [size, setSize] = React.useState({ w: DEFAULT_MAX_W, h: 600 });
  const [maximized, setMaximized] = React.useState(false)
  const resizingRef = React.useRef(false)
  const startRef = React.useRef({ x: 0, y: 0, w: 0, h: 0 })
  const sizeBeforeMax = React.useRef(size)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Hide mobile bottom nav when dialog is open
  React.useEffect(() => {
    if (open) {
      document.documentElement.setAttribute('data-modal-open', '')
    } else {
      document.documentElement.removeAttribute('data-modal-open')
    }
    return () => { document.documentElement.removeAttribute('data-modal-open') }
  }, [open])

  React.useEffect(() => {
    if (!open) return

    // Lock all scroll containers
    const scrollables: HTMLElement[] = [
      document.documentElement,
      document.body,
      document.getElementById('tour-main'),
    ].filter(Boolean) as HTMLElement[]
    const prev = scrollables.map(el => el.style.overflow)
    scrollables.forEach(el => { el.style.overflow = 'hidden' })

    // Block wheel + touch scroll outside the dialog panel (non-passive so preventDefault works)
    const blockScroll = (e: WheelEvent | TouchEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return
      // Allow scroll inside portalled fullscreen overlays (e.g. DeckViewer)
      if ((e.target as Element)?.closest?.('[data-fullscreen-overlay]')) return
      e.preventDefault()
    }
    document.addEventListener('wheel', blockScroll, { passive: false })
    document.addEventListener('touchmove', blockScroll, { passive: false })

    // Register in dialog stack — Escape only closes the topmost dialog
    const closeHandler = () => onOpenChange(false)
    dialogCloseStack.push(closeHandler)

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialogCloseStack.length > 0 && dialogCloseStack[dialogCloseStack.length - 1] === closeHandler) {
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', keyHandler)

    return () => {
      const idx = dialogCloseStack.indexOf(closeHandler)
      if (idx >= 0) dialogCloseStack.splice(idx, 1)
      document.removeEventListener('keydown', keyHandler)
      scrollables.forEach((el, i) => { el.style.overflow = prev[i] })
      document.removeEventListener('wheel', blockScroll)
      document.removeEventListener('touchmove', blockScroll)
    }
  }, [open, onOpenChange])

  // Reset size when opening
  React.useEffect(() => {
    if (open && typeof window !== 'undefined') {
      const w = Math.min(DEFAULT_MAX_W, window.innerWidth - 32)
      const h = window.innerHeight * (DEFAULT_MAX_H_PCT / 100)
      setSize({ w, h })
      setMaximized(false)
    } else if (!open) {
      setFooter(null)
    }
  }, [open])

  const toggleMaximize = React.useCallback(() => {
    if (!maximized) {
      sizeBeforeMax.current = size
      setSize({
        w: (window.innerWidth * MAX_W_PCT) / 100,
        h: (window.innerHeight * MAX_H_PCT) / 100,
      })
      setMaximized(true)
    } else {
      setSize(sizeBeforeMax.current)
      setMaximized(false)
    }
  }, [maximized, size])

  const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
    if (!resizable || maximized) return
    e.preventDefault()
    resizingRef.current = true
    startRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
  }, [resizable, maximized, size.w, size.h])

  React.useEffect(() => {
    if (!resizable) return
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const maxW = (window.innerWidth * MAX_W_PCT) / 100
      const maxH = (window.innerHeight * MAX_H_PCT) / 100
      const dw = e.clientX - startRef.current.x
      const dh = e.clientY - startRef.current.y
      setSize(prev => ({
        w: Math.min(maxW, Math.max(MIN_W, startRef.current.w + dw)),
        h: Math.min(maxH, Math.max(MIN_H, startRef.current.h + dh)),
      }))
    }
    const onEnd = () => { resizingRef.current = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onEnd)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onEnd)
    }
  }, [resizable])

  const panelStyle = resizable
    ? { width: size.w, height: size.h, maxWidth: 'none', maxHeight: 'none' as const }
    : undefined

  return (
    <AnimatePresence>
      {open && (
        <div className={cn("fixed inset-0 z-[60] flex items-end sm:items-center justify-center", className)}>
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_IN}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            ref={panelRef}
            className={cn(
              "relative z-50 flex flex-col rounded-t-2xl sm:rounded-xl border border-white/[0.08] bg-popover backdrop-blur-xl backdrop-saturate-150 shadow-xl mx-0 sm:mx-4 pb-[env(safe-area-inset-bottom)] sm:pb-0",
              !resizable && "w-full max-w-[900px] max-h-[90vh] sm:max-h-[88vh]",
              !resizable && footer != null && "h-[90vh] sm:h-[88vh]",
              contentClassName
            )}
            style={panelStyle}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{
              ...DIALOG_SPRING,
              opacity: { duration: 0.2 },
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 100 || info.velocity.y > 300) onOpenChange(false)
            }}
          >
            {/* Mobile drag handle */}
            <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>
            {/* Action toolbar — consolidated top-right button row */}
            <div className="absolute right-3 top-3 sm:top-4 flex items-center gap-0.5 z-10">
              {actions}
              {resizable && (
                <button
                  type="button"
                  onClick={toggleMaximize}
                  title={maximized ? 'Restore size' : 'Expand'}
                  className="flex size-8 items-center justify-center rounded-md opacity-60 transition-opacity hover:opacity-100 hover:bg-white/[0.06] focus:outline-none"
                >
                  {maximized
                    ? <Minimize2 className="size-3.5" />
                    : <Maximize2 className="size-3.5" />
                  }
                  <span className="sr-only">{maximized ? 'Restore' : 'Expand'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex size-8 items-center justify-center rounded-md opacity-60 transition-opacity hover:opacity-100 hover:bg-white/[0.06] focus:outline-none"
              >
                <X className="size-3.5" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <DialogFooterContext.Provider value={{ setFooter }}>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto p-6 pt-2 sm:pt-6 [scrollbar-width:thin] [scrollbar-color:theme(colors.white/0.08)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
                  {children}
                </div>
                {footer != null ? (
                  <div className="shrink-0 border-t border-white/[0.06] px-6 py-4 flex flex-wrap items-center justify-end gap-3">
                    {footer}
                  </div>
                ) : null}
              </div>
            </DialogFooterContext.Provider>
            {resizable && (
              <div
                role="separator"
                aria-label="Resize"
                onMouseDown={handleResizeStart}
                className={cn(
                  "absolute right-0 bottom-0 w-8 h-8 rounded-br-xl flex items-end justify-end p-1.5 group",
                  maximized ? "cursor-default" : "cursor-se-resize"
                )}
              >
                {!maximized && (
                  <svg
                    className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M15 15H9v-2h4V9h2v6z" />
                  </svg>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 pb-4 mb-2 border-b border-white/[0.06]", className)} {...props} />
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold text-foreground", className)} {...props} />
}

/** @deprecated Close button is now built into the Dialog toolbar. This is a no-op for backwards compat. */
function DialogClose(_props: { onClose: () => void }) {
  return null
}

export { Dialog, DialogHeader, DialogTitle, DialogClose }
