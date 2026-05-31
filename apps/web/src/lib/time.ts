import { useEffect, useState } from 'react';

// The daily recommendation batch is cached per UTC day (see useRecommendations), so it rotates at
// the next UTC midnight. This is the time remaining until then — purely client-side, no API call.
export function msUntilNextUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next - now.getTime());
}

// "6h" while an hour or more remains, "45m" in the final hour. Soft indicator, not a precise timer.
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 1) return `${hours}h`;
  return `${totalMinutes}m`;
}

// Live "refreshes in …" label, re-rendering each minute.
export function useTimeUntilUtcMidnight(): string {
  const [ms, setMs] = useState(() => msUntilNextUtcMidnight());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextUtcMidnight()), 60_000);
    return () => clearInterval(id);
  }, []);
  return formatCountdown(ms);
}
