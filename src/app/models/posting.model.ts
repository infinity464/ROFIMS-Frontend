/**
 * Posting module models (New Posting Order & Inter-Posting Order).
 * Ref: POSTING_MODULE_REQUIREMENTS.md
 */

/** Posting type: New (from Supernumerary) or Inter (from Presently Serving). */
export type PostingType = 'New' | 'Inter';

/** Audit record for a member removal from a draft posting list. */
export interface PostingMemberRemovalHistoryDto {
    id: number;
    draftPostingMasterId: number;
    isInterPosting: boolean;
    /** DraftPostingMaster.DraftPostingNo or DraftInterPostingMaster.DraftInterPostingNo at time of removal. */
    draftPostingNo: string | null;
    employeeId: number;
    /** Live lookup from EmployeeInfo at query time. */
    serviceId: string | null;
    rabId: string | null;
    fullNameEN: string | null;
    originalTransferRabUnitId: number | null;
    originalTransferRabUnitName: string | null;
    originalTransferWingName: string | null;
    originalTransferBranchName: string | null;
    originalTransferSectionName: string | null;
    originalRemarks: string | null;
    noteSheetId: number | null;
    noteSheetNo: string | null;
    /**
     * Precise stage computed by backend from NoteSheetInfo at time of removal:
     * Draft | Pending - Initiator | Pending - Recommender | Pending - Final Approval | Approved | Declined
     */
    noteSheetStatusAtRemoval: string | null;
    createdBy: string | null;
    createdDate: string;
}

/** Lightweight removal info returned by GetRemovalHistoryByEmployeeIds. */
export interface EmployeeRemovalInfo {
    employeeId: number;
    postingOrderNo: string | null;
    draftPostingNo: string | null;
    removedDate: string;
    isInterPosting: boolean;
    postingOrderDate: string | null;
    transferToUnitName: string | null;
    transferFromUnitName: string | null;
    removalRemark: string | null;
    removalRemarkBN: string | null;
}

/** Most recent cancelled inter posting (joining cancelled) per employee. */
export interface CancelledInterPostingInfo {
    employeeId: number;
    /** PostingOrderMaster.Id of the cancelled order. The "previous order cancelled"
     *  note is shown only on later orders (current order id > this). */
    postingOrderMasterId: number;
    postingOrderNo: string | null;
    postingOrderDate: string | null;   // dd-MM-yyyy
    transferRabUnitName: string | null;
    transferRabUnitNameBN: string | null;
    fromRabUnitName: string | null;
    fromRabUnitNameBN: string | null;
}

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

// ── Inter Posting DTOs ──────────────────────────────────────────

/** Draft Inter Posting master row. */
export interface DraftInterPostingMasterDto {
    id: number;
    draftInterPostingNo: string;
    draftInterPostingDate: string;
    draftInterPostingStatus: string;
    createdBy: string;
    createdDate: string;
    detailCount: number;
    hasNoteSheet: boolean;
}

/** Detail row for GetDraftInterPostingById (Edit). */
export interface DraftInterPostingDetailDto {
    id: number;
    employeeId: number;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
    remarks: string | null;
    serviceId: string;
    rank: string;
    corps: string;
    trade: string;
    name: string;
    motherUnit: string;
    rabUnit: string;
    rabJoingdate: string;
}

