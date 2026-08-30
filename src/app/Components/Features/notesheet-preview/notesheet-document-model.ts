/**
 * Shared document model for Word (docx) and PDF (jsPDF) export.
 * Both formats consume this structure so content stays identical.
 */
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface InlineRun {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
}

export interface ContentBlock {
    type: 'paragraph' | 'list' | 'table';
    text?: string;
    bold?: boolean;
    italic?: boolean;
    /** Inline runs preserving per-segment formatting (bold/italic/underline). When present, takes precedence over text/bold/italic. */
    runs?: InlineRun[];
    listPrefix?: string;
    indent?: 'normal' | 'list';
    alignment?: TextAlignment;
    rows?: string[][]; // for table: [row][cell], first row can be header
}

export interface SignatoryBlock {
    role: string;
    serialText: string;
    remark?: string;
    signatureDataUrl?: string;
    nameLine: string;
    rankLine?: string;
    appointment?: string;
    date?: string;
    align?: 'left' | 'center' | 'right';
}

export interface NotesheetDocumentModel {
    isBangla: boolean;
    subject: string;
    referenceBlocks: ContentBlock[];
    referenceLabel: string;
    dateLabel: string;
    dateValue: string;
    mainSerialText: string;
    mainBlocks: ContentBlock[];
    /**
     * Optional: multiple Main Text blocks, each with its own serial (General
     * note-sheet). When present, the Word builder renders these instead of the
     * single mainSerialText/mainBlocks pair. `mainBlocks` still mirrors block 1
     * so consumers that ignore this field keep working.
     */
    mainSections?: { serialText: string; blocks: ContentBlock[] }[];
    /** Optional: multiple Last Text blocks, each with its own serial (General note-sheet). */
    lastSections?: { serialText: string; blocks: ContentBlock[] }[];
    note?: string;
    closingText: string;
    initiator?: SignatoryBlock;
    approvers: SignatoryBlock[];
    enclLabel: string;
    enclNoLabel: string;
}
