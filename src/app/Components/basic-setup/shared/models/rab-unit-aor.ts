export interface RABUnitAORModel {
    aorId?: number;
    rabUnitId: number;
    /** Comma-separated Division IDs (e.g. "1,2,3"). */
    divisionIds?: string | null;
    /** Comma-separated District IDs (e.g. "1,2,3"). */
    districtIds?: string | null;
    /** Comma-separated Upazila IDs (e.g. "1,2,3"). */
    upazilaIds?: string | null;
    /** Location of Battalion HQ (text). */
    locationOfBattalionHQ?: string | null;
    /** Number of Camp. */
    numberOfCamp?: number | null;
    /** Name of Camps (text). */
    nameOfCamps?: string | null;
    status: boolean;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

export interface ResultViewModel {
    statusCode: number;
    description?: string;
    data?: unknown;
}
