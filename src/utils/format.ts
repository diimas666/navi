import {resolveLanguage} from '../i18n/settingsCopy';
import {useSettingsStore} from '../store/settingsStore';

function appLocale(): string {
  return resolveLanguage(useSettingsStore.getState().language) === 'ru' ? 'ru-RU' : 'uk-UA';
}

export function formatSpeed(metersPerSecond: number, unit: 'kmh' | 'mph'): string {
  if (unit === 'mph') {
    return `${Math.round(metersPerSecond * 2.23694)}`;
  }
  return `${Math.round(metersPerSecond * 3.6)}`;
}

export function speedUnitLabel(unit: 'kmh' | 'mph'): string {
  if (unit === 'mph') {
    return 'mph';
  }
  return resolveLanguage(useSettingsStore.getState().language) === 'ru' ? 'км/ч' : 'км/год';
}

export function formatTravel(seconds: number, hoursLabel: string, minutesLabel: string): string {
  const total = Math.max(1, Math.round(Math.max(0, seconds) / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) {
    return `${total} ${minutesLabel}`;
  }
  if (minutes === 0) {
    return `${hours} ${hoursLabel}`;
  }
  return `${hours} ${hoursLabel} ${minutes} ${minutesLabel}`;
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(appLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(appLocale(), {
    day: 'numeric',
    month: 'long',
  });
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }
  return `${(meters / 1000).toFixed(1)} км`;
}

export function formatUncertainty(meters: number): string {
  return `~${Math.max(1, Math.round(meters))} м`;
}
