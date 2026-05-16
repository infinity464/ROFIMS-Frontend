export interface MovementLetterNumberConfigModel {
    configId: number;
    /** Enum: CC=1, MO=2, Article47Handover=3, Article47Takeover=4 */
    moveOrderType: number;
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
