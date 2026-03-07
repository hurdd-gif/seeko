"use client"

import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { X, Maximize2, Minimize2 } from "lucide-react"

const DEFAULT_MAX_W = 900
const DEFAULT_MAX_H_PCT = 88
const MIN_W = 320
const MIN_H = 200
const MAX_W_PCT = 96
const MAX_H_PCT = 94

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
}

function Dialog({ open, onOpenChange, children, resizable = false, contentClassName }: DialogProps) {
  const [footer, setFooter] = React.useState<React.ReactNode>(null)
  const [size, setSize] = React.useState({ w: DEFAULT_MAX_W, h: 600 });
  const [maximized, setMaximized] = React.useState(false)
  const resizingRef = React.useRef(false)
  const startRef = React.useRef({ x: 0, y: 0, w: 0, h: 0 })
  const sizeBeforeMax = React.useRef(size)
  const panelRef = React.useRef<HTMLDivElement>(null)

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
      e.preventDefault()
    }
    document.addEventListener('wheel', blockScroll, { passive: false })
    document.addEventListener('touchmove', blockScroll, { passive: false })

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', keyHandler)

    return () => {
      scrollables.forEach((el, i) => { el.style.overflow = prev[i] })
      document.removeEventListener('wheel', blockScroll)
      document.removeEventListener('touchmove', blockScroll)
      document.removeEventListener('keydown', keyHandler)
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            ref={panelRef}
            className={cn(
              "relative z-50 flex flex-col rounded-xl border border-white/[0.08] bg-popover/80 backdrop-blur-xl backdrop-saturate-150 shadow-xl mx-4",
              !resizable && "w-full max-w-[900px] max-h-[90vh] sm:max-h-[88vh]",
              !resizable && footer != null && "h-[90vh] sm:h-[88vh]",
              contentClassName
            )}
            style={panelStyle}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <DialogFooterContext.Provider value={{ setFooter }}>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {children}
                </div>
                {footer != null ? (
                  <div className="shrink-0 border-t border-white/[0.06] px-6 py-4 flex flex-wrap items-center justify-end gap-3">
                    {footer}
                  </div>
                ) : null}
              </div>
            </DialogFooterContext.Provider>
            {/* Expand/maximize button — always shown on resizable dialogs */}
            {resizable && (
              <button
                type="button"
                onClick={toggleMaximize}
                title={maximized ? 'Restore size' : 'Expand'}
                className="absolute right-10 top-4 rounded-sm opacity-50 transition-opacity hover:opacity-100 focus:outline-none"
              >
                {maximized
                  ? <Minimize2 className="size-3.5" />
                  : <Maximize2 className="size-3.5" />
                }
                <span className="sr-only">{maximized ? 'Restore' : 'Expand'}</span>
              </button>
            )}
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
  return <div className={cn("flex flex-col gap-1.5 mb-4", className)} {...props} />
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold text-foreground", className)} {...props} />
}

function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
    >
      <X className="size-4" />
      <span className="sr-only">Close</span>
    </button>
  )
}

export { Dialog, DialogHeader, DialogTitle, DialogClose }
