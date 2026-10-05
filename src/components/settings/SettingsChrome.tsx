import {useRef, useState, type ComponentRef, type ReactNode} from 'react';
import {PanResponder, Pressable, StyleSheet, Text, View} from 'react-native';

import {type} from '../../theme/typography';

export const settingsColors = {
  page: '#F6F3FB',
  card: '#FFFFFF',
  ink: '#1C1430',
  muted: '#8E84A3',
  link: '#6B4EE0',
  warn: '#C98412',
  danger: '#D64545',
  track: '#E6E7EB',
  line: 'rgba(60,60,67,0.12)',
};

export function SectionLabel({title}: {title: string}) {
  return <Text style={styles.section}>{title}</Text>;
}

export function Card({children}: {children: ReactNode}) {
  return <View style={styles.card}>{children}</View>;
}

export function SettingsRow({
  title,
  detail,
  onPress,
  color,
  trailing,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  color?: string;
  trailing?: ReactNode;
}) {
  const body = (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={[styles.title, color ? {color} : null]}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {trailing}
    </View>
  );
  if (!onPress) {
    return body;
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  );
}

const THUMB_SIZE = 26;

export function RangeBar({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const viewRef = useRef<ComponentRef<typeof View>>(null);
  const originX = useRef(0);
  const touchX = useRef(0);
  const dragging = useRef(false);
  const originReady = useRef(false);
  const [trackWidth, setTrackWidth] = useState(1);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const bounds = useRef({min, max, step, onChange, width: 1, value});
  bounds.current = {min, max, step, onChange, width: trackWidth, value};
  const placeRef = useRef<(pageX: number) => void>(() => undefined);
  placeRef.current = pageX => {
    const current = bounds.current;
    const {ratio, value: next} = rangeFromTouch(current, pageX - originX.current);
    setDragRatio(ratio);
    if (next !== current.value) {
      current.value = next;
      current.onChange(next);
    }
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_event, gesture) => {
        dragging.current = true;
        originReady.current = false;
        touchX.current = gesture.x0;
        viewRef.current?.measureInWindow((x: number) => {
          originX.current = x;
          originReady.current = true;
          if (dragging.current) {
            placeRef.current(touchX.current);
          }
        });
      },
      onPanResponderMove: (_event, gesture) => {
        touchX.current = gesture.moveX;
        if (originReady.current) {
          placeRef.current(gesture.moveX);
        }
      },
      onPanResponderRelease: () => {
        dragging.current = false;
        originReady.current = false;
        setDragRatio(null);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        originReady.current = false;
        setDragRatio(null);
      },
    }),
  ).current;
  const committed = max === min ? 0 : (value - min) / (max - min);
  const ratio = dragRatio ?? Math.min(1, Math.max(0, committed));
  const thumbLeft = ratio * Math.max(trackWidth - THUMB_SIZE, 0);
  return (
    <View
      ref={viewRef}
      collapsable={false}
      pointerEvents="box-only"
      style={styles.range}
      onLayout={event => {
        setTrackWidth(event.nativeEvent.layout.width);
        viewRef.current?.measureInWindow((x: number) => {
          originX.current = x;
        });
      }}
      {...pan.panHandlers}>
      <View style={styles.rangeTrack} pointerEvents="none">
        <View style={[styles.rangeFill, {width: thumbLeft + THUMB_SIZE / 2}]} />
      </View>
      <View pointerEvents="none" style={[styles.rangeThumb, {left: thumbLeft}]} />
    </View>
  );
}

function rangeFromTouch(
  current: {min: number; max: number; step: number; width: number},
  localX: number,
): {ratio: number; value: number} {
  const travel = Math.max(current.width - THUMB_SIZE, 1);
  const ratio = Math.min(1, Math.max(0, (localX - THUMB_SIZE / 2) / travel));
  const raw = current.min + ratio * (current.max - current.min);
  const snapped = Math.round(raw / current.step) * current.step;
  return {ratio, value: Math.min(current.max, Math.max(current.min, snapped))};
}

export function Segment({
  options,
  value,
  onChange,
}: {
  options: Array<{id: string; label: string}>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map(option => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            onPress={() => onChange(option.id)}
            style={[styles.segmentItem, selected ? styles.segmentOn : null]}>
            <Text style={[styles.segmentLabel, selected ? styles.segmentLabelOn : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 8,
    color: settingsColors.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: settingsColors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {flex: 1, gap: 2, paddingVertical: 8},
  title: {...type.bodyStrong, color: settingsColors.ink},
  detail: {...type.caption, color: settingsColors.muted},
  segment: {
    flexDirection: 'row',
    backgroundColor: settingsColors.track,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: {
    backgroundColor: '#FFFFFF',
  },
  segmentLabel: {
    color: settingsColors.muted,
    fontWeight: '700',
    fontSize: 13,
  },
  segmentLabelOn: {
    color: settingsColors.ink,
  },
  range: {
    height: 36,
    justifyContent: 'center',
  },
  rangeTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E5EA',
    overflow: 'hidden',
  },
  rangeFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#20B2AA',
  },
  rangeThumb: {
    position: 'absolute',
    top: 5,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C1430',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 1},
    elevation: 3,
  },
});
