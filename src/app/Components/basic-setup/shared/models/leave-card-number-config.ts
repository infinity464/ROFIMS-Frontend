/**
 * Single global counter for the auto-incrementing leave certificate number
 * (ছুটির সনদপত্র নং-). Mirrors RabIdSerial: minId is the start value (admin-supplied),
 * currentId is the latest value handed out (null until the first leave is approved).
 */
export interface LeaveCardNumberConfigModel {
    configId: number;
    minId: number;
    currentId: number | null;

    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}
