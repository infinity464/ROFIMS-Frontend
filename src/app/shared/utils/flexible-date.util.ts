/**
 * Parses a user-typed date string in one of the accepted flexible formats:
 *   - DD-MM-YYYY  (e.g. "25-04-2025")
 *   - DD/MM/YYYY  (e.g. "25/04/2025")
 *   - DDMMYYYY    (e.g. "25042025", 8 digits, zero-padded)
 *
 * Returns a Date at local midnight, or null if the input is empty, malformed,
 * out of range, or a non-existent calendar date (e.g. 31-02-2025).
 */
export function parseFlexibleDate(raw: string | null | undefined): Date | null {
    const clean = (raw ?? '').trim();
    if (!clean) return null;

    let dd: number | undefined;
    let mm: number | undefined;
    let yyyy: number | undefined;

    const sepMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (sepMatch) {
        dd = +sepMatch[1];
        mm = +sepMatch[2];
        yyyy = +sepMatch[3];
    } else {
        const compactMatch = clean.match(/^(\d{2})(\d{2})(\d{4})$/);
        if (compactMatch) {
            dd = +compactMatch[1];
            mm = +compactMatch[2];
            yyyy = +compactMatch[3];
        }
    }

    if (dd == null || mm == null || yyyy == null) return null;
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 1900 || yyyy > 2100) return null;

    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;

    return d;
}
