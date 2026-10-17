import {StyleSheet, Text, View} from 'react-native';

import {jamText, type JamNotice} from '../services/navigation/jamNotice';

/**
 * Always-visible line while GPS is jammed, so a drifting arrow never looks like a bug.
 * It sits under the turn banner: the car arrow lives in the lower third while driving.
 */
export function JamPill({notice, language, top}: {notice: JamNotice; language: 'uk' | 'ru'; top: number}) {
  const spoof = notice.kind === 'spoof';
  return (
    <View pointerEvents="none" style={[styles.wrap, {top}]}>
      <View style={[styles.pill, spoof ? styles.spoof : null]}>
        <View style={[styles.dot, spoof ? styles.dotSpoof : null]} />
        <Text style={styles.text} numberOfLines={1}>
          {jamText(notice, language)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {position: 'absolute', left: 12, right: 88, alignItems: 'flex-start', zIndex: 6},
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: '#3A2A12',
    shadowColor: '#1C1430',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 3},
  },
  spoof: {backgroundColor: '#4A1F1A'},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#F2B24C'},
  dotSpoof: {backgroundColor: '#F07A63'},
  text: {color: '#FFF4E2', fontSize: 14, fontWeight: '700', flexShrink: 1},
});
