/**
 * Main Text is stored in NoteSheetInfo.MainText as a JSON array of rich-text
 * blocks: [{ "text": "<html>" }, ...]. Each block renders as its own numbered
 * paragraph in the note-sheet (like the Reference paragraphs). Legacy note-sheets
 * stored a single HTML string; these helpers transparently upgrade that to a
 * one-block array on read, so old data keeps rendering.
 */
export interface MainTextBlock {
    text: string;
}

/**
 * Parse the stored MainText into blocks. Falls back to a single block for legacy
 * (non-JSON) HTML strings. Always returns at least one block.
 */
export function parseMainTextBlocks(raw: string | null | undefined): MainTextBlock[] {
    const s = (raw ?? '').trim();
    if (!s) return [{ text: '' }];
    // A stored blocks array always begins with '['. Anything else is legacy HTML.
    if (s.startsWith('[')) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) {
                const blocks = arr.map((it: any) =>
                    typeof it === 'string' ? { text: it } : { text: String(it?.text ?? it?.Text ?? '') }
                );
                return blocks.length ? blocks : [{ text: '' }];
            }
        } catch {
            /* not valid JSON — fall through and treat the whole value as one legacy block */
        }
    }
    return [{ text: raw as string }];
}

/**
 * Serialize edited blocks back to the stored JSON string. Empty blocks are
 * dropped so trailing blank editors are not persisted.
 */
export function serializeMainTextBlocks(blocks: MainTextBlock[] | null | undefined): string {
    const cleaned = (blocks ?? [])
        .map((b) => ({ text: (b?.text ?? '').trim() }))
        .filter((b) => b.text !== '');
    return JSON.stringify(cleaned);
}

/**
 * Flatten all blocks into a single HTML string — for surfaces that show or edit
 * the main text as one blob (list preview/export, office-order body prefill).
 */
export function mainTextBlocksToHtml(raw: string | null | undefined): string {
    return parseMainTextBlocks(raw)
        .map((b) => b.text)
        .filter((t) => (t ?? '').trim() !== '')
        .join('');
}
