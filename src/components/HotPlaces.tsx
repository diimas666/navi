import {memo, useEffect, useRef, useState} from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  SAVED_PLACE_KINDS,
  savedPlacePrompt,
  savedPlaceTitle,
  type ExtraPlace,
  type SavedPlaceKind,
} from '../constants/places';
import {resolveLanguage} from '../i18n/settingsCopy';
import type {Place} from '../models/domain';
import {searchPlaces, searchPlacesOnline} from '../services/maps/Geocoder';
import {startTripTo} from '../services/navigation/startTrip';
import {usePlacesStore} from '../store/placesStore';
import {useSettingsStore} from '../store/settingsStore';
import {useUiStore} from '../store/uiStore';
import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

const EXTRA_LIMIT = 12;

const copy = {
  uk: {
    menu: 'Гарячі адреси',
    hint: 'Зберігаються на телефоні. Торкніться, щоб побудувати маршрут.',
    change: 'Змінити',
    set: 'Вказати',
    add: 'Додати адресу',
    addHint: 'Своя назва і точка',
    newTitle: 'Нова адреса',
    namePh: 'Назва, наприклад Дача',
    pick: 'Оберіть адресу зі списку. Вона лишиться на телефоні.',
    empty: 'Нічого не знайдено. Спробуйте місто або вулицю.',
    remove: 'Прибрати адресу',
    close: 'Закрити',
    full: 'Своїх адрес можна зберегти не більше дванадцяти.',
    label: 'Гарячі адреси',
  },
  ru: {
    menu: 'Быстрые адреса',
    hint: 'Хранятся на телефоне. Нажмите, чтобы построить маршрут.',
    change: 'Изменить',
    set: 'Указать',
    add: 'Добавить адрес',
    addHint: 'Своё название и точка',
    newTitle: 'Новый адрес',
    namePh: 'Название, например Дача',
    pick: 'Выберите адрес из списка. Он останется на телефоне.',
    empty: 'Ничего не найдено. Попробуйте город или улицу.',
    remove: 'Убрать адрес',
    close: 'Закрыть',
    full: 'Своих адресов можно сохранить не больше двенадцати.',
    label: 'Быстрые адреса',
  },
};

type Editor =
  | {mode: 'preset'; kind: SavedPlaceKind}
  | {mode: 'create'}
  | {mode: 'edit'; place: ExtraPlace};

