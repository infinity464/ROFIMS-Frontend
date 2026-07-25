/**
 * Canonical "র‍্যাব" (RAB) uses a zero-width JOINER (U+200D) between র and ্য,
 * which renders the proper র‍্য (ya-phala) form. Text entered/pasted elsewhere
 * often carries broken encodings that render differently:
 *   • "র‌্যাব" — a zero-width NON-joiner (U+200C) instead of the joiner
 *   • "রয়াব"  — typed phonetically with য় (ya + nukta)
 *
 * normalizeRab() repairs ONLY these RAB-specific cases so the word looks the
 * same everywhere. It deliberately does NOT touch a bare "র্য" (no joiner),
 * because that cluster is legitimate in unrelated words (e.g. কার্যালয়,
 * কার্যাবলী) and rewriting it would corrupt them.
 */
const ZWJ = '‍';   // zero-width joiner
const ZWNJ = '‌';  // zero-width non-joiner

export function normalizeRab<T extends string | null | undefined>(text: T): T {
    if (!text) return text;
    return text
        // zero-width non-joiner before ্য → joiner (র‌্য → র‍্য)
        .split(`র${ZWNJ}্য`).join(`র${ZWJ}্য`)
        // phonetic রয়াব → র‍্যাব
        .split('রয়াব').join(`র${ZWJ}্যাব`) as T;
}
