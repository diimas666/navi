import {useRef} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {NaviMap} from '../components/NaviMap';
import {uiCopy} from '../i18n/uiCopy';
import type {RootStackParamList} from '../navigation/types';
import {enrichTrip} from '../services/trips/tripPlace';
import {useSettingsStore} from '../store/settingsStore';
import {useTripStore} from '../store/tripStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';
import {formatClock, formatDate, formatDistance, formatSpeed, formatTravel, speedUnitLabel} from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;

export function TripDetailScreen({route}: Props) {
  const {colors} = useTheme();
  const stored = useTripStore(state => state.trips.find(item => item.id === route.params.tripId));
  const copy = uiCopy(useSettingsStore(state => state.language));
  const zoomRef = useRef(13);
  if (!stored) {
    return (
      <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
        <Text style={[type.body, {color: colors.textSecondary}]}>{copy.tripMissing}</Text>
      </SafeAreaView>
    );
  }
  const trip = enrichTrip(stored);
  const start = trip.track[0];
  const end = trip.track[trip.track.length - 1];
  const line = {
    distanceM: trip.distanceM,
    durationS: trip.durationS,
    steps: [],
    coordinates: trip.track.map(point => [point.longitude, point.latitude] as [number, number]),
  };
  const sameDay = new Date(trip.startedAt).toDateString() === new Date(trip.endedAt).toDateString();
  const when = sameDay
    ? `${formatDate(trip.startedAt)} · ${formatClock(trip.startedAt)} – ${formatClock(trip.endedAt)}`
    : `${formatDate(trip.startedAt)} ${formatClock(trip.startedAt)} – ${formatDate(trip.endedAt)} ${formatClock(trip.endedAt)}`;
  const roads = trip.roads ?? [];
  return (
    <View style={styles.fill}>
      <NaviMap
        latitude={start?.latitude ?? 50.45}
        longitude={start?.longitude ?? 30.52}
        heading={0}
        follow={false}
        gpsAccuracy={null}
        uncertainty={null}
        showUncertainty={false}
        route={line}
        zoomRef={zoomRef}
        zoomToken={0}
        fitToken={1}
        destination={end ? {latitude: end.latitude, longitude: end.longitude} : null}
        destinationPin={end != null}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.card, {backgroundColor: colors.glass}]}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            <Text style={[type.headline, {color: colors.textPrimary}]}>{formatDistance(trip.distanceM)}</Text>
            <Text style={[type.body, {color: colors.textPrimary}]}>{when}</Text>
            <Text style={[type.caption, {color: colors.textSecondary}]}>
              {`${formatTravel(trip.durationS, copy.hours, copy.minutes)} · ${copy.maxSpeed} ${formatSpeed(trip.maxSpeedMps)} ${speedUnitLabel()}`}
            </Text>
            <PlaceRow mark={copy.tripFrom} name={trip.fromName || copy.mapPoint} ink={colors.textPrimary} accent={colors.accent} />
            <Text style={[type.caption, {color: colors.textMuted}]}>{copy.tripRoads}</Text>
            {roads.length === 0 ? (
              <Text style={[type.body, {color: colors.textSecondary}]}>{copy.tripRoadUnknown}</Text>
            ) : (
              roads.map((road, index) => (
                <Text key={`${road}-${index}`} style={[type.body, {color: colors.textPrimary}]}>
                  {road}
                </Text>
              ))
            )}
            <PlaceRow mark={copy.tripTo} name={trip.toName || copy.mapPoint} ink={colors.textPrimary} accent={colors.accent} />
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

function PlaceRow({mark, name, ink, accent}: {mark: string; name: string; ink: string; accent: string}) {
  return (
    <View style={styles.place}>
      <Text style={[styles.mark, {color: accent}]}>{mark}</Text>
      <Text style={[styles.placeName, {color: ink}]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  screen: {flex: 1, padding: 20},
  overlay: {position: 'absolute', left: 16, right: 16, bottom: 16},
  card: {borderRadius: 18, maxHeight: 320, paddingHorizontal: 16, paddingVertical: 14},
  scroll: {flexGrow: 0},
  scrollBody: {gap: 6},
  place: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4},
  mark: {width: 22, fontSize: 15, fontWeight: '800'},
  placeName: {flex: 1, fontSize: 16, fontWeight: '600'},
});
