import {useEffect, useRef, useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {RoutePlan} from '../models/domain';
import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import {fetchAlongPlaces, type AlongKind, type AlongPlace} from '../services/navigation/alongRoute';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {formatDistance} from '../utils/format';

const KINDS: AlongKind[] = ['gas', 'parking', 'food', 'post'];

type Props = {
  open: boolean;
  route: RoutePlan;
  here: {latitude: number; longitude: number};
  nearDest?: boolean;
  onClose: () => void;
  onChoose: (place: AlongPlace) => void;
};

export function AlongSheet({open, route, here, nearDest = false, onClose, onChoose}: Props) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const language = resolveLanguage(useSettingsStore(state => state.language));
  const copy = uiCopy(language);
  const labels: Record<AlongKind, string> = {
    gas: copy.alongGas,
    parking: copy.alongParking,
    food: copy.alongFood,
    post: copy.alongPost,
  };
  const [kind, setKind] = useState<AlongKind>('gas');
  const [parkingTitle, setParkingTitle] = useState(false);
  const [rows, setRows] = useState<AlongPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const frozen = useRef<{route: RoutePlan; here: {latitude: number; longitude: number}} | null>(null);
  const cache = useRef<Partial<Record<AlongKind, AlongPlace[]>>>({});

  useEffect(() => {
    if (!open) {
      frozen.current = null;
      cache.current = {};
      setRows([]);
      setBusy(false);
      return;
    }
    frozen.current = {route, here};
    setParkingTitle(nearDest);
    setKind(nearDest ? 'parking' : 'gas');
    // Snapshot the route once. GPS ticks must not refetch or the sheet flashes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const snap = frozen.current;
    if (!snap) {
      return;
    }
    const known = cache.current[kind];
    if (known) {
      setRows(known);
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    fetchAlongPlaces(snap.route, kind, snap.here, language)
      .then(places => {
        if (!alive) {
          return;
        }
        cache.current[kind] = places;
        setRows(places);
      })
      .catch(() => {
        if (alive) {
          setRows([]);
        }
      })
      .finally(() => {
        if (alive) {
          setBusy(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [kind, language, open]);

  return (
    <Modal transparent visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.scrim, {backgroundColor: colors.scrim}]} />
        <View style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, 12) + 8, backgroundColor: colors.backgroundRaised}]}>
          <View style={[styles.handle, {backgroundColor: colors.border}]} />
          <Text style={[styles.title, {color: colors.textPrimary}]}>{parkingTitle ? copy.parkingNear : copy.alongRoute}</Text>
          <View style={styles.kinds}>
            {KINDS.map(item => (
              <Pressable
                key={item}
                accessibilityRole="button"
                onPress={() => setKind(item)}
                style={[styles.chip, {backgroundColor: kind === item ? colors.accentSoft : colors.surfaceMuted}]}>
                <Text style={[styles.chipLabel, {color: kind === item ? colors.accent : colors.textSecondary}]}>{labels[item]}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="always">
            {busy && rows.length === 0 ? (
              <Text style={[styles.empty, {color: colors.textSecondary}]}>{copy.locating}</Text>
            ) : null}
            {!busy && rows.length === 0 ? (
              <Text style={[styles.empty, {color: colors.textSecondary}]}>{copy.alongEmpty}</Text>
            ) : null}
            {rows.map(place => (
              <Pressable
                key={place.id}
                accessibilityRole="button"
                onPress={() => onChoose(place)}
                style={styles.row}>
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={[styles.name, {color: colors.textPrimary}]}>
                    {place.name}
                  </Text>
                  <Text style={[styles.meta, {color: colors.textSecondary}]}>{copy.alongAdd}</Text>
                </View>
                {place.distanceM != null ? (
                  <Text style={[styles.away, {color: colors.textSecondary}]}>{formatDistance(place.distanceM)}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1, justifyContent: 'flex-end'},
  scrim: {...StyleSheet.absoluteFill},
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '72%',
    gap: 12,
  },
  handle: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4},
  title: {fontSize: 22, fontWeight: '800'},
  kinds: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8},
  chipLabel: {fontSize: 14, fontWeight: '700'},
  list: {maxHeight: 360},
  empty: {fontSize: 15, fontWeight: '600', paddingVertical: 16},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  rowCopy: {flex: 1, gap: 2},
  name: {fontSize: 16, fontWeight: '700'},
  meta: {fontSize: 13, fontWeight: '600'},
  away: {fontSize: 13, fontWeight: '700'},
});
