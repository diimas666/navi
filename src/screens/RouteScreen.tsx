import {useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {PrimaryButton} from '../components/PrimaryButton';
import {SAVED_PLACE_KINDS, savedPlaceTitle} from '../constants/places';
import {resolveLanguage} from '../i18n/settingsCopy';
import {uiCopy} from '../i18n/uiCopy';
import type {Place} from '../models/domain';
import type {RootStackParamList} from '../navigation/types';
import {searchPlaces, searchPlacesOnline} from '../services/maps/Geocoder';
import {startTripTo} from '../services/navigation/startTrip';
import {usePlacesStore} from '../store/placesStore';
import {useSettingsStore} from '../store/settingsStore';
import {useSessionStore} from '../store/sessionStore';
import {useUiStore} from '../store/uiStore';
import {radius} from '../theme/radius';
import {useTheme} from '../theme/ThemeProvider';
import {type} from '../theme/typography';
import {formatDistance, formatDuration} from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Route'>;

export function RouteScreen({navigation}: Props) {
  const {colors} = useTheme();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [routeText, setRouteText] = useState<string | null>(null);
  const route = useSessionStore(state => state.route);
  const saved = usePlacesStore(state => state.places);
  const extra = usePlacesStore(state => state.extra);
  const language = resolveLanguage(useSettingsStore(state => state.language));
  const copy = uiCopy(language);

  const lookup = async (value: string) => {
    setQuery(value);
    const local = searchPlaces(value);
    const houses = local.filter(place => place.kind === 'house');
    const other = local.filter(place => place.kind !== 'house');
    if (value.trim().length < 3) {
      setPlaces(local);
      return;
    }
    try {
      const remote = await searchPlacesOnline(value);
      const seen = new Set(remote.map(place => place.id));
      setPlaces([...houses, ...remote, ...other.filter(place => !seen.has(place.id))].slice(0, 8));
    } catch {
      setPlaces(local);
    }
  };

  const choose = (place: Place) => {
    startTripTo(place)
      .then(result => {
        if (result === 'missing') {
          setRouteText(null);
          return;
        }
        const planned = useSessionStore.getState().route;
        setRouteText(
          planned
            ? `${place.name}: ${formatDistance(planned.distanceM)}, ${copy.about} ${formatDuration(planned.durationS)}`
            : place.name,
        );
        setPlaces([]);
      })
      .catch(() => undefined);
  };

  return (
    <SafeAreaView style={[styles.screen, {backgroundColor: colors.background}]}>
      <Text style={[type.title, {color: colors.textPrimary}]}>{copy.where}</Text>
      <View style={styles.saved}>
        {SAVED_PLACE_KINDS.map(kind => {
          const place = saved[kind.id];
          return (
            <Pressable
              key={kind.id}
              accessibilityRole="button"
              onPress={() => {
                if (!place) {
                  useUiStore.getState().showToast(copy.missingAddress);
                  return;
                }
                choose({
                  id: place.kind,
                  name: place.name,
                  latitude: place.latitude,
                  longitude: place.longitude,
                  kind: place.kind,
                });
              }}
              style={[
                styles.chip,
                {backgroundColor: place ? colors.accentSoft : colors.surface},
              ]}>
              <Text style={[type.caption, {color: place ? colors.accent : colors.textMuted}]}>
                {savedPlaceTitle(kind.id, language)}
              </Text>
            </Pressable>
          );
        })}
        {extra.map(place => (
          <Pressable
            key={place.id}
            accessibilityRole="button"
            onPress={() =>
              choose({
                id: place.id,
                name: place.name,
                latitude: place.latitude,
                longitude: place.longitude,
                kind: 'custom',
              })
            }
            style={[styles.chip, {backgroundColor: colors.accentSoft}]}>
            <Text style={[type.caption, {color: colors.accent}]}>{place.title}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={query}
        onChangeText={value => {
          lookup(value).catch(() => undefined);
        }}
        placeholder={copy.placeHint}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, {color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface}]}
      />
      <FlatList
        data={places}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <Text onPress={() => choose(item)} style={[type.body, styles.place, {color: colors.textPrimary}]}>
            {item.name}
          </Text>
        )}
      />
      {routeText ? <Text style={[type.body, {color: colors.textSecondary}]}>{routeText}</Text> : null}
      <View style={styles.steps}>
        {(route?.steps ?? []).slice(0, 6).map(step => (
          <Text key={`${step.name}-${step.distanceM}`} style={[type.caption, {color: colors.textSecondary}]}>
            {step.name} · {formatDistance(step.distanceM)}
          </Text>
        ))}
      </View>
      <PrimaryButton title={copy.toMap} onPress={() => navigation.navigate('Main', {screen: 'Map'})} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, padding: 20, gap: 14},
  saved: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8},
  input: {borderWidth: 1, borderRadius: radius.md, minHeight: 52, paddingHorizontal: 14},
  place: {paddingVertical: 12},
  steps: {gap: 6},
});