/** Draft Inter Posting by id with details (for Edit). */
export interface DraftInterPostingMasterWithDetailsDto {
    id: number;
    draftInterPostingNo: string;
    draftInterPostingDate: string;
    draftInterPostingStatus: string;
    createdBy: string;
    createdDate: string;
    details: DraftInterPostingDetailDto[];
}

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
    transferRabUnitNameBN?: string | null;
    remarks: string | null;
    sendingRemark: string | null;
    interPostingRemark?: string | null;
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
    tradeRemarks: string | null;
    specialQualifications: string | null;
    specialQualificationsBN: string | null;
    professionalQualification: string | null;
    professionalQualificationBN: string | null;
    gallantryAwardsDecoration: string | null;
    gallantryAwardsDecorationBN: string | null;
    motherUnitName: string | null;
    motherUnitNameBN: string | null;
    joiningDateInRAB: string | null;
    rankSortOrder: number | null;
    motherOrgSortOrder: number | null;
    permanentDistrictName: string | null;
    permanentDistrictNameBN: string | null;
    spousePermanentDistrictName: string | null;
    spousePermanentDistrictNameBN: string | null;
    motherOrgLocationName: string | null;
    motherOrgLocationNameBN: string | null;
    /** Previous RAB service units (comma-separated). Inter-posting only. */
    previousRabUnits?: string | null;
    previousRabUnitsBN?: string | null;
    /** Current RAB unit the employee is presently serving in. Inter-posting only. */
    presentRabUnitId?: number | null;
    presentRabUnitName?: string | null;
    presentRabUnitNameBN?: string | null;
    presentRabWingName?: string | null;
    presentRabWingNameBN?: string | null;
    presentRabBranchName?: string | null;
    presentRabBranchNameBN?: string | null;
    presentRabSubBranchName?: string | null;
    presentRabSubBranchNameBN?: string | null;
    presentRabSectionName?: string | null;
    presentRabSectionNameBN?: string | null;
    presentRabSubSectionName?: string | null;
    presentRabSubSectionNameBN?: string | null;
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
    postingOrderMasterId: number | null;
    postingOrderNo: string | null;
    postingOrderDate: string | null;
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

/** Pending joining row (from vw_PendingPostingJoining). */
export interface PendingPostingJoiningDto {
    postingReceiveId: number;
    employeeId: number;

    postingOrderMasterId: number;
    postingOrderNo: string;
    postingOrderDate: string;
    postingType: string;
    approvalStatus: string | null;

    noteSheetNo: string | null;

    transferRabUnitId: number | null;
    transferToHierarchy: string | null;
    fromHierarchy?: string | null;
    fromHierarchyBN?: string | null;
    transferRabUnitName: string | null;
    fromRabUnitId: number | null;
    fromRabUnitName: string | null;

    serviceId: string | null;
    fullNameEN: string | null;
    fullNameBN?: string | null;
    rabID: string | null;
    rankId?: number | null;
    rankName: string | null;
    rankNameBN?: string | null;
    corpsId?: number | null;
    corps?: string | null;
    corpsBN?: string | null;
    tradeId?: number | null;
    trade?: string | null;
    tradeBN?: string | null;
    motherOrganizationId?: number | null;
    memberTypeId?: number | null;
    memberType?: string | null;
    memberTypeBN?: string | null;
    rabRank?: string | null;
    rabRankBN?: string | null;
    motherOrganization: string | null;
    motherUnitName: string | null;

    // Per-member joining state + cancel audit ("Pending" | "Received" | "Cancel"; nullable).
    joinStatus?: string | null;
    cancelReason?: string | null;
    cancelledBy?: string | null;
    cancelledDate?: string | null;

    /** Employee's Additional Remarks (bullet-joined). Only the report endpoint
     *  (GetPendingInterPostingReport) populates this; null elsewhere. */
    additionalRemarks?: string | null;
}

// ── Posting Order DTOs ────────────────────────────────────────

/** Posting Order master row for list. */
export interface PostingOrderMasterDto {
    id: number;
    postingOrderNo: string;
    postingOrderDate: string;
    postingType: string;
    noteSheetId: number;
    noteSheetNo: string | null;
    refPostingOrderMasterId: number | null;
    referenceNumber: string | null;
    subject: string | null;
    textType: string | null;
    status: string;
    remarks: string | null;
    createdBy: string;
    createdDate: string;
    detailCount: number;
    // Approval fields
    approvalEmployeeId?: number | null;
    approvalEmployeeName?: string | null;
    approvalStatus?: string | null;
    approvalNote?: string | null;
    cancelReason?: string | null;
    approvalDate?: string | null;
}

