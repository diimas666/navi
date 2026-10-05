import type {ResolvedLanguage} from '../../i18n/settingsCopy';
import NativeTripSession from '../../native/NativeTripSession';
import {useSettingsStore} from '../../store/settingsStore';

let lastCue = '';

export type AnnouncePhase = 'far' | 'near' | 'arrive';

export function announcePhase(meters: number, arrived: boolean): AnnouncePhase | null {
  if (arrived || meters < 30) {
    return 'arrive';
  }
  if (meters <= 110) {
    return 'near';
  }
  if (meters <= 320) {
    return 'far';
  }
  return null;
}

export function shouldAnnounce(enabled: boolean, phase: AnnouncePhase | null, title: string, previous: string): boolean {
  return enabled && phase != null && title.length > 0 && `${phase}:${title}` !== previous;
}

export function speakManeuver(
  meters: number,
  title: string,
  language: ResolvedLanguage,
  arrived = false,
): void {
  const phase = announcePhase(meters, arrived);
  if (!shouldAnnounce(useSettingsStore.getState().voice, phase, title, lastCue)) {
    return;
  }
  lastCue = `${phase}:${title}`;
  const phrase = phraseFor(phase ?? 'far', meters, title, language);
  try {
    NativeTripSession?.speak?.(phrase, language);
  } catch {
    lastCue = '';
  }
}

export function stopManeuverSpeech(): void {
  lastCue = '';
  try {
    NativeTripSession?.stopSpeaking?.();
  } catch {
    // The phrase simply is not started again.
  }
}

function phraseFor(phase: AnnouncePhase, meters: number, title: string, language: ResolvedLanguage): string {
  if (phase === 'arrive') {
    return language === 'ru' ? 'Вы на месте' : 'Ви на місці';
  }
  if (phase === 'near') {
    return language === 'ru' ? `Сейчас. ${title}` : `Зараз. ${title}`;
  }
  const rounded = Math.round(meters / 10) * 10;
  return language === 'ru' ? `Через ${rounded} метров. ${title}` : `За ${rounded} метрів. ${title}`;
}
