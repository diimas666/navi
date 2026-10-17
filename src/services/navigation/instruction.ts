export function loosenInstruction(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/(Поверн[іиа]т[еь])(?=на)/gi, '$1 ')
    .replace(/(налево|направо|наліво|ліворуч|праворуч)(?=на)/gi, '$1 ')
    .replace(/на(?=вул)/gi, 'на ')
    .replace(/вул\.(?=\S)/gi, 'вул. ')
    .replace(/ул\.(?=\S)/gi, 'ул. ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function streetFromInstruction(text: string): string {
  const loose = loosenInstruction(text);
  const cut = loose
    .replace(/^(направляйтесь|прямуйте|рухайтеся|двигайтесь|head)\s+(на|to|в)\s+\S+\s+(по|on|toward)\s+/i, '')
    .replace(/\s+(в сторону|в напрямку|у напрямку|по направлению к|toward)\s+.*$/i, '')
    .replace(/^\d+([.,]\d+)?\s*(км|м)\s*/i, '')
    .replace(/^(через|за)\s+\d+([.,]\d+)?\s*(км|м|метров|метрів)\.?\s*/i, '')
    .replace(/^(продовжуйте|продолжайте|прямуйте|следуйте|їдьте|едьте|рухайтеся|двигайтесь)\s+/i, '')
    .replace(/^(поверн\S*)\s+/i, '')
    .replace(/^(наліво|налево|направо|ліворуч|праворуч|прямо)\s+/i, '')
    .replace(/^(onto|on|to)\s+/i, '')
    .replace(/^на\s+/i, '')
    .replace(/^[·•\-–]\s*/, '')
    .trim();
  return shortStreet(cut || loose);
}

/**
 * One line for the driver: no road-sign remarks in brackets, no Latin twin after a slash,
 * no "рух по" lead-in. "рух по вулиця Велика Васильківська (знаки …)" → "вулиця Велика Васильківська".
 */
export function shortStreet(text: string): string {
  let cut = text;
  while (/\([^()]*\)/.test(cut)) {
    cut = cut.replace(/\s*\([^()]*\)/g, '');
  }
  cut = cut
    .replace(/\s*\(.*$/, '')
    .replace(/^(рух|движение|їдьте|едьте)\s+(по|на)\s+/i, '')
    .split(/\s*\/\s*/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return cut || text.trim();
}

const STREET_WORDS: Array<[RegExp, string]> = [
  [/(^|\s)(вулиця|улица)(?=\s|$)/i, '$1вул.'],
  [/(^|\s)проспект(?=\s|$)/i, '$1просп.'],
  [/(^|\s)(провулок|переулок)(?=\s|$)/i, '$1пров.'],
  [/(^|\s)бульвар(?=\s|$)/i, '$1бульв.'],
  [/(^|\s)(площа|площадь)(?=\s|$)/i, '$1пл.'],
  [/(^|\s)(набережна|набережная)(?=\s|$)/i, '$1наб.'],
];

/** The banner has one line. Street kind words shrink to sign abbreviations. Speech keeps full words. */
export function abbreviateStreet(name: string): string {
  return STREET_WORDS.reduce((text, [pattern, short]) => text.replace(pattern, short), name);
}

export function modifierFromInstruction(
  text: string,
): 'left' | 'right' | 'uturn' | 'straight' | undefined {
  const loose = loosenInstruction(text).toLowerCase();
  if (/розворот|разворот|u-?turn/.test(loose)) {
    return 'uturn';
  }
  if (/наліво|налево|ліворуч|left/.test(loose)) {
    return 'left';
  }
  if (/направо|праворуч|right/.test(loose)) {
    return 'right';
  }
  if (/прямо|straight|продовж|продолж/.test(loose)) {
    return 'straight';
  }
  return undefined;
}

export function formatDriveMeters(meters: number): string {
  const value = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  if (value >= 1000) {
    const km = value >= 9950 ? String(Math.round(value / 1000)) : (value / 1000).toFixed(1).replace('.', ',');
    return `${km} км`;
  }
  const rounded = value > 40 ? Math.round(value / 10) * 10 : Math.round(value);
  return `${rounded} м`;
}
