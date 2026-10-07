import {createContext, useContext, useMemo, type ReactNode} from 'react';
import {useColorScheme} from 'react-native';

import {useSettingsStore} from '../store/settingsStore';
import {darkColors, lightColors, type Palette} from './colors';

type ThemeValue = {
  colors: Palette;
  mode: 'dark' | 'light';
};

export function resolveMode(preference: 'light' | 'dark' | 'system', scheme: string | null | undefined): 'dark' | 'light' {
  if (preference === 'dark') {
    return 'dark';
  }
  if (preference === 'light') {
    return 'light';
  }
  return scheme === 'dark' ? 'dark' : 'light';
}

const ThemeContext = createContext<ThemeValue>({
  colors: darkColors,
  mode: 'dark',
});

export function ThemeProvider({children}: {children: ReactNode}) {
  const preference = useSettingsStore(state => state.theme);
  const scheme = useColorScheme();
  const mode = resolveMode(preference, scheme);
  const value = useMemo<ThemeValue>(
    () => ({colors: mode === 'light' ? lightColors : darkColors, mode}),
    [mode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
