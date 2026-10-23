export interface NoteSheetApproverConfigDetailModel {
    detailId: number;
    configId: number;
    roleType: string; // ApproverRoleType enum values
    employeeId: number;
}

export interface NoteSheetApproverConfigModel {
    configId: number;
    noteSheetType: string;
    status: boolean;
    details: NoteSheetApproverConfigDetailModel[];
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}
