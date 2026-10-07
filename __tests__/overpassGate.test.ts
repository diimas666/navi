import {mapLimit} from '../src/services/maps/overpassGate';

test('mapLimit runs a few jobs at a time without dropping work', async () => {
  let peak = 0;
  let live = 0;
  const seen: number[] = [];
  const ok = await mapLimit(
    [1, 2, 3, 4, 5],
    async item => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise<void>(resolve => setTimeout(resolve, 8));
      seen.push(item);
      live -= 1;
      return item !== 4;
    },
    2,
  );
  expect(ok).toBe(false);
  expect(peak).toBeLessThanOrEqual(2);
  expect(seen.sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5]);
});
