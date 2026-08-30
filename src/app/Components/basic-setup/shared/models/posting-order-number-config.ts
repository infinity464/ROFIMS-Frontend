export interface PostingOrderNumberConfigModel {
    configId: number;
    postingType: string;
    memberTypeIds: string;
    prefix: string;
    prefixBN: string;
    startNumber: number;
    currentNumber: number;
    currentYear: number;
    currentMonth: number;
    includeDate: boolean;
    status: boolean;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}
