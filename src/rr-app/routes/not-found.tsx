import { Link } from 'react-router';
import { BTN_PRIMARY } from '@/components/dashboard/lightKit';

const NUMERAL_4 = 'M120 0 L40 130 L160 130 M120 0 L120 200';
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7aff]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ov-bg)]';

export function NotFoundRoute() {
  return <NotFoundContent />;
}

export function NotFoundContent() {
  return (
    <div className="overview-light min-h-[220vh] bg-[var(--ov-bg)] text-[#111] antialiased">
      <div className="relative h-[220vh]">
        <div className="sticky top-0 flex h-screen flex-col items-center justify-center gap-7 px-6">
          <p className="font-mono text-[12px] font-medium tracking-[0.18em] text-[#808080]">
            ERROR · 404
          </p>

          <svg
            viewBox="0 0 620 240"
            role="img"
            aria-label="404"
            className="w-[min(86vw,560px)]"
            fill="none"
            stroke="#111"
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={NUMERAL_4} transform="translate(40 20)" vectorEffect="non-scaling-stroke" />
            <ellipse
              cx="80"
              cy="100"
              rx="70"
              ry="100"
              transform="translate(230 20)"
              stroke="#0d7aff"
              vectorEffect="non-scaling-stroke"
            />
            <path d={NUMERAL_4} transform="translate(420 20)" vectorEffect="non-scaling-stroke" />
          </svg>

          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-[clamp(22px,2.4vw,28px)] font-semibold text-[#111]">
              This page wandered off the map
            </h1>
            <p className="max-w-md text-[14px] leading-relaxed text-[#505050]">
              The page you’re looking for doesn’t exist or was moved. Let’s get you back on track.
            </p>
            <div className="mt-1 flex items-center gap-5">
              <Link to="/tasks" className={`${BTN_PRIMARY} ${FOCUS_RING} active:scale-[0.98]`}>
                Back to tasks
              </Link>
              <Link
                to="/docs"
                className={`text-[14px] font-medium text-[#505050] underline-offset-4 transition-colors hover:text-[#111] hover:underline ${FOCUS_RING}`}
              >
                Open docs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
