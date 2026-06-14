/** A return record for someone who went out on a Temporary movement to a Mother Org. */
export interface TemporaryMovementReturnModel {
    id: number;
    movementId: number | null;
    employeeId: number;
    destinedMotherUnitId: number | null;
    letterNo: string | null;
    /** ISO date (yyyy-MM-dd). */
    letterIssueDate: string | null;
    auth: string | null;
    detailsInformation: string | null;
    /** ISO date (yyyy-MM-dd). */
    returnDate: string | null;
    remarks: string | null;
    /** JSON array of { fileId, fileName }. */
    filesReferences: string | null;
    status: boolean;
    createdBy: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string | null;

    // Display fields (from GetAllWithEmployeeAsyn)
    serviceId?: string | null;
    rabId?: string | null;
    fullNameEN?: string | null;
    fullNameBN?: string | null;
    destinedMotherUnitName?: string | null;
    destinedMotherUnitNameBN?: string | null;
    motherOrgId?: number | null;
    motherOrgName?: string | null;
    motherOrgNameBN?: string | null;
    movementLetterNo?: string | null;
}

/** A person currently out on a Temporary movement to a Mother Unit, not yet returned. */
export interface TemporaryMovementEligiblePersonnel {
    employeeId: number;
    movementId: number;
    movementLetterNo: string | null;
    serviceId: string | null;
    rabId: string | null;
    fullNameEN: string | null;
    fullNameBN: string | null;
    destinedMotherUnitId: number | null;
    destinedMotherUnitName: string | null;
    destinedMotherUnitNameBN: string | null;
}
