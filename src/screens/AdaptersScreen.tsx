import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useLayoutEffect} from 'react';

import {Card} from '../components/settings/SettingsChrome';
import {resolveLanguage, settingsCopy} from '../i18n/settingsCopy';
import type {RootStackParamList} from '../navigation/types';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Adapters'>;

export function AdaptersScreen({navigation}: Props) {
  const {colors} = useTheme();
  const text = settingsCopy(resolveLanguage(useSettingsStore(state => state.language)));
  useLayoutEffect(() => {
    navigation.setOptions({title: text.whichAdapters});
  }, [navigation, text.whichAdapters]);

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.lead, {color: colors.textPrimary}]}>{text.adaptersLead}</Text>
        <Card>
          {text.adapterModels.map((model, index) => (
            <View
              key={model.name}
              style={index === 0 ? styles.row : [styles.row, styles.line, {borderTopColor: colors.border}]}>
              <Text style={[styles.model, {color: colors.textPrimary}]}>{model.name}</Text>
              <Text style={[styles.hint, {color: colors.textMuted}]}>{model.hint}</Text>
            </View>
          ))}
        </Card>
        <Text style={[styles.miss, {color: colors.textMuted}]}>{text.adaptersMiss}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {padding: 20, gap: 14},
  lead: {...type.body},
  row: {paddingVertical: 12, gap: 4},
  model: {...type.bodyStrong},
  hint: {...type.caption},
  line: {borderTopWidth: StyleSheet.hairlineWidth},
  miss: {...type.body},
});
