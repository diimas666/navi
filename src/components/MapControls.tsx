import {memo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';

import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import {stopManeuverSpeech} from '../services/navigation/speakCue';
import {useSettingsStore} from '../store/settingsStore';
import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';

type Props = {
  follow: boolean;
  locked: boolean;
  road: boolean;
  headingUp: boolean;
  driving?: boolean;
  buildings3d?: boolean;
  onBuildings?: () => void;
  onFollow: () => void;
  onLock: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOverview: () => void;
  onHeading: () => void;
  onNorth: () => void;
  onAlong?: () => void;
};

export const MapControls = memo(function MapControls({
  follow,
  locked,
  road,
  headingUp,
  driving = false,
  buildings3d = false,
  onBuildings,
  onFollow,
  onLock,
  onZoomIn,
  onZoomOut,
  onOverview,
  onHeading,
  onNorth,
  onAlong,
}: Props) {
  const {colors} = useTheme();
  const voice = useSettingsStore(state => state.voice);
  const language = resolveLanguage(useSettingsStore(state => state.language));
  const copy = uiCopy(language);
  const voiceLabel = voice ? voiceCopy[language].off : voiceCopy[language].on;
  if (road) {
    return (
      <View style={styles.column}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.follow}
          onPress={onFollow}
          style={[styles.roadButton, {backgroundColor: colors.surface, shadowColor: colors.textPrimary}]}>
          <LocateGlyph />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.overview}
          onPress={onOverview}
          style={[styles.roadOn, {backgroundColor: colors.accent, shadowColor: colors.accent}]}>
          <RouteGlyph />
        </Pressable>
        <View style={[styles.compass, {backgroundColor: colors.surface, shadowColor: colors.textPrimary}]}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.heading} onPress={onHeading} style={styles.compassHalf}>
            <NavArrow color={headingUp ? colors.accent : colors.textMuted} />
          </Pressable>
          <View style={[styles.compassLine, {backgroundColor: colors.border}]} />
          <Pressable accessibilityRole="button" accessibilityLabel={copy.north} onPress={onNorth} style={styles.compassHalf}>
            <NorthArrow color={headingUp ? colors.textMuted : colors.accent} />
          </Pressable>
        </View>
        {driving && onAlong ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.alongRoute}
            onPress={onAlong}
            style={[styles.dimension, {backgroundColor: colors.surface, shadowColor: colors.textPrimary}]}>
            <Text style={[styles.dimensionLabel, {color: colors.textPrimary}]}>{copy.alongGas}</Text>
          </Pressable>
        ) : null}
        {driving ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={buildings3d ? copy.housesFlat : copy.housesSolid}
            onPress={onBuildings}
            style={[styles.dimension, {backgroundColor: colors.surface, shadowColor: colors.textPrimary}]}>
            <Text style={[styles.dimensionLabel, {color: colors.textPrimary}]}>{buildings3d ? '3D' : '2D'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={voiceLabel}
          onPress={() => {
            const next = !useSettingsStore.getState().voice;
            useSettingsStore.getState().setVoice(next);
            if (!next) {
              stopManeuverSpeech();
            }
          }}
          style={[styles.speakerButton, {backgroundColor: colors.surface, shadowColor: colors.textPrimary}]}>
          <SpeakerGlyph muted={!voice} color={colors.textPrimary} cutout={colors.surface} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.column}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.lock}
        onPress={onLock}
        style={[styles.button, {backgroundColor: locked ? colors.accent : colors.glass}]}>
        <LockGlyph color={locked ? colors.onAccent : colors.textPrimary} />
      </Pressable>
      <Control label="+" onPress={onZoomIn} />
      <Control label="−" onPress={onZoomOut} />
      <Pressable
        accessibilityRole="button"
        onPress={onFollow}
        style={[styles.button, {backgroundColor: follow ? colors.accent : colors.glass}]}>
        <Text style={{color: follow ? colors.onAccent : colors.textPrimary}}>{follow ? '↑' : 'N'}</Text>
      </Pressable>
    </View>
  );
});

function LockGlyph({color}: {color: string}) {
  return (
    <View style={styles.lock}>
      <View style={[styles.lockShackle, {borderColor: color}]} />
      <View style={[styles.lockBody, {backgroundColor: color}]} />
    </View>
  );
}

