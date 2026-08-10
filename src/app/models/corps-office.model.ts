export interface CorpsOfficeAssignedCorpsModel {
    detailId?: number;
    corpsOfficeId?: number;
    // References CommonCode.codeId where codeType = 'Corps'
    corpsCodeId: number;
}

export interface CorpsOfficeModel {
    corpsOfficeId: number;
    orgId: number | null;
    authorization: number | null;
    // Member Type — CommonCode.codeId where codeType = 'EmployeeType' (single-select).
    memberTypeId: number | null;
    officeNameEN: string;
    officeNameBN: string;
    status: boolean;
    assignedCorps: CorpsOfficeAssignedCorpsModel[];

    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}
