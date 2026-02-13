export interface EmpModel {
    EmployeeID: number;
    LastMotherUnit: number | null;
    MemberType: string;
    Appointment: string;
    JoiningDate: Date | string;
    Rank: number;
    Branch: number;
    Trade: number;
    TradeMark?: string;
    Gender: string;
    Prefix: string;
    ServiceId: string;
    RABID: string;
    NID?: string;
    FullNameEN: string;
    FullNameBN: string;
    IsReliever: boolean;
    PostingStatus: string;
    Status: boolean;
    CreatedBy?: string;
    CreatedDate?: Date | string;
    LastUpdatedBy?: string;
    Lastupdate?: Date | string;
    StatusDate?: Date | string;
    orgId?: number | null;
}

export interface AddressInfoModelLower {
    employeeID: number;
    addressId: number;
    fmid: number;

    locationType: string;
    locationCode: string;
    postCode: string;

    addressAreaEN: string;
    addressAreaBN: string;

    divisionType?: number;
    thanType?: number;
    postOfficeType?: number;

    createdBy: string;
    createdDate: string;

    lastUpdatedBy: string;
    lastupdate: string;
}

export type LocationType = 'PERMANENT' | 'PRESENT' | 'WIFE_PERMANENT' | 'WIFE_PRESENT';

export interface AddressInfoModel {
    EmployeeID: number;
    AddressId: number;
    FMID: number;
    LocationType: LocationType;
    LocationCode: string;
    PostCode: string;
    AddressAreaEN?: string;
    AddressAreaBN?: string;
    DivisionType?: number;
    ThanType?: number;
    PostOfficeType?: number;
    CreatedBy?: string;
    CreatedDate?: Date | string;
    LastUpdatedBy?: string;
    Lastupdate?: Date | string;
}

/** Response from vw_EmployeeSearchInfo / GetEmployeeSearchInfo API (display names for search result). API may return PascalCase or camelCase. */
export interface EmployeeSearchInfoModel {
    employeeID?: number;
    EmployeeID?: number;
    fullNameEN?: string;
    FullNameEN?: string;
    fullNameBN?: string;
    FullNameBN?: string;
    rabID?: string;
    RABID?: string;
    serviceId?: string;
    ServiceId?: string;
    rankId?: number;
    RankId?: number;
    rank?: string;
    Rank?: string;
    branchId?: number;
    BranchId?: number;
    corps?: string;
    Corps?: string;
    tradeId?: number;
    TradeId?: number;
    trade?: string;
    Trade?: string;
    lastMotherUnitId?: number;
    LastMotherUnitId?: number;
    motherOrganization?: string;
    MotherOrganization?: string;
    memberTypeId?: number;
    MemberTypeId?: number;
    memberType?: string;
    MemberType?: string;
}

// ============ SEARCH CRITERIA ============
export interface EmployeeSearchCriteria {
    motherOrganization?: number;
    serviceId?: string;
    nidNo?: string;
    rabId?: string;
    nameEnglish?: string;
    rank?: number;
    status?: boolean;
}

// ============ COMPLETE PROFILE ============
export interface CompleteEmployeeProfile {
    employee: EmpModel;
    addresses: AddressInfoModel[];
}

// ============ SAVE RESPONSE ============
export interface SaveResponse {
    success: boolean;
    message: string;
    employeeID?: number;
    addressIds?: number[];
    data?: any;
}
