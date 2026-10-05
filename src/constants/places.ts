import type {ResolvedLanguage} from '../i18n/settingsCopy';

export const SAVED_PLACE_KINDS = [{id: 'home'}, {id: 'work'}] as const;

export type SavedPlaceKind = (typeof SAVED_PLACE_KINDS)[number]['id'];

export type SavedPlace = {
  kind: SavedPlaceKind;
  name: string;
  latitude: number;
  longitude: number;
};

export type ExtraPlace = {
  id: string;
  title: string;
  name: string;
  latitude: number;
  longitude: number;
};

const titles: Record<ResolvedLanguage, Record<SavedPlaceKind, string>> = {
  uk: {
    home: 'Дім',
    work: 'Робота',
  },
  ru: {
    home: 'Дом',
    work: 'Работа',
  },
};

const prompts: Record<ResolvedLanguage, Record<SavedPlaceKind, string>> = {
  uk: {
    home: 'Адреса дому',
    work: 'Адреса роботи',
  },
  ru: {
    home: 'Адрес дома',
    work: 'Адрес работы',
  },
};

export function savedPlaceTitle(kind: SavedPlaceKind, language: ResolvedLanguage): string {
  return titles[language][kind];
}

export function savedPlacePrompt(kind: SavedPlaceKind, language: ResolvedLanguage): string {
  return prompts[language][kind];
}
