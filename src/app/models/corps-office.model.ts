export interface CorpsOfficeAssignedCorpsModel {
    detailId?: number;
    corpsOfficeId?: number;
    // References CommonCode.codeId where codeType = 'Corps'
    corpsCodeId: number;
}

export interface CorpsOfficeAssignedMemberTypeModel {
    detailId?: number;
    corpsOfficeId?: number;
    // References CommonCode.codeId where codeType = 'EmployeeType'
    memberTypeId: number;
}

export interface CorpsOfficeModel {
    corpsOfficeId: number;
    orgId: number | null;
    authorization: number | null;
    officeNameEN: string;
    officeNameBN: string;
    status: boolean;
    assignedCorps: CorpsOfficeAssignedCorpsModel[];
    // Member Types — CommonCode.codeId where codeType = 'EmployeeType' (multi-select).
    assignedMemberTypes: CorpsOfficeAssignedMemberTypeModel[];

    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}
