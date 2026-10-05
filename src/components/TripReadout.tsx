import {StyleSheet, Text, View} from 'react-native';

const CITY_LIMIT_KMH = 50;

type Props = {
  speedMps: number;
};

export function TripReadout({speedMps}: Props) {
  const kmh = speedMps * 3.6;
  const speedColor = kmh > CITY_LIMIT_KMH ? '#E23B3B' : '#2F6FE0';
  return (
    <View style={styles.card}>
      <Text style={[styles.speed, {color: speedColor}]}>{String(Math.round(kmh))}</Text>
      <Text style={styles.unit}>км/год</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    right: 14,
    bottom: 188,
    width: 78,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#1C1430',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    zIndex: 7,
  },
  speed: {fontSize: 28, lineHeight: 32, fontWeight: '800'},
  unit: {color: '#8E84A3', fontSize: 10, fontWeight: '600'},
});
