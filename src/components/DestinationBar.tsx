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

import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import type {Place} from '../models/domain';
import NativeTripSession from '../native/NativeTripSession';
import {useSettingsStore} from '../store/settingsStore';
import {wantedHouse} from '../services/maps/addressQuery';
import {googleSearchOn, suggestPlaces, suggestPlacesNow} from '../services/maps/Geocoder';
import {googleResolve, hasCoordinates} from '../services/maps/googlePlaces';
import {searchHousesOnStreet} from '../services/maps/houses';
import {placeFromClipboard} from '../services/maps/clipboardPlace';
import {searchEmptyHint, searchLiveHint, searchScope} from '../services/maps/searchScope';
import {asPlace, matchesHistory, type HistoryPlace} from '../services/search/searchHistory';
import {useSearchHistoryStore} from '../store/searchHistoryStore';
import {dictate, stopDictation} from '../services/navigation/dictate';
import {stopManeuverSpeech} from '../services/navigation/speakCue';
import {useMapStore} from '../store/mapStore';
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

export const DestinationBar = memo(function DestinationBar({
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
  const [clip, setClip] = useState<Place | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef('');
  const listenToken = useRef(0);
  const chooseToken = useRef(0);

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
  const recents = useSearchHistoryStore(state => state.items);
  const here = latitude != null && longitude != null ? {latitude, longitude} : null;
  const shownRecents = recents.filter(item => matchesHistory(item, query));

  const adoptClipboard = (value: string) => {
    const place = placeFromClipboard(value);
    setClip(place);
    return place;
  };

  const lookup = (value: string) => {
    asked.current = value;
    setQuery(value);
    adoptClipboard(value);
    const typed = value.trim().length >= 2;
    if (!typed) {
      setResults([]);
    } else {
      setResults(suggestPlacesNow(value));
    }
    setEmpty(false);
    if (pending.current) {
      clearTimeout(pending.current);
    }
    if (!typed) {
      return;
    }
    pending.current = setTimeout(() => {
      runLookup(value).catch(() => undefined);
    }, googleSearchOn() ? 90 : 0);
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
    if (place.kind === 'clipboard' && !hasCoordinates(place)) {
      lookup(place.name);
      return;
    }
    if (place.kind === 'street' && !wantedHouse(query)) {
      const houses = searchHousesOnStreet(place.name);
      if (houses.length > 0) {
        const next = `${place.name} `;
        setQuery(next);
        asked.current = next;
        setResults(houses);
        setEmpty(false);
        setClip(null);
        return;
      }
    }
    // The street name appears in the bar at once. The route follows when the point arrives.
    setQuery(place.name);
    setResults([]);
    setEmpty(false);
    setClip(null);
    setOpen(false);
    onSearchClose();
    chooseToken.current += 1;
    if (!place.placeId || hasCoordinates(place)) {
      onTarget(place);
      return;
    }
    const token = chooseToken.current;
    googleResolve(place.placeId, resolveLanguage(useSettingsStore.getState().language))
      .then(point => {
        if (chooseToken.current === token) {
          onTarget({...place, ...point});
        }
      })
      .catch(() => {
        if (chooseToken.current === token) {
          useUiStore.getState().showToast(uiCopy(useSettingsStore.getState().language).searchFailed);
        }
      });
  };

  const openSearch = () => {
    setOpen(true);
    onFocus();
    NativeTripSession?.clipboardText?.()
      ?.then(text => {
        if (text) {
          adoptClipboard(text);
        }
      })
      .catch(() => undefined);
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    setOpen(false);
    setResults([]);
    setEmpty(false);
    setClip(null);
    onSearchClose();
  };

  const pinStyle = {
    backgroundColor: picking ? colors.accent : colors.surface,
    borderColor: picking ? colors.accent : colors.border,
  };
  const goStyle = {
    backgroundColor: target ? colors.accent : colors.accentSoft,
    borderColor: 'transparent',
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.where}
          onPress={openSearch}
          style={[styles.fieldShell, styles.opener, {backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1}]}>
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
          <MapPin color={picking ? colors.onAccent : colors.accent} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.destGo}
          disabled={!target}
          onPress={onGo}
          style={[styles.iconButton, goStyle]}>
          <GoArrow color={target ? colors.onAccent : colors.textMuted} />
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
        recents={shownRecents}
        clip={clip}
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
});

