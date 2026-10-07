const OVERPASS_LIMIT = 2;

let active = 0;
const waiting: Array<() => void> = [];

export async function withOverpass<T>(job: () => Promise<T>): Promise<T> {
  if (active >= OVERPASS_LIMIT) {
    await new Promise<void>(resolve => waiting.push(resolve));
  }
  active += 1;
  try {
    return await job();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

export async function mapLimit<T>(
  items: readonly T[],
  worker: (item: T) => Promise<boolean>,
  limit = OVERPASS_LIMIT,
): Promise<boolean> {
  if (items.length === 0) {
    return true;
  }
  let cursor = 0;
  let ok = true;
  const run = async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item === undefined) {
        continue;
      }
      if (!(await worker(item))) {
        ok = false;
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, () => run()));
  return ok;
}

export async function mapLimitVoid<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  limit = OVERPASS_LIMIT,
): Promise<void> {
  await mapLimit(
    items,
    async item => {
      await worker(item);
      return true;
    },
    limit,
  );
}
