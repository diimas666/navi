import {useSettingsStore} from '../store/settingsStore';
import {resolveLanguage, type ResolvedLanguage} from './settingsCopy';

const uk = {
  noFix: 'Положення на карті ще немає. Зачекайте GPS.',
  noRoute: 'Маршрут вулицями не побудувався.',
  noGps: 'Без геопозиції поїздку не почати.',
  tripFail: 'Поїздку не вдалося почати.',
  routeNeedGps: 'Маршрут на карті. Для поїздки потрібна геопозиція.',
  routeKept: 'Маршрут збережено. Поїздку не вдалося почати.',
  adapter: 'Адаптер не підключено',
  adapterBody: 'Без нього навігатор працює від телефона.',
  connect: 'Підключити',
  dismiss: 'Закрити',
  network: 'Немає мережі',
  gps: 'Немає GPS',
  roadsMissing: 'У цій області ще немає доріг для офлайн-маршруту.',
  housesMissing: 'Номери будинків області ще не всі збережені. Запустіть завантаження ще раз.',
};

const ru: typeof uk = {
  noFix: 'Положения на карте ещё нет. Подождите GPS.',
  noRoute: 'Маршрут по улицам не построился.',
  noGps: 'Без геопозиции поездку не начать.',
  tripFail: 'Поездку не удалось начать.',
  routeNeedGps: 'Маршрут на карте. Для поездки нужна геопозиция.',
  routeKept: 'Маршрут сохранён. Поездку не удалось начать.',
  adapter: 'Адаптер не подключён',
  adapterBody: 'Без него навигатор работает от телефона.',
  connect: 'Подключить',
  dismiss: 'Закрыть',
  network: 'Нет сети',
  gps: 'Нет GPS',
  roadsMissing: 'В этой области ещё нет дорог для офлайн-маршрута.',
  housesMissing: 'Номера домов области ещё не все сохранены. Запустите загрузку ещё раз.',
};

export function tripText(language?: ResolvedLanguage): typeof uk {
  const resolved = language ?? resolveLanguage(useSettingsStore.getState().language);
  return resolved === 'ru' ? ru : uk;
}
