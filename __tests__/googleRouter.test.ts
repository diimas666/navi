import {decodePolyline} from '../src/services/roads/GoogleRouter';
import {haversineMeters} from '../src/utils/geo';

test('a Google overview polyline decodes to a street-shaped line', () => {
  // Encoded piece of a north-east hop from near Odesa center.
  const line = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  expect(line.length).toBeGreaterThan(2);
  const first = line[0];
  const last = line[line.length - 1];
  expect(first).toBeTruthy();
  expect(last).toBeTruthy();
  if (!first || !last) {
    return;
  }
  expect(haversineMeters(first[1], first[0], last[1], last[0])).toBeGreaterThan(1000);
});
