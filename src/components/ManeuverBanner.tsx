import {StyleSheet, Text, View} from 'react-native';

import type {LaneHint} from '../models/domain';
import {abbreviateStreet, formatDriveMeters} from '../services/navigation/instruction';
import type {ManeuverCue, ManeuverTurn} from '../services/navigation/maneuver';

type Props = {
  current: ManeuverCue;
  after?: ManeuverCue | null;
  thenWord: string;
  night?: boolean;
};

/** Compact card: arrow, distance and one street line. The next turn is one short line below. */
export function ManeuverBanner({current, after, thenWord, night = false}: Props) {
  const ink = night ? '#F4F0FF' : '#1C1430';
  const muted = night ? '#B8B0C8' : '#6E657F';
  const next = after && after.turn !== 'arrive' ? after : null;
  const line = current.street ? abbreviateStreet(current.street) : current.title;
  const nextLine = next ? (next.street ? abbreviateStreet(next.street) : lowerFirst(next.title)) : '';
  return (
    <View style={[styles.card, night ? styles.cardNight : null]}>
      {current.lanes.length > 1 ? <LaneRow lanes={current.lanes} night={night} /> : null}
      <View style={styles.row}>
        <View style={[styles.badge, night ? styles.badgeNight : null]}>
          <TurnArrow turn={current.turn} size="xl" color="#FFFFFF" />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.meters, {color: ink}]}>{formatDriveMeters(current.meters)}</Text>
          {line ? (
            <Text style={[styles.street, {color: muted}]} numberOfLines={1}>
              {line}
            </Text>
          ) : null}
        </View>
      </View>
      {next ? (
        <View style={[styles.after, night ? styles.afterNight : null]}>
          <Text style={[styles.afterText, {color: muted}]}>{thenWord}</Text>
          <TurnArrow turn={next.turn} night={night} />
          <Text style={[styles.afterText, styles.afterStreet, {color: muted}]} numberOfLines={1}>
            {nextLine}
          </Text>
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

type ArrowSize = 'small' | 'large' | 'xl';

function TurnArrow({
  turn,
  size = 'small',
  night = false,
  color,
}: {
  turn: ManeuverTurn;
  size?: ArrowSize;
  night?: boolean;
  color?: string;
}) {
  const rotation = arrowRotation(turn);
  const mark = color ?? (night ? '#B7A4F5' : '#6B4EE0');
  const box = size === 'xl' ? styles.arrowBoxXl : size === 'large' ? styles.arrowBoxLarge : null;
  const head = size === 'xl' ? styles.arrowHeadXl : size === 'large' ? styles.arrowHeadLarge : null;
  const shaft = size === 'xl' ? styles.arrowShaftXl : size === 'large' ? styles.arrowShaftLarge : null;
  if (turn === 'arrive') {
    const dot = size === 'small' ? null : size === 'xl' ? styles.arriveXl : styles.arriveLarge;
    return <View style={[styles.arrive, dot, {backgroundColor: mark}]} />;
  }
  return (
    <View style={[styles.arrowBox, box, {transform: [{rotate: rotation}]}]}>
      <View style={[styles.arrowHead, head, {borderBottomColor: mark}]} />
      <View style={[styles.arrowShaft, shaft, {backgroundColor: mark}]} />
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
    maxWidth: '74%',
    zIndex: 4,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingLeft: 10,
    paddingRight: 16,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
  },
  cardNight: {backgroundColor: '#1C1826', shadowOpacity: 0.28},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  badge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#6B4EE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNight: {backgroundColor: '#7A5FE8'},
  copy: {flexShrink: 1, minWidth: 0},
  meters: {color: '#1C1430', fontSize: 26, fontWeight: '800', lineHeight: 30},
  street: {color: '#6E657F', fontSize: 15, fontWeight: '700'},
  after: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    paddingLeft: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(28,20,48,0.12)',
  },
  afterNight: {borderTopColor: 'rgba(244,240,255,0.14)'},
  afterText: {color: '#6E657F', fontSize: 13, fontWeight: '600'},
  afterStreet: {flexShrink: 1, fontWeight: '700'},
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
  laneOn: {borderColor: '#6B4EE0', backgroundColor: '#EEE9FC'},
  laneOnNight: {borderColor: '#B7A4F5', backgroundColor: '#2E2744'},
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
    borderBottomColor: '#6B4EE0',
  },
  arrowHeadLarge: {borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 9},
  arrowShaft: {width: 3, height: 6, borderRadius: 1, backgroundColor: '#6B4EE0', marginTop: -1},
  arrowShaftLarge: {width: 4, height: 8},
  arrowBoxXl: {width: 28, height: 28, marginTop: 0},
  arrowHeadXl: {borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 13},
  arrowShaftXl: {width: 7, height: 13, borderRadius: 2},
  arriveXl: {width: 18, height: 18, borderRadius: 9, marginTop: 0},
  arrive: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#6B4EE0', marginTop: 6},
  arriveLarge: {width: 14, height: 14, borderRadius: 7, marginTop: 6},
});

/** "затем Поверните" reads as two sentences. The cue after "then" starts lowercase. */
function lowerFirst(text: string): string {
  return text ? `${text[0].toLowerCase()}${text.slice(1)}` : text;
}
