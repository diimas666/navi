import {darkColors, lightColors} from '../src/theme/colors';
import {resolveMode} from '../src/theme/ThemeProvider';

test('explicit theme wins over the system scheme', () => {
  expect(resolveMode('light', 'dark')).toBe('light');
  expect(resolveMode('dark', 'light')).toBe('dark');
});

test('system follows the device scheme and defaults to light', () => {
  expect(resolveMode('system', 'dark')).toBe('dark');
  expect(resolveMode('system', 'light')).toBe('light');
  expect(resolveMode('system', null)).toBe('light');
});

test('search text stays readable on the same theme surface', () => {
  expect(lightColors.textPrimary).not.toBe(lightColors.backgroundRaised);
  expect(lightColors.textPrimary).not.toBe(lightColors.surface);
  expect(darkColors.textPrimary).not.toBe(darkColors.backgroundRaised);
  expect(darkColors.textPrimary).not.toBe(darkColors.surface);
});
