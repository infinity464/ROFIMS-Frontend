// ============ EMPLOYEE INFO MODEL ============
export interface EmployeeInfoModel {
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
    OfficerType?: number | null;
    OrgId?: number | null;
    RelieverId?: number | null;
    CreatedBy?: string;
    CreatedDate?: Date | string;
    LastUpdatedBy?: string;
    Lastupdate?: Date | string;
    StatusDate?: Date | string;
}

export type LocationType = 'PERMANENT' | 'PRESENT' | 'WIFE_PERMANENT' | 'WIFE_PRESENT';

export interface AddressInfoModel {
    EmployeeID: number;
    AddressId: number;
    FMID: number;
    LocationType: LocationType;
    LocationCode: string;
    PostCode: string; // ✅ Changed from number to string
    AddressAreaEN?: string;
    AddressAreaBN?: string;
    DivisionType?: number | null;
    ThanaType?: number | null;
    PostOfficeType?: number | null;
    CreatedBy?: string;
    CreatedDate?: Date | string;
    LastUpdatedBy?: string;
    Lastupdate?: Date | string;
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
    employee: EmployeeInfoModel;
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
