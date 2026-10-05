import {StyleSheet, Text, View} from 'react-native';

import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';

type Props = {
  speedMps: number;
  limitKmh: number | null;
  night?: boolean;
  cameraM?: number | null;
};

export function TripReadout({speedMps, limitKmh, night = false, cameraM = null}: Props) {
  const copy = uiCopy(useSettingsStore(state => state.language));
  const kmh = speedMps * 3.6;
  const over = limitKmh != null && kmh > limitKmh + 3;
  const speedColor = over ? '#E23B3B' : night ? '#8EB4FF' : '#2F6FE0';
  return (
    <View style={[styles.card, night ? styles.cardNight : null, over ? (night ? styles.overNight : styles.over) : null]}>
      <Text style={[styles.speed, {color: speedColor}]}>{String(Math.round(kmh))}</Text>
      <Text style={[styles.unit, night ? styles.unitNight : null]}>км/год</Text>
      {limitKmh != null ? (
        <Text style={[styles.limit, night ? styles.limitNight : null, over ? styles.limitOver : null]}>
          {`${copy.maxSpeed} ${limitKmh}`}
        </Text>
      ) : null}
      {cameraM != null ? (
        <Text style={[styles.camera, over ? styles.limitOver : null]}>{`${copy.cameraAhead} ${formatCamera(cameraM)}`}</Text>
      ) : null}
    </View>
  );
}

function formatCamera(meters: number): string {
  if (meters >= 950) {
    return `${(meters / 1000).toFixed(1).replace('.', ',')} км`;
  }
  return `${Math.round(meters / 10) * 10} м`;
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
  cardNight: {backgroundColor: 'rgba(28,24,38,0.94)'},
  over: {backgroundColor: 'rgba(255,236,236,0.96)'},
  overNight: {backgroundColor: 'rgba(62,28,36,0.94)'},
  speed: {fontSize: 28, lineHeight: 32, fontWeight: '800'},
  unit: {color: '#8E84A3', fontSize: 10, fontWeight: '600'},
  unitNight: {color: '#B8B0C8'},
  limit: {color: '#6E657F', fontSize: 11, fontWeight: '700', marginTop: 2},
  limitNight: {color: '#B8B0C8'},
  limitOver: {color: '#E23B3B'},
  camera: {color: '#C48A12', fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center'},
});
