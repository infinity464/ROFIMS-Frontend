export interface NoteSheetNumberConfigModel {
    configId: number;
    noteSheetType: string;
    memberTypeIds: string;
    prefix: string;
    prefixBN: string;
    startNumber: number;
    currentNumber: number;
    currentYear: number;
    currentMonth: number;
    includeDateInNumber: boolean;
    status: boolean;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}
