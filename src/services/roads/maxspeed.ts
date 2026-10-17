/** OSM `maxspeed`: "50", "50 km/h", "UA:urban". Unknown or "none" gives null. */
export function parseMaxspeed(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 200) {
    return Math.round(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  if (/^UA:urban$/i.test(value.trim())) {
    return 50;
  }
  if (/^UA:rural$/i.test(value.trim())) {
    return 90;
  }
  const match = value.match(/(\d{2,3})/);
  if (!match) {
    return null;
  }
  const kmh = Number(match[1]);
  if (/mph/i.test(value)) {
    return Math.round(kmh * 1.609);
  }
  return kmh > 0 && kmh < 200 ? kmh : null;
}
