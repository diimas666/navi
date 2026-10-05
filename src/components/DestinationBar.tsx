import {useEffect, useRef, useState} from 'react';
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

import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import type {Place} from '../models/domain';
import NativeTripSession from '../native/NativeTripSession';
import {useSettingsStore} from '../store/settingsStore';
import {suggestPlaces, suggestPlacesNow} from '../services/maps/Geocoder';
import {dictate, stopDictation} from '../services/navigation/dictate';
import {stopManeuverSpeech} from '../services/navigation/speakCue';
import {useSessionStore} from '../store/sessionStore';
import {useUiStore} from '../store/uiStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';
import {formatDistance} from '../utils/format';
import {haversineMeters} from '../utils/geo';

type Props = {
  navigating: boolean;
  picking: boolean;
  target: Place | null;
  onPickToggle: () => void;
  onTarget: (place: Place) => void;
  onGo: () => void;
  onStop: () => void;
  onFocus: () => void;
  onSearchClose: () => void;
};

export function DestinationBar({
  navigating,
  picking,
  target,
  onPickToggle,
  onTarget,
  onGo,
  onStop,
  onFocus,
  onSearchClose,
}: Props) {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [empty, setEmpty] = useState(false);
  const [listening, setListening] = useState(false);
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef('');
  const listenToken = useRef(0);

  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();

  useEffect(() => {
    if (!target) {
      return;
    }
    setQuery(target.name);
    setResults([]);
    setEmpty(false);
  }, [target]);

  useEffect(() => {
    const show = (event: {endCoordinates: {height: number}}) => setKeyboard(event.endCoordinates.height);
    const hide = () => setKeyboard(0);
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', show),
      Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardWillHide', hide),
      Keyboard.addListener('keyboardDidHide', hide),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);

  useEffect(
    () => () => {
      listenToken.current += 1;
      stopDictation();
    },
    [],
  );

  const latitude = useSessionStore(state => state.displayLatitude);
  const longitude = useSessionStore(state => state.displayLongitude);
  const here = latitude != null && longitude != null ? {latitude, longitude} : null;

  const lookup = (value: string) => {
    asked.current = value;
    setQuery(value);
    setResults(value.trim().length >= 2 ? suggestPlacesNow(value) : []);
    setEmpty(false);
    if (pending.current) {
      clearTimeout(pending.current);
    }
    pending.current = setTimeout(() => {
      runLookup(value).catch(() => undefined);
    }, 180);
  };

  const runLookup = async (value: string) => {
    const found = await suggestPlaces(value);
    if (asked.current !== value) {
      return;
    }
    setResults(found);
    setEmpty(value.trim().length >= 2 && found.length === 0);
  };

  const onMic = () => {
    if (listening) {
      stopDictation();
      return;
    }
    const token = listenToken.current + 1;
    listenToken.current = token;
    setListening(true);
    stopManeuverSpeech();
    NativeTripSession?.stopSpeaking();
    dictate(resolveLanguage(useSettingsStore.getState().language))
      .then(text => {
        const phrase = text.replace(/[.,!?…]+$/g, '').trim();
        if (phrase && listenToken.current === token) {
          lookup(phrase);
        }
      })
      .catch((error: {message?: string}) => {
        if (listenToken.current !== token || error?.message === 'cancelled') {
          return;
        }
        const note = uiCopy(useSettingsStore.getState().language);
        const message =
          error?.message === 'denied'
            ? note.voiceDenied
            : error?.message === 'unavailable'
              ? note.voiceMissing
              : note.voiceEmpty;
        useUiStore.getState().showToast(message);
      })
      .finally(() => {
        if (listenToken.current === token) {
          setListening(false);
        }
      });
  };

  const choose = (place: Place) => {
    Keyboard.dismiss();
    setQuery(place.name);
    setResults([]);
    setEmpty(false);
    setOpen(false);
    onSearchClose();
    onTarget(place);
  };

  const openSearch = () => {
    setOpen(true);
    onFocus();
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    setOpen(false);
    setResults([]);
    setEmpty(false);
    onSearchClose();
  };

  const pinStyle = {
    backgroundColor: picking ? colors.accent : '#FFFFFF',
    borderColor: picking ? colors.accent : colors.border,
  };
  const goStyle = {
    backgroundColor: target ? colors.accent : '#E7E0F6',
    borderColor: 'transparent',
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.where}
          onPress={openSearch}
          style={[styles.fieldShell, styles.opener, {backgroundColor: colors.surfaceMuted}]}>
          <SearchGlyph color={colors.textMuted} />
          <Text numberOfLines={1} style={[styles.openerText, {color: query ? colors.textPrimary : colors.textMuted}]}>
            {query || copy.where}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.destPin}
          onPress={onPickToggle}
          style={[styles.iconButton, pinStyle]}>
          <MapPin color={picking ? '#FFFFFF' : colors.accent} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.destGo}
          disabled={!target}
          onPress={onGo}
          style={[styles.iconButton, goStyle]}>
          <GoArrow color={target ? '#FFFFFF' : '#948BA6'} />
        </Pressable>
      </View>
      {navigating ? (
        <Pressable accessibilityRole="button" onPress={onStop}>
          <Text style={[type.bodyStrong, {color: colors.danger}]}>{copy.destStop}</Text>
        </Pressable>
      ) : null}
      {picking ? (
        <Text style={[type.caption, {color: colors.textSecondary}]}>
          {target ? copy.destMove : copy.destPlace}
        </Text>
      ) : null}
      {target && query !== target.name ? (
        <Text numberOfLines={1} style={[type.caption, {color: colors.accent}]}>
          {target.name}
        </Text>
      ) : null}
      <SearchSheet
        open={open}
        query={query}
        results={results}
        empty={empty}
        listening={listening}
        keyboard={keyboard}
        screenHeight={height}
        topInset={insets.top}
        bottomInset={insets.bottom}
        here={here}
        onChange={lookup}
        onMic={onMic}
        onChoose={choose}
        onClose={closeSearch}
      />
    </View>
  );
}

