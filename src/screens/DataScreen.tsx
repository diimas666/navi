import {ScrollView, StyleSheet, Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

export function DataScreen() {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.title, {color: colors.textPrimary}]}>{copy.dataTitle}</Text>
        <Text style={[type.body, {color: colors.textPrimary}]}>{copy.dataBody}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {padding: 20, gap: 14},
});