export const HotPlaces = memo(function HotPlaces() {
  const {colors} = useTheme();
  const language = resolveLanguage(useSettingsStore(state => state.language));
  const text = copy[language];
  const places = usePlacesStore(state => state.places);
  const extra = usePlacesStore(state => state.extra);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editor | null>(null);

  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  const go = (saved: {id: string; name: string; latitude: number; longitude: number; kind: string}) => {
    startTripTo(saved)
      .then(result => {
        if (result === 'ok' || result === 'denied' || result === 'failed') {
          close();
        }
      })
      .catch(() => undefined);
  };

  const add = () => {
    if (extra.length >= EXTRA_LIMIT) {
      useUiStore.getState().showToast(text.full);
      return;
    }
    setEditing({mode: 'create'});
  };

  return (
    <>
      {open ? <Pressable accessibilityRole="button" onPress={close} style={styles.backdrop} /> : null}
      <View style={styles.anchor} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text.label}
          onPress={() => (open ? close() : setOpen(true))}
          style={[styles.dots, {backgroundColor: colors.glass}]}>
          <Text style={[styles.dotsLabel, {color: colors.textPrimary}]}>⋯</Text>
        </Pressable>
        {open ? (
          <View style={[styles.panel, {backgroundColor: colors.surface}]}>
            <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{text.menu}</Text>
            <Text style={[type.caption, {color: colors.textSecondary}]}>{text.hint}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
              {SAVED_PLACE_KINDS.map(item => {
                const saved = places[item.id];
                const title = savedPlaceTitle(item.id, language);
                return (
                  <PlaceRow
                    key={item.id}
                    title={title}
                    subtitle={saved ? saved.name : savedPlacePrompt(item.id, language)}
                    kind={item.id}
                    letter={null}
                    action={saved ? text.change : text.set}
                    onOpen={() =>
                      saved
                        ? go({
                            id: saved.kind,
                            name: saved.name,
                            latitude: saved.latitude,
                            longitude: saved.longitude,
                            kind: saved.kind,
                          })
                        : setEditing({mode: 'preset', kind: item.id})
                    }
                    onEdit={() => setEditing({mode: 'preset', kind: item.id})}
                  />
                );
              })}
              {extra.map(item => (
                <PlaceRow
                  key={item.id}
                  title={item.title}
                  subtitle={item.name}
                  kind="custom"
                  letter={initial(item.title)}
                  action={text.change}
                  onOpen={() =>
                    go({
                      id: item.id,
                      name: item.name,
                      latitude: item.latitude,
                      longitude: item.longitude,
                      kind: 'custom',
                    })
                  }
                  onEdit={() => setEditing({mode: 'edit', place: item})}
                />
              ))}
              <Pressable accessibilityRole="button" onPress={add} style={styles.block}>
                <View style={styles.row}>
                  <View style={[styles.markPlate, {backgroundColor: colors.accentSoft}]}>
                    <PlusMark color={colors.accent} />
                  </View>
                  <View style={styles.copy}>
                    <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{text.add}</Text>
                    <Text style={[type.caption, {color: colors.textSecondary}]}>{text.addHint}</Text>
                  </View>
                </View>
              </Pressable>
            </ScrollView>
          </View>
        ) : null}
      </View>
      <AddressSheet editor={editing} onClose={() => setEditing(null)} />
    </>
  );
});

function PlaceRow({
  title,
  subtitle,
  kind,
  letter,
  action,
  onOpen,
  onEdit,
}: {
  title: string;
  subtitle: string;
  kind: SavedPlaceKind | 'custom';
  letter: string | null;
  action: string;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const {colors} = useTheme();
  return (
    <View style={styles.block}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.row}>
        <View style={[styles.markPlate, {backgroundColor: colors.accentSoft}]}>
          <PlaceMark kind={kind} letter={letter} color={colors.accent} cutout={colors.surface} />
        </View>
        <View style={styles.copy}>
          <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{title}</Text>
          <Text numberOfLines={1} style={[type.caption, {color: colors.textSecondary}]}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}>
        <Text style={[type.caption, {color: colors.accent}]}>{action}</Text>
      </Pressable>
    </View>
  );
}