function Control({label, onPress}: {label: string; onPress: () => void}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, {backgroundColor: colors.glass}]}>
      <Text style={[styles.glyph, {color: colors.textPrimary}]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: {
    position: 'absolute',
    right: 14,
    top: 120,
    alignItems: 'flex-end',
    gap: 10,
    zIndex: 30,
    elevation: 30,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 22,
    fontWeight: '600',
  },
  lock: {width: 16, height: 18, alignItems: 'center'},
  lockShackle: {
    width: 10,
    height: 8,
    borderWidth: 1.8,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  lockBody: {width: 14, height: 9, borderRadius: 2, marginTop: -1},
  roadButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
  },
  roadOn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#149C96',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#149C96',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
  },
  compass: {
    width: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
  },
  compassHalf: {width: 52, height: 46, alignItems: 'center', justifyContent: 'center'},
  compassLine: {width: 28, height: 1, backgroundColor: '#D5E4E2'},
  dimension: {
    minWidth: 52,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
  },
  dimensionLabel: {color: '#1C1430', fontSize: 16, fontWeight: '800', letterSpacing: 0.4},
  speakerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C1430',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
  },
  locate: {width: 26, height: 26, alignItems: 'center', justifyContent: 'center'},
  locateRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.4,
    borderColor: '#149C96',
  },
  locateDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#149C96',
  },
  locateTick: {position: 'absolute', width: 2.4, height: 6, borderRadius: 1, backgroundColor: '#149C96'},
  locateN: {top: 0},
  locateS: {bottom: 0},
  locateTickH: {position: 'absolute', width: 6, height: 2.4, borderRadius: 1, backgroundColor: '#149C96'},
  locateW: {left: 0},
  locateE: {right: 0},
  route: {width: 26, height: 26},
  routeAcross: {
    position: 'absolute',
    left: 4,
    top: 3,
    width: 12,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  routeDown: {
    position: 'absolute',
    left: 13,
    top: 3,
    width: 3,
    height: 11,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  routeStart: {
    position: 'absolute',
    left: 0,
    top: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  routePin: {
    position: 'absolute',
    left: 8,
    top: 11,
    width: 13,
    alignItems: 'center',
  },
  routePinHead: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routePinHole: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#149C96',
  },
  routePinTip: {
    marginTop: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 4.5,
    borderRightWidth: 4.5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  course: {alignItems: 'center'},
  courseHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  courseTail: {width: 4, height: 9, marginTop: -1, borderRadius: 2},
  northMark: {fontSize: 20, fontWeight: '800'},
});

function LocateGlyph() {
  return (
    <View style={styles.locate}>
      <View style={styles.locateRing} />
      <View style={styles.locateDot} />
      <View style={[styles.locateTick, styles.locateN]} />
      <View style={[styles.locateTick, styles.locateS]} />
      <View style={[styles.locateTickH, styles.locateW]} />
      <View style={[styles.locateTickH, styles.locateE]} />
    </View>
  );
}

function RouteGlyph() {
  return (
    <View style={styles.route}>
      <View style={styles.routeAcross} />
      <View style={styles.routeDown} />
      <View style={styles.routeStart} />
      <View style={styles.routePin}>
        <View style={styles.routePinHead}>
          <View style={styles.routePinHole} />
        </View>
        <View style={styles.routePinTip} />
      </View>
    </View>
  );
}

function NavArrow({color}: {color: string}) {
  return (
    <View style={styles.course}>
      <View style={[styles.courseHead, {borderBottomColor: color}]} />
      <View style={[styles.courseTail, {backgroundColor: color}]} />
    </View>
  );
}

function NorthArrow({color}: {color: string}) {
  return <Text style={[styles.northMark, {color}]}>{'N'}</Text>;
}

const voiceCopy = {
  uk: {on: 'Увімкнути звук', off: 'Вимкнути звук'},
  ru: {on: 'Включить звук', off: 'Выключить звук'},
};

function SpeakerGlyph({muted, color, cutout}: {muted: boolean; color: string; cutout: string}) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24">
      <Path
        d="M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
        fill={color}
      />
      {muted ? (
        <>
          <Path d="M20.2 5.1L5.2 19.4" stroke={cutout} strokeWidth={3.6} strokeLinecap="round" />
          <Path d="M20.2 5.1L5.2 19.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Path
            d="M16.46 8.29a5.25 5.25 0 010 7.42"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <Path
            d="M19.11 5.64a9 9 0 010 12.72"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}
