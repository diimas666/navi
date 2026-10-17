import {jamNotice, jamText} from '../src/services/navigation/jamNotice';

const snap = (trust: string, trustReason: string, accuracy = 83, source = 'dr') => ({
  trust,
  trustReason,
  hasEstimate: true,
  accuracy,
  source,
});

test('trusted GPS shows nothing', () => {
  expect(jamNotice(snap('trusted', 'ok', 5, 'gps'))).toBeNull();
  expect(jamNotice(snap('degraded', 'degraded_accuracy', 70, 'gps'))).toBeNull();
  expect(jamNotice(null)).toBeNull();
});

test('jamming shows a rounded estimate', () => {
  const notice = jamNotice(snap('lost', 'no_fix', 83));
  expect(notice).toEqual({kind: 'jam', accuracyM: 80});
  expect(jamText(notice!, 'uk')).toBe('Глушіння GPS · ±80 м');
  expect(jamText(jamNotice(snap('lost', 'stale', 437))!, 'ru')).toBe('Глушение GPS · ±450 м');
});

test('a jump from the trusted track reads as spoofing', () => {
  const notice = jamNotice(snap('untrusted', 'unreachable_from_trusted', 30));
  expect(notice?.kind).toBe('spoof');
  expect(jamText(notice!, 'uk')).toBe('Підміна GPS · ±30 м');
});

test('without an estimate the last point is honest', () => {
  expect(jamText(jamNotice(snap('lost', 'no_fix', 0, 'held'))!, 'uk')).toBe('Глушіння GPS · остання точка');
});

test('the manual GPS check in settings is not jamming', () => {
  expect(jamNotice(snap('lost', 'gps_check'))).toBeNull();
});
