import {StyleSheet, Text, View} from 'react-native';

import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';

type Props = {
  limitKmh: number | null;
  night?: boolean;
  cameraM?: number | null;
};

export function TripReadout({limitKmh, night = false, cameraM = null}: Props) {
  const copy = uiCopy(useSettingsStore(state => state.language));
  if (limitKmh == null && cameraM == null) {
    return null;
  }
  return (
    <View style={[styles.card, night ? styles.cardNight : null]}>
      {limitKmh != null ? (
        <Text style={[styles.limit, night ? styles.limitNight : null]}>{`${copy.maxSpeed} ${limitKmh}`}</Text>
      ) : null}
      {cameraM != null ? (
        <Text style={styles.camera}>{`${copy.cameraAhead} ${formatCamera(cameraM)}`}</Text>
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
    minWidth: 78,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#1C1430',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    zIndex: 7,
  },
  cardNight: {backgroundColor: 'rgba(28,24,38,0.94)'},
  limit: {color: '#6E657F', fontSize: 12, fontWeight: '700'},
  limitNight: {color: '#B8B0C8'},
  camera: {color: '#C48A12', fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center'},
});
