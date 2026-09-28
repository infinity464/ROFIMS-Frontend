import { PostingOrderNumberConfigModel } from '@/Components/basic-setup/shared/models/posting-order-number-config';
import { PostingType } from '@/models/enums';

const toBanglaDigits = (s: string): string => s.replace(/\d/g, d => String.fromCharCode(0x09E6 + Number(d)));

/**
 * Letter No pattern options for a General office order — active General PostingOrderNumberConfig
 * rows, each labelled with the number the next order would get (and its member types).
 */
export function buildOfficeOrderLetterNoOptions(
    configs: PostingOrderNumberConfigModel[],
    memberTypeMap: Record<number, string>,
    isBangla: boolean
): { label: string; value: number }[] {
    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;
    return (configs ?? [])
        .filter((c) => c.postingType === PostingType.General && c.status)
        .map((c) => {
            const prefixLabel = isBangla ? (c.prefixBN || c.prefix) : c.prefix;
            const yearReset = c.currentYear !== nowYear || c.currentMonth !== nowMonth;
            const nextNum = yearReset ? c.startNumber : c.currentNumber + 1;
            let yearStr = String(nowYear);
            let monthStr = String(nowMonth).padStart(2, '0');
            let numStr = String(nextNum);
            if (isBangla) {
                yearStr = toBanglaDigits(yearStr);
                monthStr = toBanglaDigits(monthStr);
                numStr = toBanglaDigits(numStr);
            }
            const previewNo = c.includeDate
                ? `${prefixLabel}/${yearStr}/${monthStr}/${numStr}`
                : `${prefixLabel}/${numStr}`;
            const memberTypeLabel = (c.memberTypeIds ?? '').split(',').filter(Boolean)
                .map(id => memberTypeMap[+id]).filter(Boolean).join(', ');
            const memberTypeSuffix = memberTypeLabel ? `  ${memberTypeLabel}` : '';
            return { label: `${previewNo}${memberTypeSuffix}`, value: c.configId };
        });
}

/**
 * Office-order Body — the non-empty paragraphs as a JSON array of { text }, or null when there
 * are none. Quill leaves an empty editor as "<p><br></p>", which must not count as text.
 */
export function toOfficeOrderBodyJson(texts: (string | null | undefined)[]): string | null {
    const cleaned = (texts ?? [])
        .map(t => ({ text: (t ?? '').trim() }))
        .filter(b => b.text !== '' && b.text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== '');
    return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

/** "Office Order without notesheet" entry in the note-sheet dropdowns — not a real id. */
export const OFFICE_ORDER_WITHOUT_NOTESHEET = -1;
