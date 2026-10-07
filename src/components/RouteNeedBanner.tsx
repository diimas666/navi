import {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View} from 'react-native';

import type {RegionDefinition} from '../constants/map';
import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import {downloadRegion} from '../services/maps/OfflineMapService';
import {formatRegionList, needDownloadView} from '../services/maps/regionCoverage';
import {useMapStore} from '../store/mapStore';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = {
  missing: RegionDefinition[];
  onMaps: () => void;
};

export function RouteNeedBanner({missing, onMaps}: Props) {
  const {colors} = useTheme();
  const language = useSettingsStore(state => state.language);
  const copy = uiCopy(language);
  const regions = useMapStore(state => state.regions);
  const [held, setHeld] = useState<RegionDefinition[]>(missing);
  const slide = useRef(new Animated.Value(0)).current;
  const hiding = useRef(false);

  useEffect(() => {
    if (missing.length > 0) {
      hiding.current = false;
      setHeld(missing);
      slide.stopAnimation();
      slide.setValue(0);
      return;
    }
    if (held.length === 0 || hiding.current) {
      return;
    }
    hiding.current = true;
    Animated.timing(slide, {
      toValue: 1,
      duration: 360,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished) {
        setHeld([]);
      }
    });
  }, [held.length, missing, slide]);

  if (held.length === 0) {
    return null;
  }

  const shown = missing.length > 0 ? missing : held;
  const view = needDownloadView(
    shown.map(region => region.id),
    regions,
  );
  const {busy, percent, detail} = view;
  const failed = view.error;
  const names = formatRegionList(
    shown.map(region => region.name),
    resolveLanguage(language),
  );

  return (
    <Animated.View
      pointerEvents={hiding.current ? 'none' : 'box-none'}
      style={[
        styles.banner,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: slide.interpolate({inputRange: [0, 1], outputRange: [1, 0]}),
          transform: [
            {
              translateY: slide.interpolate({inputRange: [0, 1], outputRange: [0, -72]}),
            },
          ],
        },
      ]}>
      <Text style={[styles.title, {color: colors.textPrimary}]}>{busy ? `${percent}%` : copy.mapsNeed}</Text>
      <Text style={[styles.body, {color: colors.textSecondary}]}>
        {busy ? `${names}${detail ? ` · ${detail}` : ''}` : `${names}. ${copy.mapsNeedBody}`}
      </Text>
      {busy ? (
        <View style={[styles.track, {backgroundColor: colors.surfaceMuted}]}>
          <View style={[styles.fill, {width: `${percent}%`, backgroundColor: colors.accent}]} />
        </View>
      ) : null}
      {failed && !busy ? <Text style={[styles.error, {color: colors.danger}]}>{failed}</Text> : null}
      <View style={styles.row}>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.busyText, {color: colors.accent}]}>{detail ?? `${percent}%`}</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              shown.forEach(region => {
                downloadRegion(region).catch(() => undefined);
              });
            }}
            style={[styles.action, {backgroundColor: colors.accent}]}>
            <Text style={[styles.actionText, {color: colors.onAccent}]}>{copy.mapsNeedAction}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={onMaps}>
          <Text style={[styles.link, {color: colors.textMuted}]}>{copy.maps}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 78,
    top: 54,
    zIndex: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  title: {...type.bodyStrong},
  body: {...type.caption},
  error: {...type.caption, fontWeight: '700'},
  track: {height: 6, borderRadius: 3, overflow: 'hidden'},
  fill: {height: 6, borderRadius: 3},
  row: {flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2},
  busy: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28},
  busyText: {fontWeight: '700', fontSize: 13, flex: 1},
  action: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: {fontWeight: '700', fontSize: 13},
  link: {fontWeight: '600', fontSize: 13},
});
