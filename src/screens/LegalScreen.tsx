import {useLayoutEffect} from 'react';
import {Linking, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {legalDocument, SUPPORT_EMAIL} from '../i18n/legalCopy';
import type {RootStackParamList} from '../navigation/types';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

export function LegalScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const document = legalDocument(useSettingsStore(state => state.language), route.params.document);
  useLayoutEffect(() => {
    navigation.setOptions({title: document.title});
  }, [document.title, navigation]);

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.updated, {color: colors.textMuted}]}>{document.updated}</Text>
        {document.sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.heading, {color: colors.textPrimary}]}>{section.title}</Text>
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
  const {colors} = useTheme();
  const emailAt = text.indexOf(SUPPORT_EMAIL);
  if (emailAt < 0) {
    return <Text style={[styles.body, {color: colors.textPrimary}]}>{text}</Text>;
  }
  const before = text.slice(0, emailAt);
  const after = text.slice(emailAt + SUPPORT_EMAIL.length);
  return (
    <Text style={[styles.body, {color: colors.textPrimary}]}>
      {before}
      <Text
        style={[styles.mail, {color: colors.accent}]}
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
  screen: {flex: 1},
  content: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 18},
  updated: {...type.caption},
  section: {gap: 8},
  heading: {...type.bodyStrong, fontSize: 18},
  body: {...type.body},
  mail: {fontWeight: '700'},
});
