# Офлайн-карти

Застосунок качає карту області одним файлом `.pmtiles` з публічного релізу
[`maps-v1`](https://github.com/diimas666/navi/releases/tag/maps-v1). Файл лежить у телефоні
(`Library/NeivMaps`) і не залежить від сервера тайлів: адреса не змінюється, мережа не потрібна.

Хостинг безкоштовний — це GitHub Releases цього репозиторію.

## Оновити карти (раз на 2–4 тижні)

```sh
# Бази областей: усі адреси й граф доріг (venv з pyosmium: python3 -m venv venv && venv/bin/pip install osmium)
../navi-maps-build/venv/bin/python -I scripts/maps/region_data.py \
  --pbf ../navi-maps-build/data/ukraine-latest.osm.pbf --out ../navi-maps-build/data-out --version $(date +%Y%m%d)
python3 -I scripts/maps/build.py --data ../navi-maps-build/data-out \
  --work ../navi-maps-build --out ../navi-maps-build/out \
  --java /opt/homebrew/opt/openjdk/bin/java \
  --pmtiles ../navi-maps-build/tools/pm/pmtiles \
  --fresh-osm
scripts/maps/publish.sh ../navi-maps-build/out
```

- `build.py` бере свіжий OSM України з Geofabrik, будує тайли planetiler (схема OpenMapTiles, як у
  стилів OpenFreeMap) до z14, ріже по областях з `src/constants/map.ts` і кладе поруч шрифти,
  спрайти, стилі та `manifest.json`.
- `region_data.py` складає `<область>.db` (SQLite): усі будинки з номером, під'їзди, інтерполяції,
  будинки з вулицею через відношення `associatedStreet` або найближчу вулицю до 100 м, і граф доріг,
  розрізаний на перехрестях, з `maxspeed`. Застосунок читає звідти дороги й будинки навколо машини,
  а пошук бачить усю область.
- `publish.sh` завантажує файли в реліз. `manifest.json` іде останнім, тож телефони бачать нову
  версію лише коли всі файли вже на місці. Потрібен `gh auth login` один раз.

Телефон звіряє `manifest.json`: якщо версія нова, а карта старша за 14 днів, область
перекачується у фоні при наступному виході в мережу.

## Що потрібно

- Java 21+ (`brew install openjdk`), 16 ГБ вільної пам'яті під `--memory`.
- [pmtiles CLI](https://github.com/protomaps/go-pmtiles/releases).
- ~10 ГБ диска під робочі файли.
