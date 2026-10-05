/** Сворачивание приложения обрывает сетевой запрос. Поколение помечает старый цикл, чтобы он не дописывал статус. */
export class DownloadPaused extends Error {
  constructor() {
    super('download paused');
    this.name = 'DownloadPaused';
  }
}

let generation = 0;
let paused = false;
let pulse = 0;
const controllers = new Set<AbortController>();

export function noteDownloadPulse(): void {
  pulse = Date.now();
}

export function downloadStalled(): boolean {
  return paused || (pulse > 0 && Date.now() - pulse > 45_000);
}

export function clearDownloadPause(): void {
  paused = false;
}

export function pauseDownloads(): void {
  paused = true;
  generation += 1;
  for (const controller of controllers) {
    controller.abort();
  }
  controllers.clear();
}

export function downloadGeneration(): number {
  return generation;
}

export function isDownloadPaused(error: unknown): boolean {
  return error instanceof DownloadPaused;
}

export function trackAbort(controller: AbortController): () => void {
  controllers.add(controller);
  const drop = () => {
    controllers.delete(controller);
  };
  controller.signal.addEventListener('abort', drop);
  return drop;
}

export function throwIfPaused(stamp: number): void {
  if (stamp !== generation) {
    throw new DownloadPaused();
  }
}
