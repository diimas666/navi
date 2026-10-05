import {StyleSheet, Text, View} from 'react-native';

import type {LaneHint} from '../models/domain';
import type {ManeuverCue, ManeuverTurn} from '../services/navigation/maneuver';

type Props = {
  current: ManeuverCue;
  after?: ManeuverCue | null;
  thenWord: string;
  street?: string;
};

export function ManeuverBanner({current, after, thenWord, street}: Props) {
  const road = street && street !== current.street ? street : '';
  return (
    <View style={styles.card}>
      {current.lanes.length > 1 ? <LaneRow lanes={current.lanes} /> : null}
      <View style={styles.row}>
        <TurnArrow turn={current.turn} large />
        <Text style={styles.meters}>{formatMeters(current.meters)}</Text>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          {road ? (
            <Text style={styles.street} numberOfLines={1}>
              {road}
            </Text>
          ) : null}
        </View>
      </View>
      {after && after.turn !== 'arrive' ? (
        <View style={styles.after}>
          <TurnArrow turn={after.turn} />
          <Text style={styles.afterText} numberOfLines={1}>
            {`${thenWord} ${after.title}`}
          </Text>
        </View>
      ) : null}
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

function TurnArrow({turn, large = false}: {turn: ManeuverTurn; large?: boolean}) {
  const rotation = arrowRotation(turn);
  if (turn === 'arrive') {
    return <View style={[styles.arrive, large ? styles.arriveLarge : null]} />;
  }
  return (
    <View style={[styles.arrowBox, large ? styles.arrowBoxLarge : null, {transform: [{rotate: rotation}]}]}>
      <View style={[styles.arrowHead, large ? styles.arrowHeadLarge : null]} />
      <View style={[styles.arrowShaft, large ? styles.arrowShaftLarge : null]} />
    </View>
  );
}

function LaneRow({lanes}: {lanes: LaneHint[]}) {
  return (
    <View style={styles.lanes}>
      {lanes.map((lane, index) => (
        <View key={`${lane.indication}-${index}`} style={[styles.lane, lane.valid ? styles.laneOn : null]}>
          <TurnArrow turn={lane.indication === 'uturn' ? 'uturn' : lane.indication} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 54,
    left: 12,
    right: 88,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  copy: {flex: 1, gap: 1},
  meters: {color: '#1C1430', fontSize: 26, fontWeight: '800'},
  title: {color: '#1C1430', fontSize: 16, fontWeight: '700'},
  street: {color: '#6E657F', fontSize: 13, fontWeight: '600'},
  after: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4},
  afterText: {flex: 1, color: '#6E657F', fontSize: 13, fontWeight: '600'},
  lanes: {flexDirection: 'row', gap: 4},
  lane: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EEF1F4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  laneOn: {borderColor: '#149C96', backgroundColor: '#E7F7F5'},
  arrowBox: {width: 16, height: 16, alignItems: 'center'},
  arrowBoxLarge: {width: 22, height: 22},
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#149C96',
  },
  arrowHeadLarge: {borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 9},
  arrowShaft: {width: 3, height: 6, borderRadius: 1, backgroundColor: '#149C96', marginTop: -1},
  arrowShaftLarge: {width: 4, height: 8},
  arrive: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#149C96'},
  arriveLarge: {width: 14, height: 14, borderRadius: 7},
});
