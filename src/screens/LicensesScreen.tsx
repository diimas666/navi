import {Linking, ScrollView, StyleSheet, Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {Card, SettingsRow} from '../components/settings/SettingsChrome';
import {licenseById, licenses} from '../constants/licenses';
import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';
import type {RootStackParamList} from '../navigation/types';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type ListProps = NativeStackScreenProps<RootStackParamList, 'Licenses'>;
type NoticeProps = NativeStackScreenProps<RootStackParamList, 'LicenseNotice'>;

export function LicensesScreen({navigation}: ListProps) {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={[styles.body, {color: colors.textPrimary}]}>{copy.osmBody}</Text>
          <SettingsRow
            title={copy.osmRights}
            color={colors.accent}
            onPress={() => {
              Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => undefined);
            }}
          />
        </Card>
        <Card>
          {licenses.map(entry => (
            <SettingsRow
              key={entry.id}
              title={entry.title}
              detail={entry.detail}
              onPress={() => navigation.navigate('LicenseNotice', {id: entry.id})}
              trailing={<Text style={[styles.chevron, {color: colors.textMuted}]}>›</Text>}
            />
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

export function LicenseNoticeScreen({route}: NoticeProps) {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  const entry = licenseById(route.params.id);
  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={[styles.body, {color: colors.textPrimary}]}>{entry?.notice ?? copy.licenseMissing}</Text>
          {entry ? (
            <SettingsRow
              title={copy.licenseText}
              color={colors.accent}
              onPress={() => {
                Linking.openURL(entry.url).catch(() => undefined);
              }}
            />
          ) : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {padding: 16, gap: 12},
  body: {...type.body, paddingVertical: 8},
  chevron: {fontSize: 22},
});
