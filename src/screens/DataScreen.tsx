import {ScrollView, StyleSheet, Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {settingsColors} from '../components/settings/SettingsChrome';
import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';
import {type} from '../theme/typography';

export function DataScreen() {
  const copy = uiCopy(useSettingsStore(state => state.language));
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.title, styles.title]}>{copy.dataTitle}</Text>
        <Text style={styles.body}>{copy.dataBody}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: settingsColors.page},
  content: {padding: 20, gap: 14},
  title: {color: settingsColors.ink},
  body: {...type.body, color: settingsColors.ink},
});
