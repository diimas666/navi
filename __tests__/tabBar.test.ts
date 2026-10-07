import {tabBarCanHide} from '../src/navigation/FloatingTabBar';

test('trips and settings keep the tab bar during a drive', () => {
  expect(tabBarCanHide(true, 'Map')).toBe(true);
  expect(tabBarCanHide(true, 'Trips')).toBe(false);
  expect(tabBarCanHide(true, 'Settings')).toBe(false);
  expect(tabBarCanHide(false, 'Map')).toBe(false);
});
