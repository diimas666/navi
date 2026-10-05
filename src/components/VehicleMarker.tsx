import {StyleSheet, View} from 'react-native';
import Svg, {G, Path} from 'react-native-svg';

const WAZE_ARROW =
  'M32 5C33.6 5 35 6.1 35.6 7.6L53.4 46.2C54.5 48.5 52.6 50.9 50.1 50.3C43.2 42 37 35.5 32 35.5C27 35.5 20.8 42 13.9 50.3C11.4 50.9 9.5 48.5 10.6 46.2L28.4 7.6C29 6.1 30.4 5 32 5Z';

type Props = {
  rotation: number;
  navigating?: boolean;
};

export function VehicleMarker({rotation, navigating}: Props) {
  if (navigating) {
    return (
      <View style={[styles.arrowBox, {transform: [{rotate: `${rotation}deg`}]}]}>
        <Svg width={58} height={58} viewBox="0 0 64 64">
          <G transform="translate(0 2.4)">
            <Path d={WAZE_ARROW} fill="rgba(28,20,48,0.22)" />
          </G>
          <Path
            d={WAZE_ARROW}
            fill="#1A73E8"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <View style={[styles.beamPivot, {transform: [{rotate: `${rotation}deg`}]}]}>
        <View style={styles.beam} />
      </View>
      <View style={styles.shell}>
        <View style={styles.ring}>
          <View style={styles.hole} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beamPivot: {
    position: 'absolute',
    width: 104,
    height: 104,
    alignItems: 'center',
  },
  beam: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 30,
    borderRightWidth: 30,
    borderTopWidth: 52,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(232, 158, 42, 0.42)',
  },
  shell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C47A12',
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 1},
  },
  ring: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F0A024',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hole: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  arrowBox: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
