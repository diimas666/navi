export type ParsedAddress = {
  street: string;
  number: string | null;
  letter: string | null;
};

const consonants = new Set('бвгґджзйклмнпрстфхцчшщbcdfghjklmnpqrstvwxyz'.split(''));

export function parseAddress(query: string): ParsedAddress {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  const match = /(?:^|\s)(\d+)\s*([a-zа-яіїєґ])?(?=\s|$)/i.exec(trimmed);
  if (!match || match.index == null) {
    return {street: trimmed, number: null, letter: null};
  }
  const street = `${trimmed.slice(0, match.index)} ${trimmed.slice(match.index + match[0].length)}`
    .replace(/\s+/g, ' ')
    .trim();
  return {
    street,
    number: match[1],
    letter: match[2] ? foldLetter(match[2]) : null,
  };
}

export function queryVariants(query: string): string[] {
  const typed = query.trim();
  const parsed = parseAddress(query);
  const streets = streetVariants(parsed.street || query);
  const house = houseForm(parsed);
  const variants: string[] = [];
  const push = (value: string) => {
    const next = value.trim();
    if (next && !variants.includes(next)) {
      variants.push(next);
    }
  };
  push(typed);
  const spoken = ukrainianQuery(typed);
  push(spoken);
  yizdSpellings(typed).forEach(push);
  yizdSpellings(spoken).forEach(push);
  const rawStreet = parsed.street.trim();
  ukrainianIForms(rawStreet).forEach(street => {
    push(house ? `${street} ${house}` : street);
  });
  if (rawStreet && house) {
    push(`${rawStreet} ${house}`);
  }
  if (house && parsed.letter && rawStreet && parsed.number) {
    push(`${rawStreet} ${parsed.number}-${parsed.letter}`);
  }
  if (rawStreet) {
    push(rawStreet);
  }
  streets.forEach(street => {
    push(house ? `${street} ${house}` : street);
  });
  return variants.slice(0, 8);
}

export function wantedHouse(query: string): string | null {
  const parsed = parseAddress(query);
  if (!parsed.number) {
    return null;
  }
  return `${parsed.number}${parsed.letter ?? ''}`;
}

export function matchesStreet(resultStreet: string, query: string): boolean {
  const parsed = parseAddress(query);
  const got = streetKey(resultStreet);
  const needle = streetKey(parsed.street || query);
  if (got.length < 3 || needle.length < 3) {
    return false;
  }
  if (got.includes(needle) || needle.includes(got)) {
    return true;
  }
  return needle.length >= 6 && got.length >= 6 && editDistance(needle, got) <= 1;
}

export function ukrainianQuery(value: string): string {
  let next = value;
  const towns: Array<[RegExp, string]> = [
    [/(^|[\s,])киев(?=[\s,]|$)/gi, '$1Київ'],
    [/(^|[\s,])одесса(?=[\s,]|$)/gi, '$1Одеса'],
    [/(^|[\s,])львов(?=[\s,]|$)/gi, '$1Львів'],
    [/(^|[\s,])харьков(?=[\s,]|$)/gi, '$1Харків'],
    [/(^|[\s,])днепр(?=[\s,]|$)/gi, '$1Дніпро'],
    [/(^|[\s,])николаев(?=[\s,]|$)/gi, '$1Миколаїв'],
  ];
  towns.forEach(([pattern, replacement]) => {
    next = next.replace(pattern, replacement);
  });
  const endings: Array<[RegExp, string]> = [
    [/инская/gi, 'інська'],
    [/овская/gi, 'івська'],
    [/евская/gi, 'євська'],
    [/ездная/gi, 'їзна'],
    [/ездна/gi, 'їзна'],
    [/цкая/gi, 'цька'],
    [/цкий/gi, 'цький'],
    [/ская/gi, 'ська'],
    [/ский/gi, 'ський'],
    [/ское/gi, 'ське'],
  ];
  endings.forEach(([pattern, replacement]) => {
    next = next.replace(pattern, replacement);
  });
  return next
    .replace(/ы/g, 'и')
    .replace(/Ы/g, 'И')
    .replace(/э/g, 'е')
    .replace(/Э/g, 'Е')
    .replace(/ё/g, 'є')
    .replace(/Ё/g, 'Є')
    .replace(/и/g, 'і')
    .replace(/И/g, 'І')
    .replace(/ъ/g, '');
}

export function sameHouse(got: string | undefined, wanted: string | null): boolean {
  if (!wanted || !got) {
    return false;
  }
  return foldHouse(got) === wanted;
}

