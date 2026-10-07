import {
  DownloadPaused,
  clearDownloadPause,
  downloadGeneration,
  downloadStalled,
  isDownloadPaused,
  noteDownloadPulse,
  pauseDownloads,
  throwIfPaused,
} from '../src/services/maps/downloadPause';

beforeEach(() => {
  pauseDownloads();
  clearDownloadPause();
  noteDownloadPulse();
});

test('a fresh pulse is not a stall', () => {
  expect(downloadStalled()).toBe(false);
});

test('no pulse for 45 seconds counts as stalled', () => {
  const now = Date.now();
  const spy = jest.spyOn(Date, 'now').mockReturnValue(now + 46_000);
  expect(downloadStalled()).toBe(true);
  spy.mockRestore();
});

test('pause bumps generation so an old fetch cannot finish', () => {
  const stamp = downloadGeneration();
  expect(() => throwIfPaused(stamp)).not.toThrow();
  pauseDownloads();
  expect(() => throwIfPaused(stamp)).toThrow(DownloadPaused);
  expect(isDownloadPaused(new DownloadPaused())).toBe(true);
  expect(isDownloadPaused(new Error('network'))).toBe(false);
  clearDownloadPause();
});
