/** Hermes treats a too-large JSON.parse as a fatal error, so size is checked first. */
export const MAX_JSON_CHARS = 750_000;
export const JSON_READ_MS = 18_000;

export function jsonTooBig(raw: string, maxChars = MAX_JSON_CHARS): boolean {
  return raw.length > maxChars;
}

export async function readBoundedJson(
  response: Response,
  maxChars = MAX_JSON_CHARS,
  abort?: () => void,
  timeoutMs = JSON_READ_MS,
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxChars) {
    abort?.();
    throw new Error('payload too big');
  }
  const text = await readResponseText(response, abort, timeoutMs);
  if (text.length > maxChars) {
    abort?.();
    throw new Error('payload too big');
  }
  return JSON.parse(text);
}

async function readResponseText(
  response: Response,
  abort?: () => void,
  timeoutMs = JSON_READ_MS,
): Promise<string> {
  if (timeoutMs <= 0) {
    return response.text();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.();
      reject(new Error('payload timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([response.text(), timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
