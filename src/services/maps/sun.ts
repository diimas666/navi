/** Civil-twilight cutoff: map goes dark when the sun is this many degrees below the horizon. */
const NIGHT_ELEVATION = -6;

export function isNightAt(latitude: number, longitude: number, at = new Date()): boolean {
  return solarElevation(latitude, longitude, at) < NIGHT_ELEVATION;
}

export function solarElevation(latitude: number, longitude: number, at: Date): number {
  const rad = Math.PI / 180;
  const start = Date.UTC(at.getUTCFullYear(), 0, 0);
  const day = (at.getTime() - start) / 86_400_000;
  const declination = 23.44 * Math.sin(((360 / 365) * (day - 81)) * rad);
  const utcHours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  const hourAngle = 15 * (utcHours - 12) + longitude;
  const sinEl =
    Math.sin(latitude * rad) * Math.sin(declination * rad) +
    Math.cos(latitude * rad) * Math.cos(declination * rad) * Math.cos(hourAngle * rad);
  return (Math.asin(Math.min(1, Math.max(-1, sinEl))) * 180) / Math.PI;
}
