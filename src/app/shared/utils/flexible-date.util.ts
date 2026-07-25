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

/**
 * Parses month+year only, accepting:
 *   - MM-YYYY  ("02-2025")
 *   - MM/YYYY  ("02/2025")
 *   - MMYYYY   ("022025", 6 digits, zero-padded)
 * Returns a Date on day=1 of that month, or null if malformed.
 */
export function parseFlexibleMonthYear(raw: string | null | undefined): Date | null {
    const clean = (raw ?? '').trim();
    if (!clean) return null;

    let mm: number | undefined;
    let yyyy: number | undefined;

    const sepMatch = clean.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (sepMatch) {
        mm = +sepMatch[1];
        yyyy = +sepMatch[2];
    } else {
        const compactMatch = clean.match(/^(\d{2})(\d{4})$/);
        if (compactMatch) {
            mm = +compactMatch[1];
            yyyy = +compactMatch[2];
        }
    }

    if (mm == null || yyyy == null) return null;
    if (mm < 1 || mm > 12 || yyyy < 1900 || yyyy > 2100) return null;

    return new Date(yyyy, mm - 1, 1);
}

/**
 * Parses year only ("2025"). Returns a Date on Jan 1 of that year, or null if malformed.
 */
export function parseFlexibleYear(raw: string | null | undefined): Date | null {
    const clean = (raw ?? '').trim();
    if (!clean) return null;
    const m = clean.match(/^(\d{4})$/);
    if (!m) return null;
    const yyyy = +m[1];
    if (yyyy < 1900 || yyyy > 2100) return null;
    return new Date(yyyy, 0, 1);
}

/**
 * Tries all three flexible formats (full date → month-year → year) and returns the first that parses.
 * Useful for inputs whose precision may vary.
 */
export function parseAnyFlexibleDate(raw: string | null | undefined): Date | null {
    return parseFlexibleDate(raw) ?? parseFlexibleMonthYear(raw) ?? parseFlexibleYear(raw);
}
