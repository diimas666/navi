import {Pressable, StyleSheet, Text, View} from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import type {TripRecord} from '../models/domain';
import {settingsColors} from './settings/SettingsChrome';
import {formatClock, formatDate, formatDistance} from '../utils/format';

type Props = {
  trip: TripRecord;
  fromLabel: string;
  toLabel: string;
  pointLabel: string;
  deleteLabel: string;
  onPress: () => void;
  onDelete: () => void;
};

export function TripCard({trip, fromLabel, toLabel, pointLabel, deleteLabel, onPress, onDelete}: Props) {
  const from = trip.fromName || pointLabel;
  const to = trip.toName || pointLabel;
  return (
    <Swipeable
      overshootRight={false}
      friction={1}
      containerStyle={styles.swipe}
      renderRightActions={() => (
        <Pressable accessibilityRole="button" onPress={onDelete} style={styles.delete}>
          <Text style={styles.deleteLabel}>{deleteLabel}</Text>
        </Pressable>
      )}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.when}>{`${formatDate(trip.startedAt)} · ${formatClock(trip.startedAt)}`}</Text>
          <Text style={styles.km}>{formatDistance(trip.distanceM)}</Text>
        </View>
        <PlaceLine mark={fromLabel} name={from} />
        <PlaceLine mark={toLabel} name={to} />
      </Pressable>
    </Swipeable>
  );
}

function PlaceLine({mark, name}: {mark: string; name: string}) {
  return (
    <View style={styles.place}>
      <Text style={styles.mark}>{mark}</Text>
      <Text numberOfLines={1} style={styles.placeName}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  swipe: {borderRadius: 16, overflow: 'hidden'},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  when: {flex: 1, fontSize: 15, fontWeight: '700', color: settingsColors.ink},
  km: {fontSize: 15, fontWeight: '700', color: settingsColors.link},
  place: {flexDirection: 'row', alignItems: 'center', gap: 8},
  mark: {
    width: 22,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: settingsColors.link,
  },
  placeName: {flex: 1, fontSize: 14, fontWeight: '500', color: settingsColors.ink},
  delete: {
    width: 96,
    marginLeft: 8,
    borderRadius: 16,
    backgroundColor: settingsColors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {color: '#FFFFFF', fontSize: 14, fontWeight: '700'},
});
