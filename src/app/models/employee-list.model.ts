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
    joiningDateInRAB?: string | null;
    prefixName: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    motherUnitName: string | null;
    sortOrder: number | null;
    RABID?: string | null;
    rabID?: string | null;
    rabid?: string | null;
    relieverId?: number | null;
    relieverServiceId?: string | null;
    relieverPrefixName?: string | null;
    /** draft | draftPosting | draftNotesheet – used for action button label and disabled state. */
    isSendingNotesheetStatus?: string | null;
}

/** Request for AllocateRabId API. */
export interface AllocateRabIdRequest {
    employeeIds: number[];
}

/** Single result from AllocateRabId API. */
export interface AllocateRabIdResultItem {
    employeeId: number;
    rabId: string | null;
    errorMessage: string | null;
}

/** Supernumerary Employee Profile (GetSupernumeraryEmpProfile API). */
export interface SupernumeraryEmpProfile {
    employeeID: number;
    serviceId: string | null;
    rabId: string | null;
    name: string | null;
    corps: string | null;
    typeOfMember: string | null;
    rank: string | null;
    corpsName: string | null;
    trade: string | null;
    motherOrganization: string | null;
    lastUnit: string | null;
    location: string | null;
    appointment: string | null;
    dateOfJoiningInRAB: string | null;
    ownPermanentAddress: AddressBlock | null;
    ownPresentAddress: AddressBlock | null;
    spousePermanentAddress: AddressBlock | null;
    spousePresentAddress: AddressBlock | null;
    hasRelievers: boolean;
    relievers?: RelieverRow[];
    /** Who relieves this employee (RelieverId from EmployeeInfo). Null if not relieved by anyone. */
    relievedBy?: RelievedByInfo | null;
    /** JSON array of profile image ref(s), e.g. [{"FileId":3,"fileName":"photo.png"}]. From EmployeeInfo.ProfileImages. */
    profileImages?: string | null;
}

export interface RelievedByInfo {
    employeeID: number;
    serviceId: string | null;
    rank: string | null;
    corps: string | null;
    trade: string | null;
    name: string | null;
    wingBattalion: string | null;
    appointment: string | null;
}

export interface AddressBlock {
    villageArea: string | null;
    district: string | null;
    postOffice: string | null;
    division: string | null;
    upazilaThana: string | null;
}

export interface RelieverRow {
    employeeID: number;
    serviceId: string | null;
    rank: string | null;
    corps: string | null;
    trade: string | null;
    name: string | null;
    wingBattalion: string | null;
    appointment: string | null;
}
