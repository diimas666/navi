import {useLayoutEffect} from 'react';
import {Linking, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {settingsColors} from '../components/settings/SettingsChrome';
import {legalDocument, SUPPORT_EMAIL} from '../i18n/legalCopy';
import type {RootStackParamList} from '../navigation/types';
import {useSettingsStore} from '../store/settingsStore';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

export function LegalScreen({navigation, route}: Props) {
  const document = legalDocument(useSettingsStore(state => state.language), route.params.document);
  useLayoutEffect(() => {
    navigation.setOptions({title: document.title});
  }, [document.title, navigation]);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{document.updated}</Text>
        {document.sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.heading}>{section.title}</Text>
            {section.paragraphs.map(paragraph => (
              <Paragraph key={paragraph} text={paragraph} />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Paragraph({text}: {text: string}) {
  const emailAt = text.indexOf(SUPPORT_EMAIL);
  if (emailAt < 0) {
    return <Text style={styles.body}>{text}</Text>;
  }
  const before = text.slice(0, emailAt);
  const after = text.slice(emailAt + SUPPORT_EMAIL.length);
  return (
    <Text style={styles.body}>
      {before}
      <Text
        style={styles.mail}
        onPress={() => {
          Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => undefined);
        }}>
        {SUPPORT_EMAIL}
      </Text>
      {after}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: settingsColors.page},
  content: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 18},
  updated: {...type.caption, color: settingsColors.muted},
  section: {gap: 8},
  heading: {...type.bodyStrong, color: settingsColors.ink, fontSize: 18},
  body: {...type.body, color: settingsColors.ink},
  mail: {color: settingsColors.link, fontWeight: '700'},
});
