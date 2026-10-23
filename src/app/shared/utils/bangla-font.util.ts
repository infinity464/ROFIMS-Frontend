/**
 * SolaimanLipi embedding for JsReport (chrome-pdf) exports.
 *
 * The app declares SolaimanLipi via an @font-face pointing at /assets/fonts/*.ttf.
 * That works in the browser, but JsReport renders the export HTML as a bare string
 * with no base URL, so the relative reference cannot resolve server-side and Bangla
 * silently falls back to whatever face the JsReport container happens to have.
 *
 * These helpers inline the TTFs as base64 data URIs so the PDF renders the same
 * Bangla face as the web view, with no font installed on the server.
 */

/** The document font stack: Times New Roman for Latin, SolaimanLipi for Bangla. */
export const BANGLA_DOC_FONT_STACK = `'Times New Roman', 'SolaimanLipi', Times, serif`;

/** btoa() over a font buffer, chunked to stay under the argument-count limit. */
function toBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/** Cached across callers — each face is ~200KB, so build the base64 once per session. */
let cached: string | undefined;

/**
 * SolaimanLipi as self-contained @font-face rules with the TTFs inlined as base64.
 *
 * A face that cannot be fetched is skipped rather than failing the export: Chromium
 * then falls back to a system Bangla font, as it did before the font was bundled.
 */
export async function embedBanglaFontCss(): Promise<string> {
    if (cached !== undefined) return cached;

    const faces = [
        { file: 'SolaimanLipi.ttf', weight: 400 },
        { file: 'SolaimanLipi-Bold.ttf', weight: 700 },
    ];

    const rules: string[] = [];
    for (const face of faces) {
        try {
            const res = await fetch(`assets/fonts/${face.file}`);
            if (!res.ok) continue;
            rules.push(
                `@font-face { font-family: 'SolaimanLipi'; font-style: normal; font-weight: ${face.weight};` +
                ` src: url(data:font/ttf;base64,${toBase64(await res.arrayBuffer())}) format('truetype'); }`
            );
        } catch { /* font asset unavailable — fall back to a system Bangla face */ }
    }

    cached = rules.join('\n');
    return cached;
}

/**
 * Concatenate every same-origin stylesheet loaded into the page, dropping the app's
 * relative-URL SolaimanLipi @font-face so it cannot win over the embedded base64 face.
 * Cross-origin sheets throw on cssRules access and are skipped.
 */
export function collectDocumentStyles(): string {
    const out: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
        try {
            for (const rule of Array.from(sheet.cssRules)) {
                if (rule instanceof CSSFontFaceRule && rule.cssText.includes('SolaimanLipi')) continue;
                out.push(rule.cssText);
            }
        } catch { /* cross-origin — skip */ }
    }
    return out.join('\n');
}