function SearchSheet({
  open,
  query,
  results,
  empty,
  listening,
  keyboard,
  screenHeight,
  topInset,
  bottomInset,
  here,
  onChange,
  onMic,
  onChoose,
  onClose,
}: {
  open: boolean;
  query: string;
  results: Place[];
  empty: boolean;
  listening: boolean;
  keyboard: number;
  screenHeight: number;
  topInset: number;
  bottomInset: number;
  here: {latitude: number; longitude: number} | null;
  onChange: (value: string) => void;
  onMic: () => void;
  onChoose: (place: Place) => void;
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  const room = Math.max(220, screenHeight - keyboard - Math.max(topInset, 12) - 8);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.backdrop} />
        <View
          style={[
            styles.sheet,
            {
              height: room,
              marginBottom: keyboard,
              paddingBottom: keyboard > 0 ? 12 : Math.max(bottomInset, 12),
              backgroundColor: '#FBFAFE',
            },
          ]}>
          <View style={[styles.sheetHandle, {backgroundColor: colors.border}]} />
          <View style={styles.sheetRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.cancel}
              onPress={onClose}
              hitSlop={8}
              style={styles.back}>
              <Text style={styles.backMark}>{'‹'}</Text>
            </Pressable>
            <View style={[styles.fieldShell, styles.sheetField, {backgroundColor: '#FFFFFF'}]}>
              <SearchGlyph color={colors.textMuted} />
              {open ? (
                <TextInput
                  autoFocus
                  value={query}
                  onChangeText={onChange}
                  placeholder={copy.where}
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="search"
                  style={[styles.field, {color: colors.textPrimary}]}
                />
              ) : (
                <View style={styles.field} />
              )}
              {query.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.cancel}
                  onPressIn={() => onChange('')}
                  hitSlop={12}
                  style={styles.clearHit}>
                  <Text style={[styles.clear, {color: colors.textPrimary}]}>{'×'}</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.voice}
                onPress={onMic}
                hitSlop={8}
                style={styles.micHit}>
                <MicGlyph color={listening ? colors.accent : colors.textPrimary} />
              </Pressable>
            </View>
          </View>
          {empty && results.length === 0 ? (
            <Text style={[type.caption, {color: colors.textSecondary}]}>{copy.searchEmpty}</Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="always" style={styles.results} contentContainerStyle={styles.resultsContent}>
            {results.map(place => {
              const away = here
                ? haversineMeters(here.latitude, here.longitude, place.latitude, place.longitude)
                : null;
              return (
                <Pressable key={place.id} accessibilityRole="button" onPressIn={() => onChoose(place)} style={styles.hit}>
                  <View style={styles.hitCopy}>
                    <Text numberOfLines={1} style={[type.bodyStrong, {color: colors.textPrimary}]}>
                      {place.name}
                    </Text>
                    {place.detail ? (
                      <Text numberOfLines={1} style={[type.caption, {color: colors.textSecondary}]}>
                        {place.detail}
                      </Text>
                    ) : null}
                  </View>
                  {away != null ? (
                    <Text style={[type.caption, styles.away, {color: colors.textSecondary}]}>{formatDistance(away)}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SearchGlyph({color}: {color: string}) {
  return (
    <View style={styles.search}>
      <View style={[styles.searchRing, {borderColor: color}]} />
      <View style={[styles.searchHandle, {backgroundColor: color}]} />
    </View>
  );
}

function MicGlyph({color}: {color: string}) {
  return (
    <View style={styles.mic}>
      <View style={[styles.micHead, {borderColor: color}]} />
      <View style={[styles.micStem, {backgroundColor: color}]} />
      <View style={[styles.micBase, {backgroundColor: color}]} />
    </View>
  );
}

function MapPin({color}: {color: string}) {
  return (
    <View style={styles.pin}>
      <View style={[styles.pinHead, {borderColor: color}]}>
        <View style={[styles.pinDot, {backgroundColor: color}]} />
      </View>
      <View style={[styles.pinTip, {borderTopColor: color}]} />
    </View>
  );
}

function GoArrow({color}: {color: string}) {
  return (
    <View style={styles.go}>
      <View style={[styles.goHead, {borderBottomColor: color}]} />
      <View style={[styles.goShaft, {backgroundColor: color}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 8},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  fieldShell: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 8,
  },
  field: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  opener: {paddingRight: 14},
  openerText: {flex: 1, paddingHorizontal: 8, fontSize: 16},
  micHit: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  search: {width: 16, height: 16},
  searchRing: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.8,
  },
  searchHandle: {
    position: 'absolute',
    width: 6,
    height: 1.8,
    borderRadius: 1,
    right: 0,
    bottom: 2,
    transform: [{rotate: '45deg'}],
  },
  mic: {width: 14, height: 20, alignItems: 'center'},
  micHead: {
    width: 8,
    height: 12,
    borderRadius: 4,
    borderWidth: 1.6,
  },
  micStem: {width: 1.6, height: 3, marginTop: 1},
  micBase: {width: 8, height: 1.6, borderRadius: 1, marginTop: 1},
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: {flex: 1},
  resultsContent: {paddingBottom: 12},
  hit: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12},
  hitCopy: {flex: 1, gap: 2},
  away: {fontWeight: '700'},
  pin: {width: 18, height: 22, alignItems: 'center'},
  pinHead: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {width: 4, height: 4, borderRadius: 2},
  pinTip: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  go: {alignItems: 'center', width: 16, height: 18},
  goHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  goShaft: {width: 4, height: 8, borderRadius: 1, marginTop: -1},
  modal: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(28,20,48,0.28)'},
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  sheetHandle: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4},
  sheetRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  sheetField: {borderWidth: 1, borderColor: '#E4E0EA'},
  back: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  backMark: {color: '#1C1430', fontSize: 32, lineHeight: 34, marginTop: -4},
  clear: {fontSize: 22, lineHeight: 24, fontWeight: '500'},
  clearHit: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
});
