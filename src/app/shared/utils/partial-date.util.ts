export type DatePrecision = 'D' | 'M' | 'Y';
export type DateLang = 'en' | 'bn';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_SHORT_BN = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলা', 'আগ', 'সেপ্ট', 'অক্টো', 'নভে', 'ডিসে'];
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

const toBanglaDigits = (s: string | number): string => String(s).replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

/**
 * Formats a stored date + precision indicator for display.
 *   precision 'D' -> "12 Apr 1985"  (bn: "১২ এপ্রি ১৯৮৫")
 *   precision 'M' -> "Apr 1985"
 *   precision 'Y' -> "1985"
 * NULL/missing precision is treated as 'D' so legacy rows render as before.
 * Pass lang='bn' to render Bangla month names and numerals.
 */
export function formatPartialDate(value: Date | string | null | undefined, precision: DatePrecision | null | undefined, lang: DateLang = 'en'): string {
    if (value == null || value === '') return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    const p: DatePrecision = precision === 'Y' || precision === 'M' || precision === 'D' ? precision : 'D';
    const bn = lang === 'bn';
    const y = bn ? toBanglaDigits(d.getFullYear()) : String(d.getFullYear());
    if (p === 'Y') return y;
    const m = bn ? MONTH_SHORT_BN[d.getMonth()] : MONTH_SHORT[d.getMonth()];
    if (p === 'M') return `${m} ${y}`;
    const day = bn ? toBanglaDigits(d.getDate()) : String(d.getDate());
    return `${day} ${m} ${y}`;
}

/** Normalizes any Date/string into YYYY-MM-DD, snapping day/month to 1 based on precision. */
export function toDateOnlyWithPrecision(value: Date | string | null | undefined, precision: DatePrecision): string | null {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = precision === 'Y' ? 1 : d.getMonth() + 1;
    const day = precision === 'D' ? d.getDate() : 1;
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
