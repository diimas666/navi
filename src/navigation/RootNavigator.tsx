import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {tripText} from '../i18n/tripCopy';
import {uiCopy} from '../i18n/uiCopy';
import {resolveLanguage} from '../i18n/settingsCopy';
import {openAdapterSetup} from './navigationRef';
import {useSettingsStore} from '../store/settingsStore';
import {useUiStore} from '../store/uiStore';
import {useTheme} from '../theme/ThemeProvider';
import {FloatingTabBar} from './FloatingTabBar';
import type {MainTabParamList, RootStackParamList} from './types';
import {DataScreen} from '../screens/DataScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {LegalScreen} from '../screens/LegalScreen';
import {LicenseNoticeScreen, LicensesScreen} from '../screens/LicensesScreen';
import {MapScreen} from '../screens/MapScreen';
import {MapsScreen} from '../screens/MapsScreen';
import {AdaptersScreen} from '../screens/AdaptersScreen';
import {OBDScreen} from '../screens/OBDScreen';
import {OnboardingScreen} from '../screens/OnboardingScreen';
import {PermissionsScreen} from '../screens/PermissionsScreen';
import {RouteScreen} from '../screens/RouteScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {SplashScreen} from '../screens/SplashScreen';
import {TripDetailScreen} from '../screens/TripDetailScreen';
import {TripsScreen} from '../screens/TripsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function renderTabBar(props: BottomTabBarProps) {
  return <FloatingTabBar {...props} />;
}

function MainTabs() {
  const copy = uiCopy(useSettingsStore(state => state.language));
  return (
    <Tabs.Navigator
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}>
      <Tabs.Screen name="Map" component={MapScreen} options={{title: copy.tabMap}} />
      <Tabs.Screen name="Trips" component={TripsScreen} options={{title: copy.tabTrips}} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{title: copy.tabSettings}} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const {colors} = useTheme();
  const copy = uiCopy(useSettingsStore(state => state.language));
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerStyle: {backgroundColor: colors.background},
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {color: colors.textPrimary, fontWeight: '600'},
        headerBackTitle: copy.back,
        headerBackTitleStyle: {fontSize: 17},
        headerBackButtonMenuEnabled: false,
        contentStyle: {backgroundColor: colors.background},
      }}>
      <Stack.Screen name="Splash" component={SplashScreen} options={{headerShown: false}} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{headerShown: false}} />
      <Stack.Screen name="Permissions" component={PermissionsScreen} options={{title: copy.permissions}} />
      <Stack.Screen name="Main" component={MainTabs} options={{headerShown: false}} />
      <Stack.Screen name="Home" component={HomeScreen} options={{title: copy.trip}} />
      <Stack.Screen name="Maps" component={MapsScreen} options={{title: copy.maps}} />
      <Stack.Screen name="Route" component={RouteScreen} options={{title: copy.route}} />
      <Stack.Screen name="OBD" component={OBDScreen} options={{title: 'OBD'}} />
      <Stack.Screen name="Adapters" component={AdaptersScreen} options={{title: ''}} />
      <Stack.Screen name="Data" component={DataScreen} options={{title: copy.data}} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} options={{title: copy.trip}} />
      <Stack.Screen name="Legal" component={LegalScreen} options={{title: ''}} />
      <Stack.Screen name="Licenses" component={LicensesScreen} options={{title: copy.licenses}} />
      <Stack.Screen name="LicenseNotice" component={LicenseNoticeScreen} options={{title: copy.license}} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
  },
  card: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copy: {flex: 1, gap: 2},
  title: {fontSize: 15, fontWeight: '700'},
  body: {fontSize: 13, fontWeight: '600'},
  connect: {fontSize: 15, fontWeight: '700'},
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: {width: 12, height: 12, alignItems: 'center', justifyContent: 'center'},
  closeBar: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 1,
  },
  closeBarA: {transform: [{rotate: '45deg'}]},
  closeBarB: {transform: [{rotate: '-45deg'}]},
});

export function ToastBanner({message}: {message: string | null}) {
  const {colors} = useTheme();
  const language = resolveLanguage(useSettingsStore(state => state.language));
  if (!message) {
    return null;
  }
  const text = tripText(language);
  const adapter = message === text.adapter;
  const dismiss = () => useUiStore.getState().clearToast();
  const connect = () => {
    dismiss();
    openAdapterSetup();
  };
  return (
    <View style={styles.toast} pointerEvents="box-none">
      <View style={[styles.card, {backgroundColor: colors.surface}]}>
        <View style={styles.copy}>
          <Text style={[styles.title, {color: colors.textPrimary}]}>{message}</Text>
          {adapter ? <Text style={[styles.body, {color: colors.textSecondary}]}>{text.adapterBody}</Text> : null}
          {adapter ? (
            <Pressable accessibilityRole="button" onPress={connect} hitSlop={8}>
              <Text style={[styles.connect, {color: colors.accent}]}>{text.connect}</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={text.dismiss} onPress={dismiss} hitSlop={8} style={[styles.close, {backgroundColor: colors.surfaceMuted}]}>
          <View style={styles.closeGlyph}>
            <View style={[styles.closeBar, styles.closeBarA, {backgroundColor: colors.textPrimary}]} />
            <View style={[styles.closeBar, styles.closeBarB, {backgroundColor: colors.textPrimary}]} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
