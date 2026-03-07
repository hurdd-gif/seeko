"use client"

/* ─────────────────────────────────────────────────────────
 * DROPDOWN MENU — ANIMATION STORYBOARD
 *
 *   open    scale 0.95 → 1.0, opacity 0 → 1 (spring)
 *           origin from trigger alignment (top-left / top-right)
 *   hover   item bg fades in (white/10)
 *   select  item click → close with quick fade out
 *   close   scale 1.0 → 0.97, opacity 1 → 0 (120ms ease-out)
 *   keys    ↑↓ navigate, Enter select, Escape close
 * ───────────────────────────────────────────────────────── */

import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const DROPDOWN = {
  enter: { type: 'spring' as const, stiffness: 500, damping: 30 },
  exit: { duration: 0.12, ease: 'easeOut' as const },
}

/* ─── Context ───────────────────────────────────────────── */

const DropdownMenuContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
  activeIndex: number
  setActiveIndex: (i: number) => void
  itemCount: React.MutableRefObject<number>
}>({
  open: false,
  setOpen: () => {},
  activeIndex: -1,
  setActiveIndex: () => {},
  itemCount: { current: 0 },
})

function useDropdown() {
  return React.useContext(DropdownMenuContext)
}

/* ─── Root ──────────────────────────────────────────────── */

const DropdownMenu = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const itemCount = React.useRef(0)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) { setActiveIndex(-1); return }
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => (i + 1) % itemCount.current)
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => (i - 1 + itemCount.current) % itemCount.current)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, activeIndex, setActiveIndex, itemCount }}>
      <div ref={ref} className="relative">{children}</div>
    </DropdownMenuContext.Provider>
  )
}

/* ─── Trigger ───────────────────────────────────────────── */

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ children, asChild, ...props }, ref) => {
  const { open, setOpen } = useDropdown()
  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onClick: (e: React.MouseEvent) => {
        if (typeof childProps.onClick === 'function') (childProps.onClick as (e: React.MouseEvent) => void)(e)
        setOpen(!open)
      },
      ref,
    })
  }
  return (
    <button ref={ref} onClick={(e) => { e.stopPropagation(); setOpen(!open) }} {...props}>
      {children}
    </button>
  )
})
DropdownMenuTrigger.displayName = "DropdownMenuTrigger"

/* ─── Content ───────────────────────────────────────────── */

function DropdownMenuContent({
  className,
  align = "end",
  side = "bottom",
  children,
}: {
  className?: string
  align?: "start" | "end"
  side?: "top" | "bottom"
  children: React.ReactNode
}) {
  const { open, itemCount } = useDropdown()
  const contentRef = React.useRef<HTMLDivElement>(null)

  // Count items on mount for keyboard nav
  React.useEffect(() => {
    if (open && contentRef.current) {
      itemCount.current = contentRef.current.querySelectorAll('[role="menuitem"]').length
    }
  }, [open, children])

  const originX = align === "end" ? "right" : "left"
  const originY = side === "top" ? "bottom" : "top"

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={contentRef}
          role="menu"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={DROPDOWN.enter}
          style={{ transformOrigin: `${originX} ${originY}` }}
          className={cn(
            "absolute z-50 min-w-[8rem] rounded-xl border border-white/[0.08] p-1.5 shadow-xl",
            "bg-popover/80 backdrop-blur-xl backdrop-saturate-150",
            side === "top" ? "bottom-full mb-1" : "mt-1",
            align === "end" ? "right-0" : "left-0",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ─── Item ──────────────────────────────────────────────── */

interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
}

const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, children, selected, ...props }, ref) => {
    const { setOpen, activeIndex, setActiveIndex } = useDropdown()
    const indexRef = React.useRef(-1)
    const internalRef = React.useRef<HTMLButtonElement>(null)
    const resolvedRef = (ref as React.RefObject<HTMLButtonElement>) || internalRef

    // Determine this item's index from DOM
    React.useEffect(() => {
      const el = resolvedRef && 'current' in resolvedRef ? resolvedRef.current : null
      if (!el) return
      const parent = el.closest('[role="menu"]')
      if (!parent) return
      const items = Array.from(parent.querySelectorAll('[role="menuitem"]'))
      indexRef.current = items.indexOf(el)
    })

    const isActive = activeIndex >= 0 && activeIndex === indexRef.current

    // Scroll into view + Enter key
    React.useEffect(() => {
      if (!isActive) return
      const el = resolvedRef && 'current' in resolvedRef ? resolvedRef.current : null
      if (!el) return
      el.scrollIntoView({ block: 'nearest' })
      function handleEnter(e: KeyboardEvent) {
        if (e.key === 'Enter') { e.preventDefault(); el!.click() }
      }
      document.addEventListener('keydown', handleEnter)
      return () => document.removeEventListener('keydown', handleEnter)
    }, [isActive])

    return (
      <button
        ref={resolvedRef}
        role="menuitem"
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
          "hover:bg-white/[0.08] hover:text-foreground",
          "focus:bg-white/[0.08] focus:text-foreground focus:outline-none",
          isActive && "bg-white/[0.08] text-foreground",
          selected && "text-foreground",
          className
        )}
        onMouseEnter={() => setActiveIndex(indexRef.current)}
        onClick={(e) => {
          props.onClick?.(e)
          setOpen(false)
        }}
        {...props}
      >
        {/* Selected checkmark — animates width in/out */}
        {selected !== undefined && (
          <motion.span
            initial={false}
            animate={{ width: selected ? 16 : 0, opacity: selected ? 1 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center justify-center shrink-0 overflow-hidden"
          >
            <Check className="size-3.5 text-seeko-accent shrink-0" />
          </motion.span>
        )}
        {children}
      </button>
    )
  }
)
DropdownMenuItem.displayName = "DropdownMenuItem"

/* ─── Label (section header) ────────────────────────────── */

function DropdownMenuLabel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60", className)}>
      {children}
    </div>
  )
}

/* ─── Separator ─────────────────────────────────────────── */

function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-white/[0.06]", className)} />
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}
