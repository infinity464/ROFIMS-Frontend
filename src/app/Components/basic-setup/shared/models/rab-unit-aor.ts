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
    /** Location of Battalion HQ — Bangla translation (text). */
    locationOfBattalionHQBangla?: string | null;
    /** Number of Camp. */
    numberOfCamp?: number | null;
    /** Name of Camps (text). */
    nameOfCamps?: string | null;
    /** Identification color for the unit's AOR (CSS hex, e.g. "#8c3a1f"). Used to tint the upazila map. */
    identificationColor?: string | null;
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
