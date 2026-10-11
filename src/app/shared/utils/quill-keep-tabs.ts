import Quill from 'quill';
import Delta from 'quill-delta';

/**
 * Quill's clipboard drops whitespace at the start of a line (and squeezes runs of it) when it
 * turns HTML back into editor content. So a Tab typed at the start of a paragraph is saved as
 * "\t" but disappears the next time the saved HTML is loaded into the editor, and is then lost
 * for good on the next save. This clipboard swaps each tab inside real text for a placeholder
 * Quill doesn't treat as whitespace, then turns it back into a tab afterwards.
 *
 * Importing this file registers it; it is a no-op on later imports.
 */
const TAB_PLACEHOLDER = '\uE009'; // private-use char, never typed by users

/** Whitespace-only text directly inside these is markup formatting, not typed text. */
const NON_TEXT_PARENTS = new Set(['BODY', 'OL', 'UL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR']);

const BaseClipboard = Quill.import('modules/clipboard') as any;

class KeepTabsClipboard extends BaseClipboard {
    convertHTML(html: string): Delta {
        if (!html || !html.includes('\t')) return super.convertHTML(html);

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.nodeValue ?? '';
            if (!text.includes('\t') || NON_TEXT_PARENTS.has(node.parentElement?.tagName ?? '')) continue;
            node.nodeValue = text.replace(/\t/g, TAB_PLACEHOLDER);
        }

        const delta: Delta = super.convertHTML(doc.body.innerHTML);
        return new Delta(delta.ops.map(op =>
            typeof op.insert === 'string' && op.insert.includes(TAB_PLACEHOLDER)
                ? { ...op, insert: op.insert.split(TAB_PLACEHOLDER).join('\t') }
                : op
        ));
    }
}

if (!(Quill.import('modules/clipboard') as any).keepsTabs) {
    (KeepTabsClipboard as any).keepsTabs = true;
    Quill.register('modules/clipboard', KeepTabsClipboard, true);
}
