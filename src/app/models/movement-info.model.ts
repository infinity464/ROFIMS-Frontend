import { MovementType, MoveOrderType } from './enums';

export interface MovementInfoModel {
    movementId: number;
    /** Generated letter number from MovementLetterNumberConfig (per MoveOrderType). */
    letterNo: string | null;
    /** Opaque, URL-safe random token used in the QR code (set on insert by the API). */
    publicToken: string | null;
    /** ISO date string for the letter (yyyy-MM-dd). */
    letterDate: string | null;
    /** JSON-serialised array of EmployeeIds (one or many) */
    employeeIds: string;
    /** JSON-serialised array of Final Approver EmployeeIds (optional) */
    finalApproverIds: string | null;
    /** JSON-serialised array of Article47LetterRecipient enum ints (Article 47 only) */
    letterRecipients: string | null;
    movementType: MovementType | number;
    moveOrderType: MoveOrderType | number;
    movementReasonId: number | null;
    currentUnitId: number | null;
    destinedMotherUnitId: number | null;
    destinedRABUnitId: number | null;
    dateOfRelease: string | null;
    dateOfReduce: string | null;
    takeoverDate: string | null;
    handoverDate: string | null;
    takeoverPersonEmpId: number | null;
    /** CC-only — free-form time string (e.g. "09:30"). */
    releaseTime: string | null;
    /** CC-only — MovementVehicle enum int (1 = Government, 2 = Non-Government). */
    vehicle: number | null;
    isJoiningLeave: boolean;
    joiningLeaveFrom: string | null;
    joiningLeaveTo: string | null;
    /** MO-only — "শেষ রসদ সনদপত্র" value (default: প্রদান করা হয়েছে।). */
    lastRationCertificate: string | null;
    /** MO-only — "বেতন ও ভাতা" value (default: এসপিসি মোতাবেক।). */
    payAndAllowance: string | null;
    /** MO-only — "রেলওয়ে আজ্ঞাপত্র" value (default: প্রদান করা হয় নাই।). */
    railwayWarrant: string | null;
    auth: string | null;
    detailsInformation: string | null;
    remarks: string | null;
    /** JSON-serialised array of { fileId, fileName } attached files (optional). */
    filesReferences: string | null;
    status: boolean;
    createdBy: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string | null;
}
