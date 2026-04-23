export type DatePrecision = 'D' | 'M' | 'Y';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a stored date + precision indicator for display.
 *   precision 'D' -> "12 Apr 1985"
 *   precision 'M' -> "Apr 1985"
 *   precision 'Y' -> "1985"
 * NULL/missing precision is treated as 'D' so legacy rows render as before.
 */
export function formatPartialDate(value: Date | string | null | undefined, precision: DatePrecision | null | undefined): string {
    if (value == null || value === '') return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    const p: DatePrecision = precision === 'Y' || precision === 'M' || precision === 'D' ? precision : 'D';
    const y = d.getFullYear();
    if (p === 'Y') return String(y);
    const m = MONTH_SHORT[d.getMonth()];
    if (p === 'M') return `${m} ${y}`;
    return `${d.getDate()} ${m} ${y}`;
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
