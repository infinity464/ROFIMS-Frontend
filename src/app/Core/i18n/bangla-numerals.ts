/**
 * Converts Western digits (0-9) to Bangla numerals (০-৯) for display when lang is BN.
 * Use for dates, IDs, and numeric values only; no other files are changed by this module.
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
};
