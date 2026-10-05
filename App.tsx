import {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import {NavigationContainer, DarkTheme, DefaultTheme} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {useAppServices} from './src/hooks/useAppServices';
import {navigationRef} from './src/navigation/navigationRef';
import {RootNavigator, ToastBanner} from './src/navigation/RootNavigator';
import {useUiStore} from './src/store/uiStore';
import {ThemeProvider, useTheme} from './src/theme/ThemeProvider';

function Shell() {
  useAppServices();
  const toast = useUiStore(state => state.toast);
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => useUiStore.getState().clearToast(), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <View style={styles.fill}>
      <RootNavigator />
      <ToastBanner message={toast} />
    </View>
  );
}

function ThemedNavigation() {
  const {colors, mode} = useTheme();
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        ...base,
        colors: {
          ...base.colors,
          background: colors.background,
          card: colors.backgroundRaised,
          primary: colors.accent,
          text: colors.textPrimary,
          border: colors.border,
        },
      }}>
      <Shell />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedNavigation />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
});
