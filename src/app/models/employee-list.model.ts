/**
 * Request payload for GetEmployeeList API.
 */
export interface GetEmployeeListRequest {
    orgIds: number[];
    memberTypeId: number;
}

/**
 * Single row from vw_EmployeeList (employee list).
 */
export interface EmployeeList {
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
