/** Hermes treats a too-large JSON.parse as a fatal error, so size is checked first. */
export const MAX_JSON_CHARS = 750_000;

export function jsonTooBig(raw: string, maxChars = MAX_JSON_CHARS): boolean {
  return raw.length > maxChars;
}

export async function readBoundedJson(
  response: Response,
  maxChars = MAX_JSON_CHARS,
  abort?: () => void,
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxChars) {
    abort?.();
    throw new Error('payload too big');
  }
  const text = await response.text();
  if (text.length > maxChars) {
    throw new Error('payload too big');
  }
  return JSON.parse(text);
}
