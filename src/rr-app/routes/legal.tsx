import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { springs } from '@/lib/motion';
import { termsOfUse } from '@/lib/legal/terms';
import { developerTerms } from '@/lib/legal/developer-terms';
import { privacyPolicy } from '@/lib/legal/privacy';
import type { LegalBlock, LegalDoc } from '@/lib/legal/types';
import { cn } from '@/lib/utils';

/**
 * Public legal/documentation pages (/legal/:slug) on the light Paper canvas —
 * same quiet chrome as /login (mark + Studio top bar, Help & Support), with a
 * document column: switcher pills, title/effective-date/intro, contents list,
 * and numbered sections typeset from the structured LegalDoc data in
 * src/lib/legal/. Publicly reachable on purpose: the login footer links here
 * and visitors must be able to read these before they have an account.
 */

const DOCS: LegalDoc[] = [termsOfUse, developerTerms, privacyPolicy];

/* Entrance — small staggered rises, everything interruptible-safe (opacity/
 * transform only). Skipped wholesale under reduced motion. */
const RISE = {
  t: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  y: 10,
  stagger: 0.07,
};

function sectionId(index: number, heading: string) {
  return `${index + 1}-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === 'p') {
    return <p className="text-[15px] leading-relaxed text-[#5f5f5f]">{block.text}</p>;
  }
  if (block.kind === 'list') {
    return (
      <ul className="space-y-1.5 pl-1">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-[#5f5f5f]">
            {/* 11px optical drop centers the dash on the first text line */}
            <span aria-hidden className="mt-[11px] h-px w-3 shrink-0 bg-[#c6c6c6]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="overflow-hidden rounded-xl border border-[#ececec]">
      {block.entries.map((entry, i) => (
        <div
          key={i}
          className={cn(
            'grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:gap-4',
            i > 0 && 'border-t border-[#f0f0f0]',
            i % 2 === 1 && 'bg-[#fafafa]',
          )}
        >
          <dt className="text-[13px] font-medium leading-relaxed text-[#111] sm:pt-px sm:text-[14px]">
            {entry.term}
          </dt>
          <dd className="text-[14px] leading-relaxed text-[#5f5f5f]">{entry.def}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LegalRoute() {
  const { slug } = useParams();
  const reduceMotion = useReducedMotion();
  const doc = DOCS.find(d => d.slug === slug);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState(0);
  // Which tick's label is revealed (hover/focus) — one at a time, never a column.
  const [peekedSection, setPeekedSection] = useState<number | null>(null);

  useEffect(() => {
    if (doc) document.title = `${doc.title} · SEEKO Studio`;
  }, [doc]);

  // Scroll-spy for the tick rail: the route owns its scrolling, so we watch
  // the container (not window) and mark the last section whose heading has
  // passed the anchor line. 160px sits just below where scrollIntoView +
  // scroll-mt-28 lands a heading, so a just-jumped-to section counts as
  // active rather than the one before it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !doc) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      // Scrolled to the end → the last section is active even if its heading
      // never crosses the anchor line (short final sections can't).
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
        setActiveSection(doc.sections.length - 1);
        return;
      }
      let current = 0;
      doc.sections.forEach((section, i) => {
        const el = document.getElementById(sectionId(i, section.heading));
        if (el && el.getBoundingClientRect().top <= 160) current = i;
      });
      setActiveSection(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [doc]);

  if (!doc) return <Navigate to="/legal/terms" replace />;

  const jumpTo = (index: number) => {
    const el = document.getElementById(sectionId(index, doc.sections[index].heading));
    if (!el) return;
    // Optimistic: mark the destination now; the scroll-spy confirms on settle.
    setActiveSection(index);
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${sectionId(index, doc.sections[index].heading)}`);
  };

  const rise = (order: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: RISE.y },
          animate: { opacity: 1, y: 0 },
          transition: { ...RISE.t, delay: order * RISE.stagger },
        };

  return (
    <div
      ref={scrollerRef}
      className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white px-4 antialiased pb-[env(safe-area-inset-bottom)] [scrollbar-gutter:stable_both-edges]"
    >
      {/* Top bar — same geometry as /login so the two pages read as one place */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8">
        <Link
          to="/login"
          className="flex items-center gap-2.5 transition-opacity duration-150 hover:opacity-70"
        >
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-[#686868]">Studio</span>
        </Link>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20Studio%20legal%20question"
          className="flex items-center gap-2 text-base text-[#686868] transition-colors duration-150 hover:text-[#3a3a3a] active:text-[#111]"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      {/* Tick rail — sticky left-margin section navigator (wide screens only;
          narrow screens keep the in-flow Contents card). Ticks only — the full
          section list is never printed on screen; hovering or focusing a tick
          reveals just that section's label (spring in, quiet fade out), and
          clicking jumps within the route's own scroll container. */}
      <motion.nav
        aria-label="Sections"
        className="fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col print:hidden xl:flex sm:left-10"
        onMouseLeave={() => setPeekedSection(null)}
        {...(reduceMotion
          ? {}
          : {
              initial: { opacity: 0, x: -8 },
              animate: { opacity: 1, x: 0 },
              transition: { ...RISE.t, delay: 2 * RISE.stagger },
            })}
      >
        {doc.sections.map((section, i) => (
          <button
            key={i}
            type="button"
            onClick={() => jumpTo(i)}
            onMouseEnter={() => setPeekedSection(i)}
            onFocus={() => setPeekedSection(i)}
            onBlur={() => setPeekedSection(null)}
            aria-label={`Section ${i + 1}: ${section.heading}`}
            aria-current={i === activeSection ? 'true' : undefined}
            className="group/tick relative flex w-8 items-center py-[5px]"
          >
            <span
              aria-hidden
              className={cn(
                'h-[2px] rounded-full transition-[width,background-color] duration-200',
                i === activeSection
                  ? 'w-6 bg-[#1c1c1c]'
                  : 'w-3.5 bg-[#dcdcdc] group-hover/tick:bg-[#a0a0a0]',
              )}
            />
            {/* Label floats beside the tick (absolute — reveals cause zero
                layout shift). Spring entrance with a 2px blur bridge; exit is
                a quicker, quieter fade per the subtle-exits rule. */}
            <AnimatePresence>
              {peekedSection === i && (
                <motion.span
                  initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -6, filter: 'blur(2px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={
                    reduceMotion
                      ? { opacity: 0, transition: { duration: 0 } }
                      : { opacity: 0, x: -3, filter: 'blur(2px)', transition: { duration: 0.12, ease: 'easeOut' } }
                  }
                  transition={reduceMotion ? { duration: 0 } : springs.snappy}
                  className={cn(
                    'pointer-events-none absolute left-full ml-3 max-w-[320px] truncate whitespace-nowrap text-left text-[12px] leading-none',
                    i === activeSection ? 'font-medium text-[#1c1c1c]' : 'text-[#5f5f5f]',
                  )}
                >
                  {section.heading}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        ))}
      </motion.nav>

      <main className="mx-auto w-full max-w-[680px] pb-24 pt-32 sm:pt-36">
        {/* Document switcher — pill per document, current one filled */}
        <motion.nav aria-label="Legal documents" className="flex flex-wrap gap-1.5" {...rise(0)}>
          {DOCS.map(d => (
            <Link
              key={d.slug}
              to={`/legal/${d.slug}`}
              aria-current={d.slug === doc.slug ? 'page' : undefined}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
                d.slug === doc.slug
                  ? 'bg-[#f1f1f1] text-[#3a3a3a]'
                  : 'text-[#909090] hover:bg-[#f7f7f7] hover:text-[#5f5f5f]',
              )}
            >
              {d.shortTitle}
            </Link>
          ))}
        </motion.nav>

        <motion.div className="mt-8" {...rise(1)}>
          <h1 className="text-balance text-[28px] font-semibold tracking-[-0.02em] text-[#1c1c1c]">
            {doc.title}
          </h1>
          <p className="mt-2 text-[13px] font-medium tabular-nums text-[#969696]">
            Effective {doc.effectiveDate}
          </p>
          <p className="mt-5 text-pretty text-base leading-relaxed text-[#6e6e6e]">{doc.intro}</p>
        </motion.div>

        {/* Contents — quick anchors for screens too narrow for the tick rail;
            numbers in tabular figures so the column aligns */}
        <motion.nav
          aria-label="Contents"
          className="mt-9 rounded-2xl bg-[#fafafa] px-5 py-4 xl:hidden"
          {...rise(2)}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a0a0a0]">
            Contents
          </p>
          <ol className="mt-2.5 columns-1 gap-8 sm:columns-2">
            {doc.sections.map((section, i) => (
              <li key={i} className="break-inside-avoid">
                <a
                  href={`#${sectionId(i, section.heading)}`}
                  className="flex gap-2 py-[3px] text-[13.5px] leading-snug text-[#6e6e6e] transition-colors duration-150 hover:text-[#111]"
                >
                  <span className="w-5 shrink-0 tabular-nums text-[#b0b0b0]">{i + 1}</span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </motion.nav>

        <motion.article className="mt-12 space-y-10" {...rise(3)}>
          {doc.sections.map((section, i) => (
            <section key={i} id={sectionId(i, section.heading)} className="scroll-mt-28">
              <h2 className="flex gap-3 text-[16px] font-semibold text-[#1c1c1c]">
                <span className="tabular-nums text-[#c0c0c0]">{i + 1}</span>
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 pl-[30px]">
                {section.body.map((block, j) => (
                  <Block key={j} block={block} />
                ))}
              </div>
            </section>
          ))}
        </motion.article>

        <motion.footer
          className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[#f0f0f0] pt-6"
          {...rise(4)}
        >
          <p className="text-[13px] text-[#a0a0a0]">SEEKO Studio</p>
          <Link
            to="/login"
            className="text-[13px] font-medium text-[#6e6e6e] transition-colors duration-150 hover:text-[#111]"
          >
            Back to sign in
          </Link>
        </motion.footer>
      </main>
    </div>
  );
}
