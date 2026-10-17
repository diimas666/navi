/** What the driver sees while GPS is jammed or spoofed. Null while GPS is trusted. */
export type JamNotice = {kind: 'jam' | 'spoof'; accuracyM: number | null};

const SPOOF_REASONS = new Set(['unreachable_from_trusted', 'impossible_speed', 'position_jump']);

export function jamNotice(
  snapshot: {trust: string; trustReason: string; hasEstimate: boolean; accuracy: number; source: string} | null,
): JamNotice | null {
  if (!snapshot || snapshot.trust === 'trusted' || snapshot.trust === 'degraded') {
    return null;
  }
  if (snapshot.trustReason === 'gps_check') {
    return null;
  }
  const estimated = snapshot.hasEstimate && (snapshot.source === 'dr' || snapshot.source === 'blended');
  return {
    kind: SPOOF_REASONS.has(snapshot.trustReason) ? 'spoof' : 'jam',
    accuracyM: estimated && Number.isFinite(snapshot.accuracy) ? roundAccuracy(snapshot.accuracy) : null,
  };
}

/** ±37 m reads as false precision for an estimate. Steps of 10 m, then 50 m. */
function roundAccuracy(meters: number): number {
  if (meters < 100) {
    return Math.max(10, Math.round(meters / 10) * 10);
  }
  return Math.round(meters / 50) * 50;
}

/** Short enough for one line beside the map buttons: "Глушіння GPS · ±80 м". */
export function jamText(notice: JamNotice, language: 'uk' | 'ru'): string {
  const head =
    language === 'ru'
      ? notice.kind === 'spoof'
        ? 'Подмена GPS'
        : 'Глушение GPS'
      : notice.kind === 'spoof'
        ? 'Підміна GPS'
        : 'Глушіння GPS';
  if (notice.accuracyM == null) {
    return language === 'ru' ? `${head} · последняя точка` : `${head} · остання точка`;
  }
  return `${head} · ±${notice.accuracyM} м`;
}
