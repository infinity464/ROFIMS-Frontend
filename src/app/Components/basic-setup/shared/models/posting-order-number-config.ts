export interface PostingOrderNumberConfigModel {
    configId: number;
    postingType: string;
    prefix: string;
    prefixBN: string;
    startNumber: number;
    currentNumber: number;
    currentYear: number;
    currentMonth: number;
    status: boolean;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}
