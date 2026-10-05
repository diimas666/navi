import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useLayoutEffect} from 'react';

import {Card, settingsColors} from '../components/settings/SettingsChrome';
import {resolveLanguage, settingsCopy} from '../i18n/settingsCopy';
import type {RootStackParamList} from '../navigation/types';
import {useSettingsStore} from '../store/settingsStore';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Adapters'>;

export function AdaptersScreen({navigation}: Props) {
  const text = settingsCopy(resolveLanguage(useSettingsStore(state => state.language)));
  useLayoutEffect(() => {
    navigation.setOptions({title: text.whichAdapters});
  }, [navigation, text.whichAdapters]);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>{text.adaptersLead}</Text>
        <Card>
          {text.adapterModels.map((model, index) => (
            <View key={model.name} style={index === 0 ? styles.row : [styles.row, styles.line]}>
              <Text style={styles.model}>{model.name}</Text>
              <Text style={styles.hint}>{model.hint}</Text>
            </View>
          ))}
        </Card>
        <Text style={styles.miss}>{text.adaptersMiss}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: settingsColors.page},
  content: {padding: 20, gap: 14},
  lead: {...type.body, color: settingsColors.ink},
  row: {paddingVertical: 12, gap: 4},
  model: {...type.bodyStrong, color: settingsColors.ink},
  hint: {...type.caption, color: settingsColors.muted},
  line: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: settingsColors.line},
  miss: {...type.body, color: settingsColors.muted},
});