function SearchSheet({
  open,
  query,
  results,
  recents,
  clip,
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
  recents: HistoryPlace[];
  clip: Place | null;
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
  const online = useMapStore(state => state.online);
  const regions = useMapStore(state => state.regions);
  const scope = searchScope(here?.latitude ?? null, here?.longitude ?? null, online);
  const liveHint = searchLiveHint(scope, copy);
  const emptyHint = searchEmptyHint(scope, copy);
  const room = Math.max(220, screenHeight - keyboard - Math.max(topInset, 12) - 8);
  const clipShown =
    clip != null &&
    !results.some(place => sameShownPlace(place, clip)) &&
    !recents.some(item => sameShown(item, clip));
  void regions;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.backdrop, {backgroundColor: colors.scrim}]} />
        <View
          style={[
            styles.sheet,
            {
              height: room,
              marginBottom: keyboard,
              paddingBottom: keyboard > 0 ? 12 : Math.max(bottomInset, 12),
              backgroundColor: colors.backgroundRaised,
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
              <Text style={[styles.backMark, {color: colors.textPrimary}]}>{'‹'}</Text>
            </Pressable>
            <View style={[styles.fieldShell, styles.sheetField, {backgroundColor: colors.surface, borderColor: colors.border}]}>
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
          {liveHint ? (
            <Text style={[type.caption, {color: colors.textSecondary}]}>{liveHint}</Text>
          ) : null}
          {results.length > 0 ? (
            <Text style={[type.caption, styles.recentLabel, {color: colors.textMuted}]}>
              {results.some(place => place.kind === 'house') ? copy.searchPickHouse : copy.searchPickStreet}
            </Text>
          ) : null}
          {empty && results.length === 0 && recents.length === 0 && !clipShown ? (
            <Text style={[type.caption, {color: colors.textSecondary}]}>{emptyHint}</Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="always" style={styles.results} contentContainerStyle={styles.resultsContent}>
            {clipShown && clip ? (
              <>
                <Text style={[type.caption, styles.recentLabel, {color: colors.textMuted}]}>{copy.clipboardJust}</Text>
                <HistoryRow place={clip} here={here} onChoose={onChoose} />
              </>
            ) : null}
            {recents.length > 0 ? (
              <Text style={[type.caption, styles.recentLabel, {color: colors.textMuted}]}>{copy.recentSearches}</Text>
            ) : null}
            {recents.map(item => (
              <HistoryRow
                key={`recent-${item.id}`}
                place={asPlace(item)}
                here={here}
                onChoose={onChoose}
              />
            ))}
            {results
              .filter(place => !recents.some(item => sameShown(item, place)))
              .map(place => (
                <HistoryRow key={place.id} place={place} here={here} onChoose={onChoose} />
              ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function HistoryRow({
  place,
  here,
  onChoose,
}: {
  place: Place;
  here: {latitude: number; longitude: number} | null;
  onChoose: (place: Place) => void;
}) {
  const {colors} = useTheme();
  const away =
    place.distanceM != null
      ? place.distanceM
      : here && hasCoordinates(place)
        ? haversineMeters(here.latitude, here.longitude, place.latitude, place.longitude)
        : null;
  return (
    <Pressable accessibilityRole="button" onPressIn={() => onChoose(place)} style={styles.hit}>
      <View style={styles.hitCopy}>
        <Text numberOfLines={1} style={[type.bodyStrong, styles.hitName, {color: colors.textPrimary}]}>
          {place.name}
        </Text>
        {place.detail ? (
          <Text numberOfLines={1} style={[type.caption, {color: colors.textMuted}]}>
            {place.detail}
          </Text>
        ) : null}
      </View>
      {away != null ? (
        <Text style={[type.caption, styles.away, {color: colors.textMuted}]}>{formatDistance(away)}</Text>
      ) : null}
    </Pressable>
  );
}

function sameShown(item: HistoryPlace, place: Place): boolean {
  if (item.id === place.id) {
    return true;
  }
  if (!hasCoordinates(place)) {
    return item.name.trim().toLowerCase() === place.name.trim().toLowerCase();
  }
  return haversineMeters(item.latitude, item.longitude, place.latitude, place.longitude) < 40;
}

function sameShownPlace(left: Place, right: Place): boolean {
  if (left.id === right.id) {
    return true;
  }
  if (!hasCoordinates(left) || !hasCoordinates(right)) {
    return left.name.trim().toLowerCase() === right.name.trim().toLowerCase();
  }
  return haversineMeters(left.latitude, left.longitude, right.latitude, right.longitude) < 40;
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
  recentLabel: {fontWeight: '700', marginTop: 4, marginBottom: 2},
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
  backdrop: {...StyleSheet.absoluteFill, backgroundColor: 'transparent'},
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  sheetHandle: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4},
  sheetRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  sheetField: {borderWidth: 1},
  back: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  backMark: {fontSize: 32, lineHeight: 34, marginTop: -4},
  hitName: {fontWeight: '700'},
  clear: {fontSize: 22, lineHeight: 24, fontWeight: '500'},
  clearHit: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
});
