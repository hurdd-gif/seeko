'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const SELECT_SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };

interface SelectOption {
  value: string;
  label: string;
}

function nodeToString(node: React.ReactNode): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.map(nodeToString).join('');
  if (React.isValidElement(node)) return nodeToString((node.props as { children?: React.ReactNode }).children);
  return '';
}

function parseOptions(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === 'option') {
      const props = child.props as { value?: string; children?: React.ReactNode };
      options.push({
        value: String(props.value ?? ''),
        label: nodeToString(props.children) || String(props.value ?? ''),
      });
    }
  });
  return options;
}

const Select = React.forwardRef<
  HTMLButtonElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
    onChange?: (e: { target: { value: string } }) => void;
    searchable?: boolean;
  }
>(({ className, children, value, onChange, id, searchable, ...props }, ref) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const mergedRef = React.useCallback(
    (el: HTMLButtonElement | null) => {
      (buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
    },
    [ref]
  );

  const updatePosition = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  React.useEffect(() => {
    if (!open || !buttonRef.current) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  const options = React.useMemo(() => parseOptions(children), [children]);
  const selected = options.find(o => o.value === String(value ?? ''));

  const filtered = React.useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const portal = document.getElementById('select-dropdown-portal');
        if (portal?.contains(e.target as Node)) return;
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      if (searchable) {
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (listRef.current) {
        const active = listRef.current.querySelector('[data-active="true"]');
        if (active) active.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [open, searchable]);

  function handleSelect(val: string) {
    onChange?.({ target: { value: val } });
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={mergedRef}
        id={id}
        type="button"
        onClick={() => {
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
          }
          setOpen(v => !v);
        }}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-lg border-0 bg-card px-3 py-1 text-sm text-foreground transition-colors transition-[box-shadow_var(--focus-ring-duration)_ease-out]',
          'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <span className="truncate">{selected?.label || 'Select...'}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={SELECT_SPRING}
          className="ml-2 flex shrink-0 items-center"
        >
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </motion.span>
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                id="select-dropdown-portal"
                role="listbox"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={SELECT_SPRING}
                style={{
                  position: 'fixed',
                  zIndex: 100,
                  top: position.top,
                  left: position.left,
                  transformOrigin: 'top left',
                  ['--select-dropdown-width' as string]: `${position.width}px`,
                }}
                className="rounded-xl border border-white/[0.08] bg-popover/80 backdrop-blur-xl backdrop-saturate-150 shadow-xl overflow-hidden min-w-[var(--select-dropdown-width)] w-max max-w-[calc(100vw-16px)]"
              >
                {searchable && (
                  <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
                    <Search className="size-3.5 text-muted-foreground shrink-0" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
                    />
                  </div>
                )}
                <div
                  ref={listRef}
                  className="max-h-56 overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {filtered.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground text-center">No results</p>
                  ) : (
                    filtered.map(opt => {
                      const isSelected = opt.value === String(value ?? '');
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          data-active={isSelected}
                          onClick={() => handleSelect(opt.value)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors text-left',
                            'hover:bg-white/[0.08] hover:text-foreground',
                            isSelected && 'bg-white/[0.08] text-foreground font-medium'
                          )}
                        >
                          <motion.span
                            initial={false}
                            animate={{ width: isSelected ? 16 : 0, opacity: isSelected ? 1 : 0 }}
                            transition={SELECT_SPRING}
                            className="flex items-center justify-center shrink-0 overflow-hidden"
                          >
                            <Check className="size-3 text-seeko-accent shrink-0" />
                          </motion.span>
                          <span className="truncate min-w-0">{opt.label}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
});
Select.displayName = 'Select';

export { Select };
