import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {DRStatus} from '../components/DRStatus';
import {GPSStatus} from '../components/GPSStatus';
import {PrimaryButton} from '../components/PrimaryButton';
import {SecondaryButton} from '../components/SecondaryButton';
import {StatusBadge} from '../components/StatusBadge';
import type {TrustLevel} from '../models/domain';
import {startOpenTrip} from '../services/navigation/startTrip';
import type {RootStackParamList} from '../navigation/types';
import {useMapStore} from '../store/mapStore';
import {useObdStore} from '../store/obdStore';
import {useSessionStore} from '../store/sessionStore';
import {uiCopy} from '../i18n/uiCopy';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({navigation}: Props) {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  const snapshot = useSessionStore(state => state.snapshot);
  const obdState = useObdStore(state => state.state);
  const downloaded = useMapStore(state =>
    Object.values(state.regions).some(region => region.status === 'downloaded'),
  );
  const trust = (snapshot?.trust ?? 'lost') as TrustLevel;

  const startTrip = async () => {
    const result = await startOpenTrip();
    if (result === 'denied') {
      navigation.navigate('Permissions');
      return;
    }
    if (result === 'ok') {
      navigation.navigate('Main', {screen: 'Map'});
    }
  };

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.display, {color: colors.textPrimary}]}>{copy.homeReady}</Text>
        <DRStatus active={snapshot?.source === 'dr'} untrusted={trust === 'untrusted'} />
        <Text style={[type.body, {color: colors.textSecondary}]}>
          {copy.homeLead}
        </Text>
        <GPSStatus trust={trust} />
        <StatusBadge
          label="OBD"
          value={obdState === 'ready' ? copy.obdOn : copy.obdOff}
          tone={obdState === 'ready' ? 'success' : 'muted'}
        />
        <StatusBadge
          label={copy.offlineMap}
          value={downloaded ? copy.regionReady : copy.baseRoads}
          tone={downloaded ? 'success' : 'warning'}
        />
        <StatusBadge label={copy.drLabel} value={copy.drOn} tone="success" />
        <PrimaryButton
          title={copy.startTrip}
          onPress={() => {
            startTrip().catch(() => undefined);
          }}
        />
        <View style={styles.grid}>
          <SecondaryButton title={copy.maps} onPress={() => navigation.navigate('Maps')} />
          <SecondaryButton title="OBD" onPress={() => navigation.navigate('OBD')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1},
  content: {padding: 20, gap: 14},
  grid: {gap: 10},
});
