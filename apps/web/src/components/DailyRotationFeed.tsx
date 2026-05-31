import { useEffect, useRef, type ReactNode } from 'react';
import { useRecommendations } from '../hooks/useRecommendations';
import { useTimeUntilUtcMidnight } from '../lib/time';
import RecommendationCard from './RecommendationCard';

// "Ideas for tonight" — the daily rotation, Home's headline section. The 6 cards live in a single
// horizontal, mouse-draggable carousel inside a dashed light-brand container (matches v2_home_screen).
// Generated lazily on first request of the UTC day (~30-60s on first load). A live "Refreshes in Xh"
// countdown + a FRESH TODAY badge signal the once-a-day rotation.
export default function DailyRotationFeed() {
  const { data, isLoading, isError, refetch } = useRecommendations();
  const refreshIn = useTimeUntilUtcMidnight();
  const count = data?.recipes.length ?? 6;

  return (
    <section className="bg-bg-page">
      <div className="mx-auto w-full max-w-[1024px] px-6 py-10">
        <div className="rounded-2xl border-2 border-dashed border-accent-peach bg-accent-bg-soft p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="flex items-center gap-2 text-2xl font-semibold text-text-default">
                <span aria-hidden="true">🍳</span> Ideas for tonight
              </h2>
              <p className="text-sm text-text-muted">
                A fresh batch every morning · {count} picks based on your taste
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-accent-text">
                Fresh today
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted">
                <RefreshIcon /> Refreshes in {refreshIn}
              </span>
            </div>
          </div>

          {isError ? (
            <div className="mt-5 flex flex-col items-start gap-2 rounded-lg border border-border-subtle bg-bg-card p-4">
              <p className="text-sm text-danger">Couldn't load today's recipes.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-sm font-medium text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          ) : isLoading ? (
            <div className="scrollbar-thin mt-5 flex gap-4 overflow-x-hidden pb-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <Carousel>
              {data?.recipes.map((r, i) => (
                <div key={`${data.batchDate}-${i}`} className="w-72 shrink-0">
                  <RecommendationCard recipe={r} />
                </div>
              ))}
            </Carousel>
          )}
        </div>
      </div>
    </section>
  );
}

// Continuously auto-scrolling carousel: the cards drift slowly right-to-left to advertise that the
// row scrolls. The track is duplicated so the loop is seamless (jump back by one set's width). It's
// still mouse-draggable and touch/trackpad-pannable; auto-scroll pauses while the pointer is over the
// row or a drag is in progress, and is disabled entirely under prefers-reduced-motion. A drag that
// actually moved swallows the trailing click so it doesn't fire a card's "Move to catalog" button.
const AUTO_SCROLL_PX_PER_SEC = 24;

function Carousel({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const pausedRef = useRef(false);
  const posRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let last = performance.now();
    function tick(now: number) {
      const dt = now - last;
      last = now;
      const node = scrollRef.current;
      if (node) {
        if (!pausedRef.current && !drag.current.active) {
          posRef.current += (AUTO_SCROLL_PX_PER_SEC * dt) / 1000;
          // copyRef is the duplicate set; its offset = one full set's width → wrap point.
          const period = copyRef.current?.offsetLeft ?? 0;
          if (period > 0 && posRef.current >= period) posRef.current -= period;
          node.scrollLeft = posRef.current;
        } else {
          posRef.current = node.scrollLeft; // stay in sync while paused / dragging
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return; // touch/pen use native scrolling
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = scrollRef.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    el.scrollLeft = d.scrollLeft - dx;
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    drag.current.active = false;
    scrollRef.current?.releasePointerCapture?.(e.pointerId);
  }
  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }

  return (
    <div
      ref={scrollRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onClickCapture={onClickCapture}
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
      className="scrollbar-thin mt-5 cursor-grab touch-pan-x overflow-x-auto pb-2 select-none active:cursor-grabbing"
    >
      <div className="relative flex gap-4">
        <div className="flex shrink-0 gap-4">{children}</div>
        <div ref={copyRef} className="flex shrink-0 gap-4" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="w-72 shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      <div className="shimmer h-48" aria-hidden="true" />
      <div className="flex flex-col gap-2 p-4">
        <div className="shimmer h-4 w-3/4 rounded" />
        <div className="shimmer h-3 w-full rounded" />
        <div className="shimmer h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
