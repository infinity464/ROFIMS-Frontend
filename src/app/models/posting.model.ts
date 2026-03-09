/**
 * Posting module models (New Posting Order & Inter-Posting Order).
 * Ref: POSTING_MODULE_REQUIREMENTS.md
 */

/** Posting type: New (from Supernumerary) or Inter (from Presently Serving). */
export type PostingType = 'New' | 'Inter';

/** Status of a posting note-sheet. */
export type PostingNoteSheetStatus = 'Draft' | 'PendingFinalized' | 'PendingApproval' | 'Approved' | 'Declined';

/** Single member in a draft list or note-sheet (display + ids). */
export interface PostingMemberRow {
    employeeId: number;
    serviceId: string | null;
    rabID?: string | null;
    fullNameEN: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    motherUnitName?: string | null;
    rabUnit?: string | null;
    joiningDate?: string | null;
    /** Home district (permanent address) for warning when assigning unit. */
    homeDistrictName?: string | null;
    /** Reliever Service ID if any. */
    relieverServiceId?: string | null;
}

/** Draft list (New or Inter): list of members sent from source list. */
export interface DraftPostingList {
    id: string;
    listNo: string;
    listDate: string;
    postingType: PostingType;
    members: PostingMemberRow[];
    createdBy: string;
    createdDate: string;
}

/** Member in a posting note-sheet; transferUnitId set when finalized. */
export interface PostingNoteSheetMember {
    employeeId: number;
    serviceId: string | null;
    fullNameEN: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    motherUnitName?: string | null;
    rabUnit?: string | null;
    joiningDate?: string | null;
    homeDistrictName?: string | null;
    /** Assigned when finalizing (dropdown per person). */
    transferUnitId: number | null;
    transferUnitName?: string | null;
}

/** Posting note-sheet (Draft New/Inter Posting Note-Sheet → Finalized → Approved → Posting Order). */
export interface PostingNoteSheet {
    id: string;
    postingType: PostingType;
    draftListId: string | null;
    noteSheetNo: string;
    noteSheetDate: string;
    referenceNumber: string | null;
    subject: string;
    mainText: string;
    textType: 'en' | 'bn';
    preparedBy: string;
    initiatorId: number | null;
    recommenderIds: number[];
    finalApproverId: number | null;
    filesReferences: { fileId?: number; fileName?: string }[];
    status: PostingNoteSheetStatus;
    members: PostingNoteSheetMember[];
    createdBy: string;
    createdDate: string;
}

/** Draft New Posting master row (list below Add Draft New Posting). */
export interface DraftPostingMasterDto {
    id: number;
    draftPostingNo: string;
    draftPostingDate: string;
    draftPostingStatus: string;
    createdBy: string;
    createdDate: string;
    detailCount: number;
    hasNoteSheet: boolean;
}

/** Detail row for GetDraftNewPostingById (Edit). */
export interface DraftPostingDetailDto {
    id: number;
    employeeId: number;
    /** Transfer RAB Unit Id (FK to CommonCode). */
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
    remarks: string | null;
    // Employee display fields (populated from VwEmployeeList on the backend)
    serviceId: string;
    rank: string;
    corps: string;
    trade: string;
    name: string;
    motherUnit: string;
    rabJoingdate: string;
}

/** Draft New Posting by id with details (for Edit dialog). */
export interface DraftPostingMasterWithDetailsDto {
    id: number;
    draftPostingNo: string;
    draftPostingDate: string;
    draftPostingStatus: string;
    createdBy: string;
    createdDate: string;
    details: DraftPostingDetailDto[];
}

export type SaveDraftNewPostingResponse = { statusCode: number; description: string };

/** Row from vw_DraftPostingWithEmployees view. */
export interface DraftPostingEmployeeRow {
    draftPostingMasterId: number;
    draftPostingNo: string;
    draftPostingDate: string;
    draftPostingStatus: string;
    draftPostingDetailId: number;
    employeeId: number;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
    remarks: string | null;
    isSendingNotesheetStatus: string | null;
    serviceId: string | null;
    prefixName: string | null;
    prefixNameBN: string | null;
    fullNameEN: string | null;
    fullNameBN: string | null;
    rabID: string | null;
    rankName: string | null;
    rankNameBN: string | null;
    corpsName: string | null;
    corpsNameBN: string | null;
    tradeName: string | null;
    tradeNameBN: string | null;
    motherUnitName: string | null;
    motherUnitNameBN: string | null;
    joiningDateInRAB: string | null;
    rankSortOrder: number | null;
    motherOrgSortOrder: number | null;
    createdBy: string | null;
    createdDate: string | null;
}

/** Posting receive view row (from vw_PostingReceiveWithEmployees). */
export interface PostingReceiveViewDto {
    postingReceiveId: number;
    draftPostingMasterId: number;
    draftPostingDetailId: number;
    noteSheetId: number | null;
    employeeId: number;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
    joiningDate: string | null;
    receiveStatus: string;
    receivedBy: string | null;
    receivedDate: string | null;
    receiveRemarks: string | null;
    draftPostingNo: string;
    draftPostingDate: string;
    noteSheetNo: string | null;
    noteSheetDate: string | null;
    approvalDate: string | null;
    serviceId: string | null;
    prefixName: string | null;
    fullNameEN: string | null;
    fullNameBN: string | null;
    rabID: string | null;
    rankName: string | null;
    rankNameBN: string | null;
    corpsName: string | null;
    corpsNameBN: string | null;
    tradeName: string | null;
    tradeNameBN: string | null;
    motherUnitName: string | null;
    motherUnitNameBN: string | null;
    joiningDateInRAB: string | null;
    rankSortOrder: number | null;
}

/** Pending joining item (approved posting order, not yet joined). */
export interface PendingJoiningItem {
    id: string;
    postingType: PostingType;
    postingNoteSheetId: string;
    orderNo: string;
    employeeId: number;
    serviceId: string | null;
    rabID: string | null;
    fullNameEN: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    postingFromUnitId: number | null;
    postingFromUnitName: string | null;
    postedToUnitId: number | null;
    postedToUnitName: string | null;
    /** Set when user clicks Join and submits. */
    joiningDate: string | null;
    ccMoArticle47No: string | null;
    ccMoArticle47FileId: number | null;
}