/** Posting Order detail row (employee). */
export interface PostingOrderDetailDto {
    id: number;
    employeeId: number;
    remarks: string | null;
    serviceId: string | null;
    rank: string | null;
    corps: string | null;
    trade: string | null;
    name: string | null;
    motherUnit: string | null;
    rabUnit: string | null;
    rabJoingdate: string | null;
}

/** Posting Order by id with details. */
export interface PostingOrderMasterWithDetailsDto {
    id: number;
    postingOrderNo: string;
    postingOrderDate: string;
    postingType: string;
    noteSheetId: number;
    noteSheetNo: string | null;
    refPostingOrderMasterId: number | null;
    referenceNumber: string | null;
    subject: string | null;
    mainText: string | null;
    subText?: string | null;
    textType: string | null;
    filesReferences: string | null;
    status: string;
    remarks: string | null;
    footerText?: string | null;
    createdBy: string;
    createdDate: string;
    // Approval fields
    approvalEmployeeId?: number | null;
    approvalEmployeeName?: string | null;
    approvalStatus?: string | null;
    approvalNote?: string | null;
    cancelReason?: string | null;
    approvalDate?: string | null;
    details: PostingOrderDetailDto[];
}

/** Posting order employee row from vw_PostingOrderWithEmployees. */
export interface PostingOrderEmployeeRow {
    postingOrderMasterId: number;
    postingOrderNo: string;
    postingOrderDate: string;
    postingType: string;
    noteSheetId: number;
    refPostingOrderMasterId: number | null;
    referenceNumber: string | null;
    subject: string | null;
    mainText: string | null;
    subText?: string | null;
    textType: string | null;
    filesReferences: string | null;
    noteSheetNo: string | null;
    nsTextType: number | null;
    draftPostingMasterId: number | null;
    status: string;
    masterRemarks: string | null;
    footerText: string | null;
    createdBy: string;
    createdDate: string;
    approvalEmployeeId: number | null;
    approvalStatus: string | null;
    approvalNote: string | null;
    cancelReason: string | null;
    approvalDate: string | null;
    postingOrderDetailId: number;
    employeeId: number;
    detailRemarks: string | null;
    noteSheetRemarks: string | null;
    sendingRemark: string | null;
    interPostingRemark: string | null;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
    transferRabUnitNameBN: string | null;
    transferIsHq?: boolean | null;
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
    tradeRemarks: string | null;
    professionalQualification: string | null;
    professionalQualificationBN: string | null;
    gallantryAwardsDecoration: string | null;
    gallantryAwardsDecorationBN: string | null;
    motherUnitName: string | null;
    motherUnitNameBN: string | null;
    joiningDateInRAB: string | null;
    rankSortOrder: number | null;
    motherOrgSortOrder: number | null;
    permanentDistrictName: string | null;
    permanentDistrictNameBN: string | null;
    receiveStatus?: string | null;
}

/** Approved NoteSheet row for dropdown. */
export interface ApprovedNoteSheetItem {
    noteSheetId: number;
    noteSheetNo: string;
    noteSheetDate: string;
    subject: string;
    noteSheetType: string;
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

/** Detailed posting processing status per employee (New + Inter). NULL step = not in flow or complete. */
export interface EmployeePostingProcessingStatusDto {
    employeeId: number;
    newPostingStep: string | null;
    newPostingNoteSheetNo: string | null;
    newPostingNoteSheetStatus: string | null;
    newPostingForceOrderGenerated: boolean;
    newPostingForceOrderApproved: boolean;
    newPostingOrderReceived: boolean;
    interPostingStep: string | null;
    interPostingNoteSheetNo: string | null;
    interPostingNoteSheetStatus: string | null;
    interPostingForceOrderGenerated: boolean;
    interPostingForceOrderApproved: boolean;
    interPostingOrderReceived: boolean;
}
