/**
 * Bangla numeral & language utilities.
 * Digit conversion, number-to-words (BN/EN), and date formatting.
 */

const WEST_TO_BANGLA: Record<string, string> = {
  '0': '\u09E6',
  '1': '\u09E7',
  '2': '\u09E8',
  '3': '\u09E9',
  '4': '\u09EA',
  '5': '\u09EB',
  '6': '\u09EC',
  '7': '\u09ED',
  '8': '\u09EE',
  '9': '\u09EF',
};

const BANGLA_TO_WEST: Record<string, string> = Object.fromEntries(
  Object.entries(WEST_TO_BANGLA).map(([w, b]) => [b, w])
);

/**
 * Object to convert Western digits in a string to Bangla numerals.
 * When lang is BN, pass date strings and ID/numeric display values through toBangla().
 */
export const BanglaNumerals = {
  /** Map from Western digit character to Bangla numeral (U+09E6 to U+09EF). */
  map: { ...WEST_TO_BANGLA } as Readonly<Record<string, string>>,

  /**
   * Replaces each Western digit (0-9) in str with the corresponding Bangla numeral (০-৯).
   * Non-digit characters are unchanged. Safe for null/undefined (returns '-' for empty).
   */
  toBangla(str: string | null | undefined): string {
    if (str == null || str === '') return '-';
    return String(str)
      .split('')
      .map((c) => WEST_TO_BANGLA[c] ?? c)
      .join('');
  },

  /**
   * Replaces each Bangla numeral (০-৯) in str with the corresponding Western digit (0-9).
   * Non-Bangla-digit characters are unchanged. Returns '' for null/undefined/empty.
   */
  toWestern(str: string | null | undefined): string {
    if (str == null || str === '') return '';
    return String(str)
      .split('')
      .map((c) => BANGLA_TO_WEST[c] ?? c)
      .join('');
  },
};

// ── Bangla number words (1–100) ──────────────────────────────────────────────
export const BANGLA_WORDS: readonly string[] = [
  '', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়', 'দশ',
  'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ', 'বিশ',
  'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'উনত্রিশ', 'ত্রিশ',
  'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাতত্রিশ', 'আটত্রিশ', 'উনচল্লিশ', 'চল্লিশ',
  'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'উনপঞ্চাশ', 'পঞ্চাশ',
  'একান্ন', 'বায়ান্ন', 'তিপান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপান্ন', 'সাতান্ন', 'আটান্ন', 'উনষাট', 'ষাট',
  'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'উনসত্তর', 'সত্তর',
  'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'উনআশি', 'আশি',
  'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'উননব্বই', 'নব্বই',
  'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই', 'একশো',
];

export function toBanglaWords(n: number): string {
  if (n <= 0) return '';
  if (n <= 100) return BANGLA_WORDS[n];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const hundredPart = (hundreds === 1 ? 'একশো' : BANGLA_WORDS[hundreds] + 'শো');
  return remainder === 0 ? hundredPart : hundredPart + ' ' + BANGLA_WORDS[remainder];
}

// ── English number words ─────────────────────────────────────────────────────
export const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'] as const;
export const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'] as const;

export function toEnglishWords(n: number): string {
  if (n <= 0) return '';
  if (n < 20) return EN_ONES[n];
  if (n < 100) {
    const t = EN_TENS[Math.floor(n / 10)];
    const o = n % 10;
    return o ? `${t}-${EN_ONES[o]}` : t;
  }
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const hundredPart = `${EN_ONES[h]} hundred`;
  return rem === 0 ? hundredPart : `${hundredPart} ${toEnglishWords(rem)}`;
}

// ── Date formatting ──────────────────────────────────────────────────────────
export const BANGLA_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
] as const;
export const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export function formatDateBangla(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime())) return '';
  const d = date.getDate();
  const m = BANGLA_MONTHS[date.getMonth()];
  const y = date.getFullYear();
  return `${BanglaNumerals.toBangla(String(d))} ${m}, ${BanglaNumerals.toBangla(String(y))}`;
}

export function formatDateEnglish(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime())) return '';
  return `${ENGLISH_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
