export type LicenseId = 'osm' | 'maplibre' | 'maplibre-rn' | 'react-native';

export type LicenseEntry = {
  id: LicenseId;
  title: string;
  detail: string;
  url: string;
  notice: string;
};

export const licenses: LicenseEntry[] = [
  {
    id: 'osm',
    title: 'OpenStreetMap',
    detail: 'ODbL 1.0',
    url: 'https://www.openstreetmap.org/copyright',
    notice:
      '© OpenStreetMap contributors. Карти й дорожній граф зібрані з даних OpenStreetMap і поширюються за Open Database License 1.0 (ODbL). Умови Navi не обмежують прав за цією ліцензією.',
  },
  {
    id: 'maplibre',
    title: 'MapLibre Native 6.31.0',
    detail: 'BSD-2-Clause',
    url: 'https://github.com/maplibre/maplibre-native/blob/main/LICENSE.md',
    notice:
      'Карта малюється MapLibre Native 6.31.0. Код MapLibre поширюється за BSD-2-Clause. Повідомлення авторів і повний текст ліцензії — у репозиторії MapLibre.',
  },
  {
    id: 'maplibre-rn',
    title: 'MapLibre React Native 11.4.1',
    detail: 'MIT',
    url: 'https://github.com/maplibre/maplibre-react-native/blob/main/LICENSE.md',
    notice:
      'Зв’язок карти з інтерфейсом дає @maplibre/maplibre-react-native 11.4.1 за ліцензією MIT.',
  },
  {
    id: 'react-native',
    title: 'React Native 0.87.1',
    detail: 'MIT',
    url: 'https://github.com/facebook/react-native/blob/main/LICENSE',
    notice: 'Інтерфейс застосунку зібрано на React Native 0.87.1 за ліцензією MIT.',
  },
];

export function licenseById(id: string): LicenseEntry | undefined {
  return licenses.find(entry => entry.id === id);
}
