export interface NoteSheetTemplateModel {
    noteSheetTemplateId: number;
    name: string;
    mainTextEn: string | null;
    mainTextBn: string | null;
    remarks: string | null;
    status: boolean;
    isRelatedToEmployee: boolean;
    selectedEmployeeJson: string | null;
    approverChainJson: string | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}
