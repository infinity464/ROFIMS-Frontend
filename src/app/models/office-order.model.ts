/** Office Order master row for list. */
export interface GeneralNotesheetOfficeOrderDto {
    id: number;
    letterNo: string;
    letterDate: string;
    /** null → office order generated without a note sheet. */
    noteSheetId: number | null;
    noteSheetNo: string | null;
    /** Member-type ids (linked note sheet's, or the order's own) — used to scope the list by user access. */
    employeeTypeIds?: string | null;
    orderFormat?: string | null;
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

/** One row per (office order, member) for the member-wise office order list. */
export interface OfficeOrderMemberRowDto {
    officeOrderId: number;
    letterNo: string;
    letterDate: string;
    noteSheetId: number | null;
    noteSheetNo: string | null;
    orderFormat?: string | null;
    subject: string | null;
    /** Subject's category (Clearance - Officer / RTU / Promotion); null → General. */
    subjectCategory?: string | null;
    status: string;
    approvalStatus?: string | null;
    approvalDate?: string | null;
    createdBy: string;
    createdDate: string;
    employeeId: number;
    serviceId: string | null;
    rabID: string | null;
    rankName: string | null;
    fullNameEN: string | null;
    memberType: string | null;
    motherOrganization: string | null;
    motherUnitName: string | null;
}

/** Server-side filters for the member-wise list ('__none__' = without note sheet, '__general__' = empty value). */
export interface OfficeOrderMemberRowFilter {
    letterNo?: string | null;
    noteSheetNo?: string | null;
    motherOrganization?: string | null;
    orderFormat?: string | null;
    subjectCategory?: string | null;
    approvalStatus?: string | null;
    search?: string | null;
}

/** One page of the member-wise list; options only when requested. */
export interface OfficeOrderMemberRowsPage {
    datalist: OfficeOrderMemberRowDto[];
    /** The API camel-cases JSON, so the controller's Rows/TotalPages arrive as rows/totalPages. */
    pages: { rows: number; totalPages: number };
    options?: { letterNos: string[]; noteSheetNos: string[]; motherOrganizations: string[] } | null;
}

/** Office Order full detail (for preview/edit). */
export interface GeneralNotesheetOfficeOrderWithDetailsDto {
    id: number;
    letterNo: string;
    letterDate: string;
    /** null → office order generated without a note sheet. */
    noteSheetId: number | null;
    noteSheetNo: string | null;
    subject: string | null;
    addressTo: string | null;       // Rich text HTML
    referenceNo: string | null;     // JSON string
    body: string | null;            // Rich text HTML
    onulipi: string | null;         // JSON string
    attachments: string | null;     // JSON array of { text } — সংযুক্ত list, shown above the Onulipi
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
    // Own note-sheet style inputs (office order without a note sheet)
    noteSheetSubjectId?: number | null;
    employeeTypeIds?: string | null;
    showMembersTable?: boolean;
    orderFormat?: string | null;
    unitId?: number | null;
    wingBattalionId?: number | null;
    branchId?: number | null;
    subBranchId?: number | null;
    sectionId?: number | null;
    subSectionId?: number | null;
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

/** Member row of an office order generated without a note sheet (NoteSheetReferenceEmployee shape). */
export interface OfficeOrderMember {
    id?: number;
    officeOrderId?: number;
    employeeId: number;
    postedOutId: number | null;
    informationJson: string | null;   // { columns, values }
}

/** Note-sheet style inputs an office order carries itself when it has no note sheet. */
export interface OfficeOrderOwnFields {
    noteSheetSubjectId?: number | null;
    employeeTypeIds?: string | null;
    showMembersTable?: boolean | null;
    orderFormat?: string | null;
    unitId?: number | null;
    wingBattalionId?: number | null;
    branchId?: number | null;
    subBranchId?: number | null;
    sectionId?: number | null;
    subSectionId?: number | null;
    /** Omit/null on update to leave members untouched. */
    members?: OfficeOrderMember[] | null;
}
