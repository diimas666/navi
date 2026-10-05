import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const earth = 6378137;

function haversine(lon1, lat1, lon2, lat2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lon1, lat1, lon2, lat2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x =
    Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function pointAlong(line, distance) {
  let left = distance;
  for (let index = 1; index < line.length; index += 1) {
    const [lon1, lat1] = line[index - 1];
    const [lon2, lat2] = line[index];
    const length = haversine(lon1, lat1, lon2, lat2);
    if (left <= length) {
      const ratio = length === 0 ? 0 : left / length;
      return {
        lon: lon1 + (lon2 - lon1) * ratio,
        lat: lat1 + (lat2 - lat1) * ratio,
        heading: bearing(lon1, lat1, lon2, lat2),
      };
    }
    left -= length;
  }
  const [lon, lat] = line[line.length - 1];
  const prev = line[line.length - 2];
  return {lon, lat, heading: bearing(prev[0], prev[1], lon, lat)};
}

function lineLength(line) {
  let total = 0;
  for (let index = 1; index < line.length; index += 1) {
    total += haversine(
      line[index - 1][0],
      line[index - 1][1],
      line[index][0],
      line[index][1],
    );
  }
  return total;
}

const demoLine = [
  [30.352, 50.424],
  [30.364, 50.4268],
  [30.376, 50.4302],
  [30.388, 50.4344],
  [30.399, 50.4396],
];

const duration = 150;
const hz = 5;
const length = lineLength(demoLine);
const samples = [];
for (let step = 0; step <= duration * hz; step += 1) {
  const time = step / hz;
  const progress = time / duration;
  const speedKmh = 46 + Math.sin(progress * Math.PI * 2) * 10;
  const distance = (speedKmh / 3.6) * time;
  const clamped = Math.min(distance, length * 0.98);
  const point = pointAlong(demoLine, clamped);
  const lost = time >= 30 && time < 120;
  const drift = lost ? (time - 30) * 0.07 : 0;
  samples.push({
    timestamp: Number(time.toFixed(1)),
    latitude: Number(point.lat.toFixed(6)),
    longitude: Number(point.lon.toFixed(6)),
    speed: Number(speedKmh.toFixed(1)),
    heading: Number(point.heading.toFixed(1)),
    motionHeading: Number(((point.heading + drift) % 360).toFixed(1)),
    gpsStatus: lost ? 'lost' : 'trusted',
    accuracy: lost ? null : 8,
  });
}

const nodes = [
  ['kyiv', 'Київ', 50.4501, 30.5234, 'city'],
  ['bila', 'Біла Церква', 49.8093, 30.112, 'city'],
  ['uman', 'Умань', 48.7484, 30.2218, 'city'],
  ['odesa', 'Одеса', 46.4825, 30.7233, 'city'],
  ['zhytomyr', 'Житомир', 50.2547, 28.6587, 'city'],
  ['rivne', 'Рівне', 50.6199, 26.2516, 'city'],
  ['lutsk', 'Луцьк', 50.7472, 25.3254, 'city'],
  ['lviv', 'Львів', 49.8397, 24.0297, 'city'],
  ['ternopil', 'Тернопіль', 49.5535, 25.5948, 'city'],
  ['khmel', 'Хмельницький', 49.4229, 26.9871, 'city'],
  ['vinnytsia', 'Вінниця', 49.2331, 28.4682, 'city'],
  ['chernivtsi', 'Чернівці', 48.2917, 25.9352, 'city'],
  ['ivano', 'Івано-Франківськ', 48.9226, 24.7111, 'city'],
  ['uzhhorod', 'Ужгород', 48.6208, 22.2879, 'city'],
  ['chernihiv', 'Чернігів', 51.4982, 31.2893, 'city'],
  ['sumy', 'Суми', 50.9077, 34.7981, 'city'],
  ['kharkiv', 'Харків', 49.9935, 36.2304, 'city'],
  ['poltava', 'Полтава', 49.5883, 34.5514, 'city'],
  ['cherkasy', 'Черкаси', 49.4444, 32.0598, 'city'],
  ['kropy', 'Кропивницький', 48.5079, 32.2623, 'city'],
  ['dnipro', 'Дніпро', 48.4647, 35.0462, 'city'],
  ['zaporizhzhia', 'Запоріжжя', 47.8388, 35.1396, 'city'],
  ['kryvyi', 'Кривий Ріг', 47.9105, 33.3918, 'city'],
  ['mykolaiv', 'Миколаїв', 46.975, 31.9946, 'city'],
  ['kherson', 'Херсон', 46.6354, 32.6169, 'city'],
  ['kharkiv-mid', 'Валки', 49.838, 35.62, 'junction'],
  ['sviatoshyn', 'Святошин', 50.4578, 30.3655, 'junction'],
  ['borsch-start', 'Борщагівка', 50.424, 30.352, 'junction'],
  ['borsch-2', 'Борщагівка', 50.4268, 30.364, 'junction'],
  ['borsch-3', 'Борщагівка', 50.4302, 30.376, 'junction'],
  ['borsch-4', 'Борщагівка', 50.4344, 30.388, 'junction'],
  ['borsch-end', 'Борщагівка', 50.4396, 30.399, 'junction'],
];

const links = [
  ['kyiv', 'bila', 'М-05'],
  ['bila', 'uman', 'М-05'],
  ['uman', 'odesa', 'М-05'],
  ['kyiv', 'zhytomyr', 'М-06'],
  ['zhytomyr', 'rivne', 'М-06'],
  ['rivne', 'lviv', 'М-06'],
  ['lviv', 'uzhhorod', 'М-06'],
  ['kyiv', 'chernihiv', 'М-01'],
  ['kyiv', 'poltava', 'М-03'],
  ['poltava', 'kharkiv-mid', 'М-03'],
  ['kharkiv-mid', 'kharkiv', 'М-03'],
  ['kyiv', 'cherkasy', 'Н-16'],
  ['cherkasy', 'kropy', 'М-30'],
  ['kropy', 'dnipro', 'М-30'],
  ['uman', 'vinnytsia', 'М-30'],
  ['vinnytsia', 'khmel', 'М-30'],
  ['khmel', 'ternopil', 'М-30'],
  ['ternopil', 'lviv', 'М-30'],
  ['zhytomyr', 'vinnytsia', 'М-21'],
  ['rivne', 'lutsk', 'Н-22'],
  ['ternopil', 'chernivtsi', 'Н-10'],
  ['lviv', 'ivano', 'Н-09'],
  ['ivano', 'chernivtsi', 'Н-10'],
  ['dnipro', 'zaporizhzhia', 'М-18'],
  ['kharkiv', 'dnipro', 'М-18'],
  ['dnipro', 'kryvyi', 'Н-11'],
  ['kryvyi', 'mykolaiv', 'Н-11'],
  ['odesa', 'mykolaiv', 'М-14'],
  ['mykolaiv', 'kherson', 'М-14'],
  ['poltava', 'sumy', 'Н-12'],
  ['kyiv', 'sviatoshyn', 'просп. Перемоги'],
  ['sviatoshyn', 'borsch-end', 'коридор Святошин — Борщагівка'],
  ['borsch-end', 'borsch-4', 'коридор Святошин — Борщагівка'],
  ['borsch-4', 'borsch-3', 'коридор Святошин — Борщагівка'],
  ['borsch-3', 'borsch-2', 'коридор Святошин — Борщагівка'],
  ['borsch-2', 'borsch-start', 'коридор Святошин — Борщагівка'],
];

const byId = Object.fromEntries(
  nodes.map(([id, name, lat, lon, kind]) => [id, {id, name, lat, lon, kind}]),
);

const edges = links.map(([from, to, name], index) => {
  const start = byId[from];
  const end = byId[to];
  const midLon = (start.lon + end.lon) / 2 + (index % 2 === 0 ? 0.08 : -0.08);
  const midLat = (start.lat + end.lat) / 2 + (index % 3 === 0 ? 0.05 : -0.04);
  const local = name.includes('Борщагівка') || name.includes('Перемоги');
  const coordinates = local
    ? [
        [start.lon, start.lat],
        [end.lon, end.lat],
      ]
    : [
        [start.lon, start.lat],
        [midLon, midLat],
        [end.lon, end.lat],
      ];
  return {
    id: `${from}-${to}`,
    from,
    to,
    name,
    highway: local ? 'primary' : 'trunk',
    coordinates,
  };
});

const pois = [
  {id: 'kbp', name: 'Аеропорт Бориспіль', lat: 50.345, lon: 30.8947, kind: 'poi'},
  {id: 'iev', name: 'Аеропорт Київ', lat: 50.4017, lon: 30.4497, kind: 'poi'},
  {id: 'ods', name: 'Аеропорт Одеса', lat: 46.4268, lon: 30.6765, kind: 'poi'},
  {id: 'lwo', name: 'Аеропорт Львів', lat: 49.8125, lon: 23.9561, kind: 'poi'},
  {id: 'hrk', name: 'Аеропорт Харків', lat: 49.9248, lon: 36.29, kind: 'poi'},
  {id: 'kyiv-pass', name: 'Київ-Пасажирський', lat: 50.4406, lon: 30.4889, kind: 'poi'},
];

const network = {
  nodes: [...nodes.map(([id, name, lat, lon, kind]) => ({id, name, lat, lon, kind})), ...pois],
  edges,
};

const root = resolve(import.meta.dirname, '..');
mkdirSync(resolve(root, 'src/assets/demo'), {recursive: true});
mkdirSync(resolve(root, 'src/assets/roads'), {recursive: true});
writeFileSync(resolve(root, 'src/assets/demo/demoTrip.json'), JSON.stringify(samples));
writeFileSync(resolve(root, 'src/assets/roads/network.json'), JSON.stringify(network));
console.log(`demo ${samples.length} samples, edges ${edges.length}`);
