/**
 * Order-id URL codec (posting orders + office orders) — COSMETIC obfuscation only.
 *
 * ⚠️ This is NOT a security control. It only stops a casual user from editing the
 * numeric id in the URL bar (e.g. `?id=3088` → `?id=3089`). A determined user can
 * still read the real id from the Network tab and call the API directly — the key
 * lives in this bundle. Resource access MUST be enforced SERVER-SIDE on the fetch
 * endpoints. Mirrors notesheet-id-codec (see NoteSheetInfoController → CheckNoteSheetAccess).
 *
 * `decode` is backward-compatible: a plain numeric id still resolves, so old links
 * and any un-migrated caller keep working.
 */

const XOR_BASE = 0x5f;
/** Leading marker so an encoded token is never all-digits → decode stays unambiguous. */
const PREFIX = 'o';

/** Encode an order id into an opaque URL token (e.g. 3088 → "o..."). */
export function encodeOrderId(id: number | string | null | undefined): string {
    if (id == null || id === '') return '';
    const s = String(id);
    let x = '';
    for (let i = 0; i < s.length; i++) {
        x += String.fromCharCode(s.charCodeAt(i) ^ (XOR_BASE + (i % 7)));
    }
    return PREFIX + btoa(x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a URL token back to the numeric id. Accepts a plain number for backward-compat. Returns null if invalid. */
export function decodeOrderId(token: string | number | null | undefined): number | null {
    if (token == null) return null;
    const t = String(token).trim();
    if (t === '') return null;

    // Backward-compat: a plain numeric id still works (old links / un-migrated callers).
    if (/^\d+$/.test(t)) return +t;

    if (t[0] !== PREFIX) return null;
    try {
        let b64 = t.slice(1).replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const raw = atob(b64);
        let s = '';
        for (let i = 0; i < raw.length; i++) {
            s += String.fromCharCode(raw.charCodeAt(i) ^ (XOR_BASE + (i % 7)));
        }
        return /^\d+$/.test(s) ? +s : null;
    } catch {
        return null;
    }
}
