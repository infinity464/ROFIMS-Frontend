/** Office Order master row for list. */
export interface GeneralNotesheetOfficeOrderDto {
    id: number;
    letterNo: string;
    letterDate: string;
    noteSheetId: number;
    noteSheetNo: string | null;
    /** Linked note-sheet's member-type ids — used to scope the list by user access. */
    employeeTypeIds?: string | null;
    subject: string | null;
    textType: string | null;
    status: string;
    remarks: string | null;
    createdBy: string;
    createdDate: string;
    // Approval
    approvalEmployeeId?: number | null;
    approvalEmployeeName?: string | null;
    approvalStatus?: string | null;
    approvalNote?: string | null;
    cancelReason?: string | null;
    approvalDate?: string | null;
}

/** Office Order full detail (for preview/edit). */
export interface GeneralNotesheetOfficeOrderWithDetailsDto {
    id: number;
    letterNo: string;
    letterDate: string;
    noteSheetId: number;
    noteSheetNo: string | null;
    subject: string | null;
    addressTo: string | null;       // Rich text HTML
    referenceNo: string | null;     // JSON string
    body: string | null;            // Rich text HTML
    onulipi: string | null;         // JSON string
    textType: string | null;
    filesReferences: string | null;
    status: string;
    remarks: string | null;
    createdBy: string;
    createdDate: string;
    // Approval
    approvalEmployeeId?: number | null;
    approvalEmployeeName?: string | null;
    approvalStatus?: string | null;
    approvalNote?: string | null;
    cancelReason?: string | null;
    approvalDate?: string | null;
    // NoteSheet content (from view)
    nsMainText?: string | null;
    nsNote?: string | null;
    nsParagraphText?: string | null;
    // Approval person details (from view)
    approvalEmployeeNameBN?: string | null;
    approvalEmployeeRank?: string | null;
    approvalEmployeeRankBN?: string | null;
    approvalEmployeeAppointment?: string | null;
    approvalEmployeeAppointmentBN?: string | null;
    approvalEmployeeRabUnit?: string | null;
    approvalEmployeeRabUnitBN?: string | null;
}

/** Reference No entry (with serial). */
export interface ReferenceNoEntry {
    serial: string;  // "ক", "খ", "গ" for Bangla; "A", "B", "C" for English
    text: string;
}

/** Onulipi/footer paragraph entry (same structure as PostingOrder FooterText). */
export interface OnulipiEntry {
    text: string;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
}

/** Attachment (সংযুক্ত) list entry — plain text, rendered above the Onulipi. */
export interface AttachmentEntry {
    text: string;
}
