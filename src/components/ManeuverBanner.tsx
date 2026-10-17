import {StyleSheet, Text, View} from 'react-native';

import type {LaneHint} from '../models/domain';
import {formatDriveMeters} from '../services/navigation/instruction';
import type {ManeuverCue, ManeuverTurn} from '../services/navigation/maneuver';

type Props = {
  current: ManeuverCue;
  after?: ManeuverCue | null;
  thenWord: string;
  night?: boolean;
};

export function ManeuverBanner({current, after, thenWord, night = false}: Props) {
  const ink = night ? '#F4F0FF' : '#1C1430';
  const muted = night ? '#B8B0C8' : '#6E657F';
  const next = after && after.turn !== 'arrive' ? after : null;
  return (
    <View style={[styles.card, night ? styles.cardNight : null]}>
      {current.lanes.length > 1 ? <LaneRow lanes={current.lanes} night={night} /> : null}
      <View style={styles.row}>
        <TurnArrow turn={current.turn} large night={night} />
        <Text style={[styles.meters, {color: ink}]}>{formatDriveMeters(current.meters)}</Text>
        <View style={styles.copy}>
          <Text style={[styles.title, {color: ink}]}>{current.title}</Text>
          {current.street ? (
            <Text style={[styles.street, {color: muted}]}>{current.street}</Text>
          ) : null}
        </View>
      </View>
      {next ? (
        <View style={styles.after}>
          <TurnArrow turn={next.turn} night={night} />
          <View style={styles.copy}>
            <Text style={[styles.afterText, {color: muted}]}>
              {`${thenWord} ${lowerFirst(next.title)}`.trim()}
            </Text>
            {next.street ? <Text style={[styles.afterStreet, {color: muted}]}>{next.street}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
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

function TurnArrow({turn, large = false, night = false}: {turn: ManeuverTurn; large?: boolean; night?: boolean}) {
  const rotation = arrowRotation(turn);
  const mark = night ? '#5EE0D6' : '#149C96';
  if (turn === 'arrive') {
    return <View style={[styles.arrive, large ? styles.arriveLarge : null, {backgroundColor: mark}]} />;
  }
  return (
    <View style={[styles.arrowBox, large ? styles.arrowBoxLarge : null, {transform: [{rotate: rotation}]}]}>
      <View style={[styles.arrowHead, large ? styles.arrowHeadLarge : null, {borderBottomColor: mark}]} />
      <View style={[styles.arrowShaft, large ? styles.arrowShaftLarge : null, {backgroundColor: mark}]} />
    </View>
  );
}

function LaneRow({lanes, night = false}: {lanes: LaneHint[]; night?: boolean}) {
  return (
    <View style={styles.lanes}>
      {lanes.map((lane, index) => (
        <View
          key={`${lane.indication}-${index}`}
          style={[
            styles.lane,
            night ? styles.laneNight : null,
            lane.valid ? (night ? styles.laneOnNight : styles.laneOn) : null,
          ]}>
          <TurnArrow turn={lane.indication === 'uturn' ? 'uturn' : lane.indication} night={night} />
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
    zIndex: 4,
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
  cardNight: {backgroundColor: '#1C1826', shadowOpacity: 0.28},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  copy: {flex: 1, gap: 2, minWidth: 0},
  meters: {color: '#1C1430', fontSize: 22, fontWeight: '800', paddingTop: 1},
  title: {color: '#1C1430', fontSize: 17, fontWeight: '800'},
  street: {color: '#6E657F', fontSize: 15, fontWeight: '700'},
  after: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 4},
  afterText: {color: '#6E657F', fontSize: 13, fontWeight: '600'},
  afterStreet: {color: '#6E657F', fontSize: 13, fontWeight: '700'},
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
  laneNight: {backgroundColor: '#2A2438'},
  laneOn: {borderColor: '#149C96', backgroundColor: '#E7F7F5'},
  laneOnNight: {borderColor: '#5EE0D6', backgroundColor: '#24343A'},
  arrowBox: {width: 16, height: 16, alignItems: 'center', marginTop: 3},
  arrowBoxLarge: {width: 22, height: 22, marginTop: 2},
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
  arrive: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#149C96', marginTop: 6},
  arriveLarge: {width: 14, height: 14, borderRadius: 7, marginTop: 6},
});

/** "затем Поверните" reads as two sentences. The cue after "then" starts lowercase. */
function lowerFirst(text: string): string {
  return text ? `${text[0].toLowerCase()}${text.slice(1)}` : text;
}
