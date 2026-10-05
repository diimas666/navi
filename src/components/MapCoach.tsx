import {Pressable, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {resolveLanguage, type AppLanguage} from '../i18n/settingsCopy';

type Anchor =
  | 'stack'
  | 'lock'
  | 'zoomIn'
  | 'zoomOut'
  | 'follow'
  | 'puck'
  | 'search'
  | 'pin'
  | 'go'
  | 'places'
  | 'tabs'
  | 'speed';

type Step = {
  anchor: Anchor;
  body: string;
};

const BUTTON = 48;
const GAP = 10;
const COLUMN_TOP = 120;
const COLUMN_RIGHT = 14;

const uk: Step[] = [
  {
    anchor: 'stack',
    body: 'Чотири кнопки праворуч. Унизу — швидкість.\nЗамок — утримати точку.\nПлюс і мінус — масштаб.\nЦентрування — до вашої точки.',
  },
  {anchor: 'lock', body: 'Замок — зафіксувати місце й напрямок. Поки стоїте, точка не пливе.'},
  {anchor: 'zoomIn', body: 'Плюс — наблизити карту. Вулиці й номери будинків стають ближче.'},
  {anchor: 'zoomOut', body: 'Мінус — віддалити карту, щоб бачити район цілком.'},
  {anchor: 'follow', body: 'Центрування — карта повертається до вашої точки. У поїздці вона тримає курс уперед.'},
  {anchor: 'puck', body: 'Я тут — місце й напрямок. Просвіт на кільці дивиться туди, куди повернений телефон.'},
  {anchor: 'search', body: 'Пошук — куди їдемо. Адреса з номером будинку, навіть якщо літера набрана з помилкою.'},
  {anchor: 'pin', body: 'Шпилька — поставити ціль пальцем на карті. Торкніться ще раз, щоб переставити.'},
  {anchor: 'go', body: 'У путь — маршрут вулицями до цілі. Машина поїде по лінії.'},
  {anchor: 'places', body: 'Три крапки — дім, робота й інші збережені адреси.'},
  {anchor: 'tabs', body: 'Вкладки внизу: карта, поїздки й налаштування.'},
  {
    anchor: 'speed',
    body: 'Швидкість. Синім — до 50 км/год у місті. Червоним — якщо їдете швидше за цей режим.',
  },
];

const ru: Step[] = [
  {
    anchor: 'stack',
    body: 'Четыре кнопки справа. Ниже — скорость.\nЗамок — удержать точку.\nПлюс и минус — масштаб.\nЦентрирование — к вашей точке.',
  },
  {anchor: 'lock', body: 'Замок — зафиксировать место и направление. Пока стоите, точка не плывёт.'},
  {anchor: 'zoomIn', body: 'Плюс — приблизить карту. Улицы и номера домов становятся ближе.'},
  {anchor: 'zoomOut', body: 'Минус — отдалить карту, чтобы видеть район целиком.'},
  {anchor: 'follow', body: 'Центрирование — карта возвращается к вашей точке. В поездке она держит курс вперёд.'},
  {anchor: 'puck', body: 'Я здесь — место и направление. Просвет на кольце смотрит туда, куда повёрнут телефон.'},
  {anchor: 'search', body: 'Поиск — куда едем. Адрес с номером дома, даже если буква набрана с ошибкой.'},
  {anchor: 'pin', body: 'Булавка — поставить цель пальцем на карте. Коснитесь ещё раз, чтобы переставить.'},
  {anchor: 'go', body: 'В путь — маршрут улицами до цели. Машина поедет по линии.'},
  {anchor: 'places', body: 'Три точки — дом, работа и другие сохранённые адреса.'},
  {anchor: 'tabs', body: 'Вкладки внизу: карта, поездки и настройки.'},
  {
    anchor: 'speed',
    body: 'Скорость. Синим — до 50 км/ч в городе. Красным — если едете быстрее этого режима.',
  },
];

type Props = {
  language: AppLanguage;
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
};

export function MapCoach({language, step, onStep, onClose}: Props) {
  const {width, height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const russian = resolveLanguage(language) === 'ru';
  const copy = russian ? ru : uk;
  const safeStep = Math.min(step, copy.length - 1);
  const current = copy[safeStep];
  const last = safeStep === copy.length - 1;
  const frame = frameFor(current.anchor, width, height, insets.bottom);
  const card = cardFor(current.anchor, frame, width, height, insets.bottom);

  return (
    <View style={styles.fill} pointerEvents="box-none">
      <View style={styles.scrim} />
      <View pointerEvents="none" style={[styles.ring, frame.ring]} />
      {frame.line ? <View pointerEvents="none" style={[styles.line, frame.line]} /> : null}
      <View style={[styles.card, card]}>
        <View style={styles.tools}>
          <Pressable
            accessibilityRole="button"
            disabled={safeStep === 0}
            onPress={() => onStep(safeStep - 1)}
            style={[styles.tool, safeStep === 0 ? styles.toolOff : null]}>
            <Text style={styles.toolLabel}>‹  Назад</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.tool}>
            <Text style={styles.toolLabel}>{russian ? '✕  Пропустить' : '✕  Пропустити'}</Text>
          </Pressable>
        </View>
        <Text style={styles.kicker}>{russian ? 'Учебный пример' : 'Навчальний приклад'}</Text>
        <Text style={styles.body}>{current.body}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (last) {
              onClose();
              return;
            }
            onStep(safeStep + 1);
          }}
          style={styles.next}>
          <Text style={styles.nextLabel}>{nextLabel(last, russian)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function nextLabel(last: boolean, russian: boolean): string {
  if (last) {
    return russian ? 'Готово' : 'Зрозуміло';
  }
  return russian ? 'Далее' : 'Далі';
}

type Box = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width?: number;
  height?: number;
};

function frameFor(
  anchor: Anchor,
  width: number,
  height: number,
  insetBottom: number,
): {ring: Box; line: Box | null} {
  const column = (index: number): Box => ({
    top: COLUMN_TOP + index * (BUTTON + GAP),
    right: COLUMN_RIGHT,
    width: BUTTON,
    height: BUTTON,
  });
  if (anchor === 'stack') {
    return {
      ring: {
        top: COLUMN_TOP - 6,
        right: COLUMN_RIGHT - 6,
        width: BUTTON + 12,
        height: BUTTON * 4 + GAP * 3 + 12,
      },
      line: {
        top: COLUMN_TOP + 70,
        right: COLUMN_RIGHT + BUTTON + 8,
        width: 36,
        height: 3,
      },
    };
  }
  if (anchor === 'lock') {
    return linked(column(0));
  }
  if (anchor === 'zoomIn') {
    return linked(column(1));
  }
  if (anchor === 'zoomOut') {
    return linked(column(2));
  }
  if (anchor === 'follow') {
    return linked(column(3));
  }
  if (anchor === 'speed') {
    return linked({
      top: COLUMN_TOP + 4 * (BUTTON + GAP) + 6,
      right: COLUMN_RIGHT,
      width: 74,
      height: 92,
    });
  }
  if (anchor === 'places') {
    return {
      ring: {top: 58, left: 12, width: BUTTON, height: BUTTON},
      line: {top: 80, left: 68, width: 28, height: 3},
    };
  }
  if (anchor === 'puck') {
    const size = 72;
    return {
      ring: {top: height * 0.4, left: width / 2 - size / 2, width: size, height: size},
      line: null,
    };
  }
  const sheetBottom = Math.max(insetBottom, 12) + 84 + 16;
  if (anchor === 'go') {
    return {
      ring: {bottom: sheetBottom, right: 32, width: BUTTON, height: BUTTON},
      line: null,
    };
  }
  if (anchor === 'pin') {
    return {
      ring: {bottom: sheetBottom, right: 88, width: BUTTON, height: BUTTON},
      line: null,
    };
  }
  if (anchor === 'search') {
    return {
      ring: {bottom: sheetBottom, left: 32, right: 148, height: BUTTON},
      line: null,
    };
  }
  return {
    ring: {bottom: Math.max(insetBottom, 12), left: 20, right: 20, height: 68},
    line: null,
  };
}

function linked(ring: Box): {ring: Box; line: Box} {
  const top = (ring.top ?? 0) + (ring.height ?? BUTTON) / 2 - 1.5;
  return {
    ring,
    line: {
      top,
      right: (ring.right ?? COLUMN_RIGHT) + (ring.width ?? BUTTON) + 6,
      width: 28,
      height: 3,
    },
  };
}

function cardFor(anchor: Anchor, frame: {ring: Box}, width: number, height: number, insetBottom: number): Box {
  if (anchor === 'places') {
    return {top: 58, left: 108, width: Math.min(280, width - 124)};
  }
  if (anchor === 'puck') {
    return {top: Math.max(88, height * 0.4 - 230), left: 24, right: 24};
  }
  if (anchor === 'search' || anchor === 'pin' || anchor === 'go' || anchor === 'tabs') {
    return {
      left: 16,
      right: 16,
      top: Math.max(72, height - dockClearance(insetBottom) - 260),
    };
  }
  const top = Math.max(72, (frame.ring.top ?? COLUMN_TOP) - 8);
  return {top, left: 16, right: 96};
}

function dockClearance(insetBottom: number): number {
  return Math.max(insetBottom, 12) + 268;
}

const styles = StyleSheet.create({
  fill: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(22, 18, 32, 0.28)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#14A3A0',
    borderRadius: 28,
    backgroundColor: 'rgba(20, 163, 160, 0.08)',
  },
  line: {
    position: 'absolute',
    backgroundColor: '#14A3A0',
    borderRadius: 2,
  },
  card: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    gap: 10,
    shadowColor: '#1C1430',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 8},
  },
  tools: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
  tool: {
    borderWidth: 1,
    borderColor: '#D9D3E4',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
  },
  toolOff: {opacity: 0.35},
  toolLabel: {color: '#1C1430', fontSize: 14, fontWeight: '600'},
  kicker: {color: '#6E657F', fontSize: 13},
  body: {color: '#1C1430', fontSize: 16, lineHeight: 22, fontWeight: '500'},
  next: {
    marginTop: 4,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#14A3A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextLabel: {color: '#FFFFFF', fontSize: 17, fontWeight: '700'},
});
