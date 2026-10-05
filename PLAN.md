# Navi — план реалізації

Офлайн-навігатор для України. GPS лишається основним джерелом. Коли фікс зникає або не заслуговує довіри, застосунок оцінює положення (dead reckoning) за швидкістю з OBD-II, гіроскопом і останньою довіреною точкою. Похибка накопичується і завжди показується користувачу.

Репозиторій на старті порожній. Новий проєкт не дублює існуючий код.

## Стек

- React Native CLI 0.87.x (New Architecture), TypeScript, Yarn 1
- iOS 16+, bundle id `com.neiv.app`, назва на екрані «Navi»
- UI лише на React Native. Swift — тільки сенсори, OBD, StoreKit і DR-ядро
- Нативні модулі: Turbo Modules (codegen) + тонкий Objective-C++ адаптер + Swift
- Карта: MapLibre (`@maplibre/maplibre-react-native`) — офлайн-пакети OSM, без Expo
- Навігація: React Navigation 7
- Стан: Zustand
- Локальні налаштування: AsyncStorage
- Анімації: Reanimated 4 + Gesture Handler

Сумісність перевірена перед встановленням: Reanimated 4.6 підтримує RN 0.87, MapLibre RN 11 — лише New Architecture і має OfflineManager.

## Межі чесності

- DR — оцінка, не заміна GPS. У текстах немає обіцянок точного позиціонування без GPS.
- Ціни підписки приходять зі StoreKit. У логіці entitlement цін немає.
- Діагностика маршрутів вимкнена за замовчуванням. Акаунтів немає.
- Якщо адаптер не відповів на PID — значення `null`, дані не вигадуються.
- Повний граф доріг України не вшивається в бінарник. Користувач сам качає область. У застосунку є робочий офлайн-граф: міста й коридори трас. Завантажена область замінює цей граф.
- StoreKit, фоновий Bluetooth і Always-location вимагають профілю Apple Developer і продуктів у App Store Connect. Код і `.storekit` для локальної перевірки готові.

## Архітектура

```
UI (screens, components)
  → hooks
    → services (trust, routing, trips, maps, entitlements)
      → native specs (TurboModuleRegistry)
        → ObjC++ adapter
          → Swift (CoreLocation, CoreMotion, CoreBluetooth, StoreKit, DR)
```

Пізніше без зламу контрактів можна додати EKF, кращий map matching, інші OBD-протоколи, трафік, CarPlay, watchOS і Android.

## Етапи

### 1. Каркас

CLI-проєкт, Yarn, TypeScript, тема, навігація, дизайн-система, усі екрани, темна автомобільна візуальна мова.

### 2. GPS і довіра

`LocationManager.swift`, CoreLocation, When In Use / Always, фон під час активної поїздки. `LocationTrustEngine`: TRUSTED, DEGRADED, UNTRUSTED, LOST. На карті — позиція, курс, коло точності. Сумнівний фікс не малюється як істина.

### 3. Рух

`MotionManager.swift`, CoreMotion: heading, gyro Z, accelerometer. Запит Motion після пояснювального екрана.

### 4. OBD

Інтерфейс `OBDService`. `OBDManager.swift`: BLE (ELM327) і Wi-Fi (TCP 35000). Парсер Mode 01: швидкість `0D`, RPM `0C`, навантаження `04`, дросель `11`, температура `05`, напруга через `ATRV`. Черга команд, `NO DATA` → null.

### 5. Dead reckoning

`DeadReckoningEngine.swift`. Крок: дистанція = швидкість × dt, нова точка на сфері, невизначеність росте з дистанцією і часом. Повернення GPS — плавне зведення, без телепорту. Контракт кроку готовий до заміни на EKF.

### 6. Офлайн-карти і дороги

Каталог областей, завантаження пакета MapLibre і GeoJSON графа, індекс сегментів, прив’язка до дороги лише за достатньої впевненості. Атрибуція OSM. Пошук і маршрут працюють на локальному графі; мережа — лише запасний шлях.

### 7. Підписка

`StoreKitManager.swift`: `getProducts`, `purchase`, `restorePurchases`, `getSubscriptionStatus`. Продукти `com.navi.app.dr.monthly` і `com.navi.app.dr.yearly`. DR у поїздці закритий entitlement. Карти, GPS, історія і попередження — без підписки.

### 8. Історія і приватність

Локальні поїздки: дата, дистанція, час, GPS/DR км, максимальна швидкість, трек. Тумблер анонімної діагностики, типово вимкнений.

### 9. Полірування

Помилки `AppError`, дозволи в правильному порядку, Info.plist, background modes, іконка, launch screen, перевірка `tsc`, ESLint і збірка iOS.

## Перевірка

Після великого етапу: `yarn tsc --noEmit`, `yarn lint`, збірка iOS Simulator (схема Neiv, iphonesimulator).
