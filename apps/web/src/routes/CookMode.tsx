import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';

// Dedicated cook-mode screen — a full-screen TAKEOVER (rendered outside AuthedLayout, so no nav /
// footer) with big type + generous spacing readable from across the counter, and Modify / timer /
// read-aloud one tap away in the cook-mode bar (Figma cook-mode frame, adapted to our palette).
// PLACEHOLDER ONLY: no mechanics yet — the layout is a static, non-interactive preview behind a
// "coming soon" banner; Exit is the one working control (so the takeover is never a dead end).
export default function CookMode() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-page">
      {/* Cook-mode bar — deep sage, controls one tap away */}
      <header className="flex shrink-0 items-center justify-between gap-4 bg-primary-deep px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <XIcon /> Exit cook mode
          </button>
          <div className="hidden h-6 w-px bg-white/20 sm:block" aria-hidden="true" />
          <div className="hidden min-w-0 items-baseline gap-2 sm:flex">
            <span className="truncate font-serif text-base font-semibold">Miso butter pasta</span>
            <span className="shrink-0 text-sm text-white/60">Step 2 of 4</span>
          </div>
        </div>

        {/* Modify / timer / read-aloud — placeholders for now (non-interactive) */}
        <div className="flex shrink-0 items-center gap-2" aria-hidden="true">
          <BarChip>
            <ClockIcon /> 2:00
          </BarChip>
          <BarChip>
            <SpeakerIcon /> <span className="hidden md:inline">Read aloud</span>
          </BarChip>
          <span className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
            <SparkleIcon /> Modify
          </span>
        </div>
      </header>

      {/* Coming-soon banner */}
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-border-subtle bg-accent-soft px-4 py-2 text-center text-sm font-medium text-accent-text">
        <SparkleIcon /> Cook mode is coming soon — this is a preview of the layout.
      </div>

      {/* Static, non-interactive mockup */}
      <div className="pointer-events-none flex-1 select-none overflow-y-auto">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-6 py-10 md:grid-cols-[1fr_340px]">
          {/* Current step */}
          <div className="flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              Step 2 · Crisp the sage in butter
            </p>
            <h1 className="mt-3 max-w-2xl font-serif text-4xl font-semibold leading-[1.15] text-text-default">
              Melt butter, crisp the sage, whisk in miso.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-text-body">
              Melt <strong className="font-semibold">4 tbsp butter</strong> in a wide pan over medium
              heat. Add a handful of <strong className="font-semibold">sage leaves</strong> and let
              them crisp, about 1–2 min. Whisk in{' '}
              <strong className="font-semibold">3 tbsp white miso</strong> until smooth and glossy.
            </p>

            {/* Step jump chips */}
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <StepChip>Boil</StepChip>
              <StepChip active>Sauce</StepChip>
              <StepChip>Toss</StepChip>
              <StepChip>Plate</StepChip>
              <span className="ml-1 text-sm text-text-placeholder">tap any step to jump</span>
            </div>

            {/* Prev / Next */}
            <div className="mt-8 flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-card px-4 py-2 text-sm font-medium text-text-default">
                <ChevronLeft /> Prev
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white">
                Next step <ChevronRight />
              </span>
            </div>
          </div>

          {/* Step-aware sidebar */}
          <div className="flex flex-col gap-3">
            <Card variant="bordered" padding="sm">
              <SidebarLabel>You'll need now</SidebarLabel>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-text-body">
                <li>4 tbsp butter</li>
                <li>Handful sage leaves</li>
                <li>3 tbsp white miso</li>
              </ul>
            </Card>

            <Card variant="bordered" padding="sm">
              <SidebarLabel>Already done</SidebarLabel>
              <p className="mt-2 text-sm text-text-placeholder line-through">
                Pasta boiled, water reserved
              </p>
            </Card>

            <Card variant="bordered" padding="sm">
              <SidebarLabel>Up next</SidebarLabel>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-text-body">
                <ClockIcon /> Toss pasta with sauce + water
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function BarChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white">
      {children}
    </span>
  );
}

function StepChip({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        active
          ? 'bg-primary-deep text-white'
          : 'border border-border-subtle bg-bg-card text-text-muted'
      }`}
    >
      {children}
    </span>
  );
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-text-placeholder">
      {children}
    </p>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
