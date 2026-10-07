import {parseStoreLookup, readUpdateSnooze, shouldOfferUpdate, versionAhead} from '../src/services/appUpdate';

test('a higher store version is an update', () => {
  expect(versionAhead('1.0.1', '1.0.0')).toBe(true);
  expect(versionAhead('1.1', '1.0.9')).toBe(true);
  expect(versionAhead('1.0.0', '1.0.0')).toBe(false);
  expect(versionAhead('1.0.0', '1.0.1')).toBe(false);
});

test('App Store lookup is ignored until a newer build is live', () => {
  expect(parseStoreLookup({resultCount: 0, results: []}, '1.0.0')).toBeNull();
  expect(
    parseStoreLookup(
      {resultCount: 1, results: [{version: '1.0.0', trackViewUrl: 'https://apps.apple.com/app/id1'}]},
      '1.0.0',
    ),
  ).toBeNull();
  const found = parseStoreLookup(
    {resultCount: 1, results: [{version: '1.0.2', trackId: 12, trackViewUrl: 'https://apps.apple.com/app/id12'}]},
    '1.0.0',
  );
  expect(found?.version).toBe('1.0.2');
  expect(found?.storeUrl).toContain('id12');
});

test('later hides the same version until the snooze ends', () => {
  const store = {version: '1.1.0', storeUrl: 'https://apps.apple.com/app/id1'};
  expect(shouldOfferUpdate(store, {version: '1.1.0', until: 2_000}, 1_000)).toBe(false);
  expect(shouldOfferUpdate(store, {version: '1.1.0', until: 500}, 1_000)).toBe(true);
  expect(shouldOfferUpdate(store, {version: '1.0.9', until: 2_000}, 1_000)).toBe(true);
  expect(shouldOfferUpdate(null, null)).toBe(false);
});

test('a broken snooze payload is ignored', () => {
  expect(readUpdateSnooze(null)).toBeNull();
  expect(readUpdateSnooze('{')).toBeNull();
  expect(readUpdateSnooze('{"version":"1.1.0","until":9}')).toEqual({version: '1.1.0', until: 9});
});