function AddressSheet({editor, onClose}: {editor: Editor | null; onClose: () => void}) {
  const {colors} = useTheme();
  const language = resolveLanguage(useSettingsStore(state => state.language));
  const text = copy[language];
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const places = usePlacesStore(state => state.places);
  const preset = editor?.mode === 'preset' ? places[editor.kind] : undefined;
  const current = editor?.mode === 'edit' ? editor.place : preset;
  const [label, setLabel] = useState(editor?.mode === 'edit' ? editor.place.title : '');
  const [query, setQuery] = useState(current?.name ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [keyboard, setKeyboard] = useState(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editor?.mode === 'edit') {
      setLabel(editor.place.title);
      setQuery(editor.place.name);
    } else if (editor?.mode === 'preset') {
      setLabel('');
      setQuery(places[editor.kind]?.name ?? '');
    } else {
      setLabel('');
      setQuery('');
    }
    setResults([]);
  }, [editor, places]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', event => {
      setKeyboard(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const lookup = async (value: string) => {
    setQuery(value);
    const local = searchPlaces(value);
    if (value.trim().length < 3) {
      setResults(local);
      return;
    }
    try {
      const remote = await searchPlacesOnline(value);
      const seen = new Set(remote.map(place => place.id));
      setResults([...remote, ...local.filter(place => !seen.has(place.id))].slice(0, 6));
    } catch {
      setResults(local);
    }
  };

  const save = (place: Place) => {
    if (!editor) {
      return;
    }
    Keyboard.dismiss();
    if (editor.mode === 'preset') {
      usePlacesStore.getState().setPlace({
        kind: editor.kind,
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    } else {
      const title = (label.trim() || place.name).slice(0, 24);
      const id = editor.mode === 'edit' ? editor.place.id : `e${Date.now().toString(36)}`;
      usePlacesStore.getState().setExtra({
        id,
        title,
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    }
    onClose();
  };

  const dismiss = () => {
    Keyboard.dismiss();
    onClose();
  };
  const heading = sheetHeading(editor, language, text.newTitle);
  const placeholder =
    editor?.mode === 'preset' ? savedPlacePrompt(editor.kind, language) : text.namePh;
  const sheetStyle = {
    backgroundColor: colors.background,
    marginBottom: keyboard,
    maxHeight: height - keyboard - Math.max(insets.top, 24) - 12,
    paddingBottom: keyboard > 0 ? 16 : Math.max(insets.bottom, 16),
  };
  const fieldStyle = {
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };

  return (
    <Modal visible={editor != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable accessibilityRole="button" onPressIn={dismiss} style={styles.modalBackdrop} />
        <View style={[styles.sheet, sheetStyle]}>
          <View style={[styles.handle, {backgroundColor: colors.border}]} />
          <View style={styles.sheetHead}>
            <View style={styles.sheetTitle}>
              <Text style={[type.title, {color: colors.textPrimary}]}>{heading}</Text>
              <Text style={[type.caption, {color: colors.textSecondary}]}>{text.pick}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text.close}
              hitSlop={12}
              onPressIn={dismiss}
              style={styles.close}>
              <View style={[styles.closeBar, styles.closeBarA]} />
              <View style={[styles.closeBar, styles.closeBarB]} />
            </Pressable>
          </View>
          {editor?.mode === 'preset' ? null : (
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder={text.namePh}
              placeholderTextColor={colors.textMuted}
              maxLength={24}
              style={[styles.field, fieldStyle]}
            />
          )}
          <TextInput
            autoFocus
            value={query}
            onChangeText={value => {
              setQuery(value);
              if (pending.current) {
                clearTimeout(pending.current);
              }
              pending.current = setTimeout(() => {
                lookup(value).catch(() => undefined);
              }, 280);
            }}
            placeholder={editor?.mode === 'preset' ? placeholder : text.pick}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.field, fieldStyle]}
          />
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.results} contentContainerStyle={styles.resultsContent}>
            {results.map(place => (
              <Pressable
                key={place.id}
                accessibilityRole="button"
                onPress={() => save(place)}
                style={[styles.result, {backgroundColor: colors.surface}]}>
                <Text style={[type.bodyStrong, {color: colors.textPrimary}]}>{place.name}</Text>
              </Pressable>
            ))}
            {query.trim().length >= 2 && results.length === 0 ? (
              <Text style={[type.caption, {color: colors.textMuted}]}>{text.empty}</Text>
            ) : null}
          </ScrollView>
          {current ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (editor?.mode === 'preset') {
                  usePlacesStore.getState().removePlace(editor.kind);
                } else if (editor?.mode === 'edit') {
                  usePlacesStore.getState().removeExtra(editor.place.id);
                }
                onClose();
              }}
              style={styles.remove}>
              <Text style={[type.bodyStrong, {color: colors.danger}]}>{text.remove}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function sheetHeading(
  editor: Editor | null,
  language: ReturnType<typeof resolveLanguage>,
  fallback: string,
): string {
  if (editor?.mode === 'preset') {
    return savedPlaceTitle(editor.kind, language);
  }
  if (editor?.mode === 'edit') {
    return editor.place.title;
  }
  return fallback;
}

function initial(title: string): string {
  const trimmed = title.trim();
  return trimmed ? trimmed.charAt(0).toLocaleUpperCase() : '•';
}

function PlaceMark({
  kind,
  letter,
  color,
  cutout,
}: {
  kind: SavedPlaceKind | 'custom';
  letter: string | null;
  color: string;
  cutout: string;
}) {
  if (kind === 'home') {
    return (
      <View style={styles.house}>
        <View style={[styles.chimney, {backgroundColor: color}]} />
        <View style={[styles.roof, {borderBottomColor: color}]} />
        <View style={[styles.walls, {backgroundColor: color}]}>
          <View style={[styles.door, {backgroundColor: cutout}]} />
        </View>
      </View>
    );
  }
  if (kind === 'work') {
    return (
      <View style={styles.caseWrap}>
        <View style={[styles.caseHandle, {borderColor: color}]} />
        <View style={[styles.caseBody, {borderColor: color}]}>
          <View style={[styles.strap, {backgroundColor: color}]} />
          <View style={[styles.clasp, {backgroundColor: cutout, borderColor: color}]} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.badge, {backgroundColor: color}]}>
      <Text style={styles.badgeText}>{letter}</Text>
    </View>
  );
}

function PlusMark({color}: {color: string}) {
  return (
    <View style={styles.plus}>
      <View style={[styles.plusH, {backgroundColor: color}]} />
      <View style={[styles.plusV, {backgroundColor: color}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20,17,28,0.12)',
  },
  anchor: {
    position: 'absolute',
    top: 58,
    left: 12,
    zIndex: 4,
    width: 300,
  },
  dots: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsLabel: {fontSize: 28, lineHeight: 30, fontWeight: '700', marginTop: -6},
  panel: {
    marginTop: 10,
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
    maxHeight: 520,
  },
  scroll: {maxHeight: 420},
  block: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7},
  row: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12},
  copy: {flex: 1, gap: 2},
  markPlate: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {flex: 1, justifyContent: 'flex-end'},
  modalBackdrop: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,17,28,0.28)'},
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  handle: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2},
  sheetHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 12},
  sheetTitle: {flex: 1, gap: 4},
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E7E0F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBar: {
    position: 'absolute',
    width: 12,
    height: 1.8,
    left: 10,
    top: 15,
    borderRadius: 1,
    backgroundColor: '#1C1430',
  },
  closeBarA: {transform: [{rotate: '45deg'}]},
  closeBarB: {transform: [{rotate: '-45deg'}]},
  field: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 17,
  },
  results: {flexGrow: 0},
  resultsContent: {gap: 8, paddingBottom: 8},
  result: {borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14},
  remove: {alignItems: 'center', paddingVertical: 8},
  house: {width: 22, height: 18, alignItems: 'center'},
  chimney: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 3.5,
    height: 6,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  roof: {
    marginTop: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  walls: {
    width: 14,
    height: 9,
    marginTop: -1,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  door: {width: 4.5, height: 5, borderTopLeftRadius: 1, borderTopRightRadius: 1},
  caseWrap: {width: 22, height: 18, alignItems: 'center', justifyContent: 'flex-end'},
  caseHandle: {
    width: 8,
    height: 4.5,
    borderWidth: 1.7,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    marginBottom: -1,
  },
  caseBody: {
    width: 20,
    height: 12,
    borderWidth: 1.7,
    borderRadius: 3.5,
    alignItems: 'center',
    overflow: 'hidden',
  },
  strap: {position: 'absolute', top: 3.2, left: 0, right: 0, height: 1.6},
  clasp: {
    position: 'absolute',
    top: 1.6,
    width: 5,
    height: 4.5,
    borderRadius: 1.5,
    borderWidth: 1.4,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '700'},
  plus: {width: 16, height: 16, alignItems: 'center', justifyContent: 'center'},
  plusH: {position: 'absolute', width: 14, height: 2.2, borderRadius: 1.1},
  plusV: {position: 'absolute', width: 2.2, height: 14, borderRadius: 1.1},
});