export function normalizeAddress(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/є/g, 'е')
    .replace(/і/g, 'и')
    .replace(/ї/g, 'и')
    .replace(/ё/g, 'е')
    .replace(/ы/g, 'и')
    .replace(/э/g, 'е')
    .replace(/ґ/g, 'г')
    .replace(/a/g, 'а')
    .replace(/b/g, 'б')
    .replace(/e/g, 'е')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const commonOnsets = new Set([
  'бл', 'бр', 'вл', 'вр', 'гл', 'гр', 'дл', 'дн', 'др', 'жд', 'зв', 'зд', 'зл', 'зр',
  'кл', 'кн', 'кр', 'пл', 'пр', 'ск', 'сл', 'см', 'сн', 'сп', 'ст', 'св', 'тв', 'тр',
  'хл', 'хр', 'цв', 'чл', 'чн', 'шк', 'шл', 'шр',
]);

function ukrainianIForms(street: string): string[] {
  const chars = [...street];
  const index = chars.findIndex(char => char === 'и' || char === 'И');
  if (index < 0) {
    return [];
  }
  const next = [...chars];
  next[index] = chars[index] === 'И' ? 'І' : 'і';
  return [next.join('')];
}

export function streetKey(value: string): string {
  return stripKind(normalizeAddress(ukrainianQuery(value))).replace(/ь/g, '');
}

function streetVariants(street: string): string[] {
  const normalized = suffixToUkrainian(normalizeAddress(street));
  const foldedYizd = normalized.includes('езд') ? [normalized.replace(/езд/g, 'из')] : [];
  const leading = [...normalized];
  const onset = leading.length >= 2 ? `${leading[0]}${leading[1]}` : '';
  const repair = onset.length === 2 && !commonOnsets.has(onset);
  const repaired = repair ? firstGap(normalized).map(word => suffixToUkrainian(word)) : [];
  return unique([...repaired, ...foldedYizd, normalized].filter(item => item.length > 1));
}

function yizdSpellings(value: string): string[] {
  const found: string[] = [];
  const push = (next: string) => {
    if (next && next !== value && !found.includes(next)) {
      found.push(next);
    }
  };
  if (/їздн/i.test(value)) {
    push(value.replace(/їздн/gi, letters => (letters[0] === 'Ї' ? 'Їзн' : 'їзн')));
  }
  if (/іздн/i.test(value)) {
    push(value.replace(/іздн/gi, letters => (letters[0] === 'І' ? 'Ізн' : 'ізн')));
  }
  if (!/езд/i.test(value)) {
    return found;
  }
  if (/ездная/i.test(value)) {
    push(value.replace(/ездная/gi, letters => (letters[0] === 'Е' ? 'Їзна' : 'їзна')));
    push(value.replace(/ездная/gi, letters => (letters[0] === 'Е' ? 'Їздна' : 'їздна')));
  }
  push(value.replace(/езд/gi, letters => (letters[0] === 'Е' ? 'Їз' : 'їз')));
  push(value.replace(/езд/gi, letters => (letters[0] === 'Е' ? 'Їзд' : 'їзд')));
  return found;
}

function houseForm(parsed: ParsedAddress): string {
  if (!parsed.number) {
    return '';
  }
  return `${parsed.number}${parsed.letter ?? ''}`;
}

function suffixToUkrainian(value: string): string {
  return value
    .replace(/цкая$/g, 'цька')
    .replace(/ская$/g, 'ська')
    .replace(/цкий$/g, 'цький')
    .replace(/ский$/g, 'ський');
}

function firstGap(word: string): string[] {
  const chars = [...word];
  if (chars.length < 3 || !consonants.has(chars[0]) || !consonants.has(chars[1])) {
    return [];
  }
  return ['е', 'и'].map(vowel => `${chars[0]}${vowel}${chars.slice(1).join('')}`);
}

function stripKind(value: string): string {
  return value
    .replace(/(^|\s)(вулиця|улица|провулок|переулок|проспект|площа|майдан|бульвар)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function foldLetter(letter: string): string {
  const folded = normalizeAddress(letter);
  return folded.slice(0, 1);
}

function foldHouse(value: string): string {
  return normalizeAddress(value).replace(/[\s-]/g, '');
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
}

function editDistance(left: string, right: string): number {
  if (Math.abs(left.length - right.length) > 1) {
    return 2;
  }
  const rows = Array.from({length: left.length + 1}, (_, index) => [index]);
  for (let column = 1; column <= right.length; column += 1) {
    rows[0][column] = column;
  }
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost,
      );
    }
  }
  return rows[left.length][right.length];
}
