/**
 * Rewrites text the way a narrator would read it, for the natural voices (Piper/Kokoro use eSpeak for phonemes,
 * which reads “$2.50” as “dollar two point five zero” and “Henry VIII” as “Henry roman eight”). Only patterns
 * eSpeak gets wrong are changed (checked against its output); things it already reads well (“Dr.”, “3rd”, “50%”,
 * “1,000,000”) are left alone. English only: other languages are returned unchanged.
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL_ONES = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];

/** 0–99 in words. */
function words99(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function ordinal99(n: number): string {
  if (n < 20) return ORDINAL_ONES[n];
  if (n % 10 === 0) return TENS[n / 10].replace(/y$/, 'ieth');
  return `${TENS[Math.floor(n / 10)]}-${ORDINAL_ONES[n % 10]}`;
}

const ROMAN_RE = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
function romanValue(s: string): number | null {
  if (!s || !ROMAN_RE.test(s)) return null;
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  for (let i = 0; i < s.length; i++) n += v[s[i]] < (v[s[i + 1]] ?? 0) ? -v[s[i]] : v[s[i]];
  return n;
}

const CURRENCY: Record<string, [string, string, string, string]> = {
  $: ['dollar', 'dollars', 'cent', 'cents'],
  '£': ['pound', 'pounds', 'penny', 'pence'],
  '€': ['euro', 'euros', 'cent', 'cents'],
};

const UNITS: Record<string, string> = {
  km: 'kilometers',
  kg: 'kilograms',
  cm: 'centimeters',
  mm: 'millimeters',
  mph: 'miles per hour',
  kph: 'kilometers per hour',
  ft: 'feet',
  lb: 'pounds',
  lbs: 'pounds',
  oz: 'ounces',
  '°C': 'degrees Celsius',
  '°F': 'degrees Fahrenheit',
};

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\be\.g\.,?/gi, 'for example,'],
  [/\bi\.e\.,?/gi, 'that is,'],
  [/\bvs\.?(?=\s)/gi, 'versus'],
  [/\bapprox\.(?=\s)/gi, 'approximately'],
  [/\bNo\.\s?(?=\d)/g, 'number '],
  [/\bpp\.\s?(?=\d)/g, 'pages '],
  [/\bp\.\s?(?=\d)/g, 'page '],
  [/\b[Ff]ig\.\s?(?=\d)/g, 'figure '],
  [/\b[Vv]ol\.\s?(?=\d)/g, 'volume '],
  [/\b[Cc]h\.\s?(?=\d)/g, 'chapter '],
];

const STRUCTURE_WORDS = 'Chapter|Part|Book|Volume|Act|Scene|Section|Letter|Canto|Article|Appendix';

export function normalizeForSpeech(text: string, language = 'en'): string {
  if (!/^en\b/i.test(language)) return text;
  let s = text;

  // Money: $5 → 5 dollars; $2.50 → 2 dollars and 50 cents; $3 million → 3 million dollars.
  s = s.replace(/([$£€])\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(\s(?:thousand|million|billion|trillion)\b)?/g, (_m, sym: string, whole: string, cents: string | undefined, scale: string | undefined) => {
    const [one, many, cent1, centMany] = CURRENCY[sym];
    const n = Number(whole.replace(/,/g, ''));
    if (scale) return `${whole}${scale} ${many}`;
    const main = `${whole} ${n === 1 ? one : many}`;
    if (!cents || cents === '00') return main;
    const c = Number(cents);
    return `${main} and ${c} ${c === 1 ? cent1 : centMany}`;
  });

  // Decades: 1990s → nineteen nineties; 1900s → nineteen hundreds; 2000s → two thousands; ’90s / 90s → nineties.
  s = s.replace(/\b(1[0-9]|20)(\d)0s\b/g, (_m, century: string, tens: string) => {
    const c = Number(century);
    const t = Number(tens);
    if (c === 20 && t === 0) return 'two thousands';
    if (t === 0) return `${words99(c)} hundreds`;
    return `${words99(c)} ${TENS[t].replace(/y$/, 'ies')}`;
  });
  s = s.replace(/(^|[\s(])[’']?([2-9])0s\b/g, (_m, pre: string, t: string) => `${pre}${TENS[Number(t)].replace(/y$/, 'ies')}`);

  // Roman numerals after structure words: “Chapter IV” → “Chapter 4”.
  s = s.replace(new RegExp(`\\b(${STRUCTURE_WORDS})\\s+([IVXLCDM]+)\\b`, 'g'), (m, word: string, roman: string) => {
    const n = romanValue(roman);
    return n ? `${word} ${n}` : m;
  });

  // Regnal numbers: “Henry VIII” → “Henry the Eighth” (Titlecase name, numeral of at least two letters, up to 30).
  s = s.replace(/\b([A-Z][a-z]+)\s+([IVX]{2,5})\b(?![’'][a-z])/g, (m, name: string, roman: string) => {
    if (new RegExp(`^(?:${STRUCTURE_WORDS})$`).test(name)) return m;
    const n = romanValue(roman);
    return n && n <= 30 ? `${name} the ${ordinal99(n).replace(/^./, (c) => c.toUpperCase())}` : m;
  });

  // Units after a number: 10 km → 10 kilometers.
  s = s.replace(/(\d)\s?(km|kg|cm|mm|mph|kph|ft|lbs?|oz|°C|°F)(?![\p{L}])/gu, (_m, d: string, unit: string) => `${d} ${UNITS[unit]}`);

  for (const [re, out] of ABBREVIATIONS) s = s.replace(re, out);
  return s.replace(/,\s*,/g, ',');
}
