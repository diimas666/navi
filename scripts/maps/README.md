# Офлайн-карти

Застосунок качає карту області одним файлом `.pmtiles` з публічного релізу
[`maps-v1`](https://github.com/diimas666/navi/releases/tag/maps-v1). Файл лежить у телефоні
(`Library/NeivMaps`) і не залежить від сервера тайлів: адреса не змінюється, мережа не потрібна.

Хостинг безкоштовний — це GitHub Releases цього репозиторію.

## Оновити карти (раз на 2–4 тижні)

```sh
python3 -I scripts/maps/build.py \
  --work ../navi-maps-build --out ../navi-maps-build/out \
  --java /opt/homebrew/opt/openjdk/bin/java \
  --pmtiles ../navi-maps-build/tools/pm/pmtiles \
  --fresh-osm
scripts/maps/publish.sh ../navi-maps-build/out
```

- `build.py` бере свіжий OSM України з Geofabrik, будує тайли planetiler (схема OpenMapTiles, як у
  стилів OpenFreeMap) до z14, ріже по областях з `src/constants/map.ts` і кладе поруч шрифти,
  спрайти, стилі та `manifest.json`.
- `publish.sh` завантажує файли в реліз. `manifest.json` іде останнім, тож телефони бачать нову
  версію лише коли всі файли вже на місці. Потрібен `gh auth login` один раз.

Телефон звіряє `manifest.json`: якщо версія нова, а карта старша за 14 днів, область
перекачується у фоні при наступному виході в мережу.

## Що потрібно

- Java 21+ (`brew install openjdk`), 16 ГБ вільної пам'яті під `--memory`.
- [pmtiles CLI](https://github.com/protomaps/go-pmtiles/releases).
- ~10 ГБ диска під робочі файли.
