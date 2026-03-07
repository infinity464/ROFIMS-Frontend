/**
 * Shared document model for Word (docx) and PDF (jsPDF) export.
 * Both formats consume this structure so content stays identical.
 */
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface ContentBlock {
    type: 'paragraph' | 'list' | 'table';
    text?: string;
    bold?: boolean;
    italic?: boolean;
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
    note?: string;
    closingText: string;
    initiator?: SignatoryBlock;
    approvers: SignatoryBlock[];
    enclLabel: string;
    enclNoLabel: string;
}
