/**
 * Request payload for GetSupernumeraryList API.
 */
export interface GetSupernumeraryListRequest {
    orgIds: number[];
    memberTypeId: number;
}

/**
 * Single row from vw_SupernumeraryList (supernumerary list).
 */
export interface SupernumeraryList {
    employeeID: number;
    serviceId: string;
    fullNameEN: string;
    officerType: number | null;
    orgId: number | null;
    joiningDate: string | null;
    prefixName: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    motherUnitName: string | null;
    sortOrder: number | null;
}

/** Request for AllocateRabId API. */
export interface AllocateRabIdRequest {
    employeeIds: number[];
}

/** Single result from AllocateRabId API. */
export interface AllocateRabIdResultItem {
    employeeId: number;
    rabID: string | null;
    errorMessage: string | null;
}
