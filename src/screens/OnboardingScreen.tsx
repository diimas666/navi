import {useState} from 'react';
import {Image, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {PrimaryButton} from '../components/PrimaryButton';
import {uiCopy} from '../i18n/uiCopy';
import {RegionDownloadList} from '../components/RegionDownloadList';
import {SecondaryButton} from '../components/SecondaryButton';
import type {RootStackParamList} from '../navigation/types';
import {useMapStore} from '../store/mapStore';
import {saveSettings, selectPersisted} from '../services/settings/SettingsRepository';
import {useSettingsStore} from '../store/settingsStore';
import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

function pagesFor(copy: ReturnType<typeof uiCopy>) {
  return [
    {
      title: 'Navi',
      body: copy.onboardReady,
      image: require('../assets/onboarding/mark.jpg'),
    },
    {
      title: copy.onboardGps,
      body: copy.onboardGpsBody,
      image: require('../assets/onboarding/gps.jpg'),
    },
    {
      title: copy.onboardLost,
      body: copy.onboardLostBody,
      image: require('../assets/onboarding/signal.jpg'),
    },
    {
      title: copy.onboardError,
      body: copy.onboardErrorBody,
      image: require('../assets/onboarding/uncertainty.jpg'),
    },
    {
      title: copy.onboardObd,
      body: copy.onboardObdBody,
      image: require('../assets/onboarding/obd.jpg'),
    },
  ];
}

export function OnboardingScreen({navigation}: Props) {
  const {colors} = useTheme();
  const {height} = useWindowDimensions();
  const heroHeight = Math.round(height * 0.48);
  const copy = uiCopy(useSettingsStore(state => state.language));
  const pages = pagesFor(copy);
  const [index, setIndex] = useState(0);
  const [maps, setMaps] = useState(false);
  const downloaded = useMapStore(state =>
    Object.values(state.regions).some(region => region.status === 'downloaded'),
  );
  const page = pages[index];
  const steps = pages.length + 1;

  const finish = () => {
    useSettingsStore.getState().setOnboarded(true);
    saveSettings(selectPersisted(useSettingsStore.getState())).catch(() => undefined);
    navigation.replace('Permissions');
  };

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <View style={styles.progress}>
        {Array.from({length: steps}, (_, itemIndex) => (
          <View
            key={itemIndex}
            style={[
              styles.segment,
              {
                backgroundColor:
                  itemIndex <= (maps ? pages.length : index) ? colors.accent : colors.border,
              },
            ]}
          />
        ))}
      </View>
      {maps ? (
        <View style={styles.maps}>
          <Text style={[type.title, {color: colors.textPrimary}]}>{copy.onboardRegion}</Text>
          <RegionDownloadList />
          <PrimaryButton title={copy.continue} disabled={!downloaded} onPress={finish} />
          <SecondaryButton title={copy.later} onPress={finish} />
        </View>
      ) : (
        <>
          <Animated.View
            key={page.title}
            entering={FadeIn.duration(420)}
            style={[styles.hero, {height: heroHeight}]}>
            <Image source={page.image} resizeMode="cover" style={styles.image} />
          </Animated.View>
          <Animated.View key={`${page.title}-copy`} entering={FadeInDown.duration(380)} style={styles.copy}>
            <Text style={[type.display, {color: colors.textPrimary}]}>{page.title}</Text>
            <Text style={[type.body, {color: colors.textSecondary}]}>{page.body}</Text>
          </Animated.View>
          <View style={styles.footer}>
            <PrimaryButton
              title={copy.next}
              onPress={() => {
                if (index === pages.length - 1) {
                  setMaps(true);
                } else {
                  setIndex(current => current + 1);
                }
              }}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  progress: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 24,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
  },
  hero: {
    marginTop: 16,
    marginHorizontal: 12,
    borderRadius: 32,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: 24,
  },
  maps: {
    flex: 1,
    gap: 12,
    paddingTop: 16,
    paddingHorizontal: 24,
  },
});
