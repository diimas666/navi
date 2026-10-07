import {useRef, useState, type ComponentRef, type ReactNode} from 'react';
import {PanResponder, Pressable, StyleSheet, Text, View} from 'react-native';

import {useTheme} from '../../theme/ThemeProvider';
import {type} from '../../theme/typography';

export function SectionLabel({title}: {title: string}) {
  const {colors} = useTheme();
  return <Text style={[styles.section, {color: colors.textMuted}]}>{title}</Text>;
}

export function Card({children}: {children: ReactNode}) {
  const {colors} = useTheme();
  return <View style={[styles.card, {backgroundColor: colors.surface}]}>{children}</View>;
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
  const {colors} = useTheme();
  const body = (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={[styles.title, {color: color ?? colors.textPrimary}]}>{title}</Text>
        {detail ? <Text style={[styles.detail, {color: colors.textMuted}]}>{detail}</Text> : null}
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
  const {colors} = useTheme();
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
      <View style={[styles.rangeTrack, {backgroundColor: colors.border}]} pointerEvents="none">
        <View style={[styles.rangeFill, {width: thumbLeft + THUMB_SIZE / 2, backgroundColor: colors.accent}]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.rangeThumb, {left: thumbLeft, backgroundColor: colors.surface, shadowColor: colors.textPrimary}]}
      />
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
  const {colors} = useTheme();
  return (
    <View style={[styles.segment, {backgroundColor: colors.surfaceMuted}]}>
      {options.map(option => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            onPress={() => onChange(option.id)}
            style={[styles.segmentItem, selected ? {backgroundColor: colors.surface} : null]}>
            <Text style={[styles.segmentLabel, {color: selected ? colors.textPrimary : colors.textMuted}]}>
              {option.label}
            </Text>
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
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  card: {
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
  title: {...type.bodyStrong},
  detail: {...type.caption},
  segment: {
    flexDirection: 'row',
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
  segmentLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
  range: {
    height: 36,
    justifyContent: 'center',
  },
  rangeTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  rangeFill: {
    height: 4,
    borderRadius: 2,
  },
  rangeThumb: {
    position: 'absolute',
    top: 5,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 1},
    elevation: 3,
  },
});
