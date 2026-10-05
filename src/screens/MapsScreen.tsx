import {StyleSheet, Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {RegionDownloadList} from '../components/RegionDownloadList';
import {uiCopy} from '../i18n/uiCopy';
import type {RootStackParamList} from '../navigation/types';
import {useMapStore} from '../store/mapStore';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Maps'>;

export function MapsScreen({route}: Props) {
  const {colors} = useTheme();
  const online = useMapStore(state => state.online);
  const copy = uiCopy(useSettingsStore(state => state.language));

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <Text style={[type.title, styles.title, {color: colors.textPrimary}]}>{copy.mapsTitle}</Text>
      <Text style={[type.body, styles.lead, {color: colors.textSecondary}]}>
        {copy.mapsLead}
        {online ? '' : copy.mapsOffline}
      </Text>
      <RegionDownloadList need={route.params?.need ?? []} />
      <Text style={[type.caption, styles.note, {color: colors.textMuted}]}>© OpenStreetMap contributors</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, paddingHorizontal: 20},
  title: {paddingTop: 12},
  lead: {paddingVertical: 12},
  note: {textAlign: 'center', paddingBottom: 12},
});