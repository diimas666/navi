/** OpenFreeMap serves one file per font. A fallback stack 404s. */
export const MAP_FONT_REGULAR = ['Noto Sans Regular'];
export const MAP_FONT_BOLD = ['Noto Sans Bold'];

const KNOWN = new Set(['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic']);

export function mapFontStack(stack: unknown): string[] {
  if (!Array.isArray(stack)) {
    return MAP_FONT_REGULAR;
  }
  const names = stack.filter((name): name is string => typeof name === 'string' && name.length > 0);
  const known = names.find(name => KNOWN.has(name));
  if (known) {
    return [known];
  }
  return names[0] ? [names[0]] : MAP_FONT_REGULAR;
}
