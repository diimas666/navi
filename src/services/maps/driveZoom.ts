const MIN = 12;
const MAX = 18;
const CRUISE_KMH = 20;

/** Zoom follows road speed only. Phone tilt must not change it. */
export function zoomFor(base: number, speedMps: number): number {
  const wanted = Number.isFinite(base) ? base : 16;
  const kmh = Math.max(0, Number.isFinite(speedMps) ? speedMps * 3.6 : 0);
  if (kmh < CRUISE_KMH) {
    return clamp(wanted);
  }
  const wider = Math.min(3, (kmh - CRUISE_KMH) / 28);
  return clamp(Math.round((wanted - wider) * 4) / 4);
}

function clamp(value: number): number {
  return Math.min(MAX, Math.max(MIN, value));
}
