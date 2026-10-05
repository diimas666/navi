import {useEffect, useMemo, useRef, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {CompositeScreenProps} from '@react-navigation/native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {TripCard} from '../components/TripCard';
import {settingsColors} from '../components/settings/SettingsChrome';
import {uiCopy} from '../i18n/uiCopy';
import {resolveLanguage} from '../i18n/settingsCopy';
import type {MainTabParamList, RootStackParamList} from '../navigation/types';
import {saveTrips} from '../services/trips/TripRepository';
import {enrichTrip, looksLikeAddress, preferPlace, reversePlace} from '../services/trips/tripPlace';
import {tripInSpan, type TripSpan} from '../services/trips/tripSpan';
import {useSettingsStore} from '../store/settingsStore';
import {useTripStore} from '../store/tripStore';
import {type} from '../theme/typography';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Trips'>,
  NativeStackScreenProps<RootStackParamList>
>;

const SPANS: TripSpan[] = ['all', 'today', 'week', 'month'];

export function TripsScreen({navigation}: Props) {
  const trips = useTripStore(state => state.trips);
  const language = useSettingsStore(state => state.language);
  const copy = uiCopy(language);
  const [span, setSpan] = useState<TripSpan>('all');
  const [menu, setMenu] = useState(false);
  const tried = useRef(new Set<string>());
  const described = useMemo(() => trips.map(enrichTrip), [trips]);
  const visible = described
    .filter(trip => tripInSpan(trip.startedAt, span, Date.now()))
    .sort((left, right) => right.startedAt - left.startedAt);
  const labels: Record<TripSpan, string> = {
    all: copy.tripAll,
    today: copy.tripToday,
    week: copy.tripWeek,
    month: copy.tripMonth,
  };

  useEffect(() => {
    const pending = trips.filter(trip => !tried.current.has(trip.id)).slice(0, 4);
    if (pending.length === 0) {
      return;
    }
    const lang = resolveLanguage(language);
    pending.forEach(trip => tried.current.add(trip.id));
    let alive = true;
    Promise.all(pending.map(trip => nameEnds(trip, lang)))
      .then(named => {
        if (!alive) {
          pending.forEach(trip => tried.current.delete(trip.id));
          return;
        }
        const byId = new Map(named.map(trip => [trip.id, trip]));
        const current = useTripStore.getState().trips;
        let changed = false;
        const next = current.map(trip => {
          const filled = byId.get(trip.id);
          if (!filled || (filled.fromName === trip.fromName && filled.toName === trip.toName)) {
            return trip;
          }
          changed = true;
          return {...trip, fromName: filled.fromName, toName: filled.toName, roads: filled.roads};
        });
        if (!changed) {
          return;
        }
        useTripStore.getState().setTrips(next);
        saveTrips(next).catch(() => undefined);
      })
      .catch(() => {
        pending.forEach(trip => tried.current.delete(trip.id));
      });
    return () => {
      alive = false;
    };
  }, [trips, language]);

  const remove = (id: string) => {
    const next = useTripStore.getState().trips.filter(trip => trip.id !== id);
    useTripStore.getState().setTrips(next);
    saveTrips(next).catch(() => undefined);
  };

  return (
    <SafeAreaView style={styles.screen}>
      {menu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.cancel}
          onPress={() => setMenu(false)}
          style={styles.scrim}
        />
      ) : null}
      <View style={styles.top}>
        <View style={styles.topSide} />
        <Text style={styles.header}>{copy.tabTrips}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.tripFilter}
          onPress={() => setMenu(open => !open)}
          style={styles.topSide}>
          <FilterGlyph active={span !== 'all'} />
        </Pressable>
      </View>
      {menu ? (
        <View style={styles.menuWrap}>
          <View style={styles.menu}>
            {SPANS.map((item, index) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                onPress={() => {
                  setSpan(item);
                  setMenu(false);
                }}
                style={[
                  span === item ? styles.menuOn : styles.menuRow,
                  index === 0 ? styles.menuFirst : null,
                  index === SPANS.length - 1 ? styles.menuLast : null,
                ]}>
                <Text style={span === item ? styles.menuOnText : styles.menuText}>{labels[item]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={item => item.id}
        onScrollBeginDrag={() => setMenu(false)}
        contentContainerStyle={visible.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.clock}>
              <View style={styles.hand} />
            </View>
            <Text style={styles.emptyTitle}>{trips.length === 0 ? copy.tripsEmpty : copy.tripEmptySpan}</Text>
            {trips.length === 0 ? <Text style={styles.emptyBody}>{copy.tripsEmptyBody}</Text> : null}
          </View>
        }
        renderItem={({item}) => (
          <TripCard
            trip={item}
            fromLabel={copy.tripFrom}
            toLabel={copy.tripTo}
            pointLabel={copy.mapPoint}
            deleteLabel={copy.tripDelete}
            onPress={() => navigation.navigate('TripDetail', {tripId: item.id})}
            onDelete={() => remove(item.id)}
          />
        )}
      />
    </SafeAreaView>
  );
}

async function nameEnds(
  trip: ReturnType<typeof enrichTrip>,
  language: 'uk' | 'ru',
): Promise<ReturnType<typeof enrichTrip>> {
  const start = trip.track[0];
  const end = trip.track[trip.track.length - 1];
  const fromRemote =
    start && !looksLikeAddress(trip.fromName) ? await reversePlace(start.latitude, start.longitude, language) : '';
  const toRemote =
    end && !looksLikeAddress(trip.toName) ? await reversePlace(end.latitude, end.longitude, language) : '';
  return {
    ...trip,
    fromName: preferPlace(trip.fromName, fromRemote),
    toName: preferPlace(trip.toName, toRemote),
  };
}

function FilterGlyph({active}: {active: boolean}) {
  const color = active ? settingsColors.link : settingsColors.ink;
  return (
    <View style={styles.glyph}>
      <View style={[styles.glyphLine, styles.glyphWide, {backgroundColor: color}]} />
      <View style={[styles.glyphLine, styles.glyphMid, {backgroundColor: color}]} />
      <View style={[styles.glyphLine, styles.glyphNarrow, {backgroundColor: color}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#FFFFFF'},
  top: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, zIndex: 5},
  topSide: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  header: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: settingsColors.ink,
  },
  glyph: {width: 18, gap: 3, alignItems: 'center'},
  glyphLine: {height: 2, borderRadius: 1},
  glyphWide: {width: 18},
  glyphMid: {width: 12},
  glyphNarrow: {width: 6},
  scrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 3,
  },
  menuWrap: {
    position: 'absolute',
    top: 52,
    right: 16,
    zIndex: 4,
    width: 168,
    borderRadius: 16,
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
  },
  menu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  menuRow: {paddingHorizontal: 16, paddingVertical: 10},
  menuOn: {paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F3EEFF'},
  menuFirst: {borderTopLeftRadius: 10, borderTopRightRadius: 10},
  menuLast: {borderBottomLeftRadius: 10, borderBottomRightRadius: 10},
  menuText: {fontSize: 16, fontWeight: '600', color: settingsColors.ink},
  menuOnText: {fontSize: 16, fontWeight: '700', color: settingsColors.link},
  list: {paddingHorizontal: 16, gap: 10, paddingBottom: 120},
  emptyList: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80},
  empty: {alignItems: 'center', gap: 10},
  clock: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: '#8E8E93',
    alignItems: 'center',
    marginBottom: 8,
  },
  hand: {
    width: 2,
    height: 16,
    backgroundColor: '#8E8E93',
    marginTop: 10,
  },
  emptyTitle: {...type.headline, color: settingsColors.ink, textAlign: 'center'},
  emptyBody: {...type.body, color: settingsColors.muted, textAlign: 'center'},
});
