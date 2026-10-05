import {StyleSheet, Text, View} from 'react-native';

import type {ManeuverTurn} from '../services/navigation/maneuver';

type Props = {
  meters: number;
  title: string;
  turn: ManeuverTurn;
};

export function ManeuverBanner({meters, title, turn}: Props) {
  return (
    <View style={styles.pill}>
      <TurnArrow turn={turn} />
      <Text style={styles.meters}>{formatMeters(meters)}</Text>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function formatMeters(meters: number): string {
  if (meters >= 950) {
    return `${(meters / 1000).toFixed(1).replace('.', ',')} км`;
  }
  const rounded = meters > 40 ? Math.round(meters / 10) * 10 : Math.max(0, Math.round(meters));
  return `${rounded} м`;
}

function arrowRotation(turn: ManeuverTurn): string {
  if (turn === 'left') {
    return '-90deg';
  }
  if (turn === 'right') {
    return '90deg';
  }
  if (turn === 'uturn') {
    return '180deg';
  }
  return '0deg';
}

function TurnArrow({turn}: {turn: ManeuverTurn}) {
  const rotation = arrowRotation(turn);
  if (turn === 'arrive') {
    return <View style={styles.arrive} />;
  }
  return (
    <View style={[styles.arrowBox, {transform: [{rotate: rotation}]}]}>
      <View style={styles.arrowHead} />
      <View style={styles.arrowShaft} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 118,
    left: 12,
    right: 88,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
  },
  meters: {color: '#1C1430', fontSize: 22, fontWeight: '800'},
  title: {flex: 1, color: '#1C1430', fontSize: 16, fontWeight: '600'},
  arrowBox: {width: 22, height: 22, alignItems: 'center'},
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#149C96',
  },
  arrowShaft: {width: 4, height: 8, borderRadius: 1, backgroundColor: '#149C96', marginTop: -1},
  arrive: {width: 14, height: 14, borderRadius: 7, backgroundColor: '#149C96'},
});
