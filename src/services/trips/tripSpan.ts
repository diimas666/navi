export type TripSpan = 'all' | 'today' | 'week' | 'month';

export function tripInSpan(startedAt: number, span: TripSpan, now: number): boolean {
  if (span === 'all') {
    return true;
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (span === 'week') {
    const monday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - monday);
  }
  if (span === 'month') {
    start.setDate(1);
  }
  return startedAt >= start.getTime();
}
