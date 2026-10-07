import {Modal, Pressable, StyleSheet, Text} from 'react-native';

import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {radius} from '../theme/radius';
import {type} from '../theme/typography';
import {PrimaryButton} from './PrimaryButton';
import {SecondaryButton} from './SecondaryButton';

type Props = {
  version: string;
  onUpdate: () => void;
  onLater: () => void;
};

export function UpdateModal({version, onUpdate, onLater}: Props) {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onLater}>
      <Pressable accessibilityRole="button" onPress={onLater} style={[styles.scrim, {backgroundColor: colors.scrim}]}>
        <Pressable
          onPress={() => undefined}
          style={[styles.card, {backgroundColor: colors.surface, shadowColor: colors.textPrimary}]}>
          <Text style={[type.headline, {color: colors.textPrimary}]}>{copy.updateTitle}</Text>
          <Text style={[type.body, styles.body, {color: colors.textSecondary}]}>
            {copy.updateBody.replace('{version}', version)}
          </Text>
          <PrimaryButton title={copy.updateNow} onPress={onUpdate} />
          <SecondaryButton title={copy.later} onPress={onLater} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    borderRadius: radius.lg,
    padding: 22,
    gap: 12,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 10},
    elevation: 8,
  },
  body: {marginBottom: 4},
});
