export interface MotherOrgRankVacancyDistributionModel {
    id?: number;
    orgId: number;
    motherOrgRankId: number;
    rabCodeId: number;
    quantity: number;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

/** Per-office entry lock for the vacancy-distribution-summary grid. */
export interface MotherOrgVacancyLockModel {
    id?: number;
    orgId: number;
    rabCodeId: number;
    isLocked: boolean;
    createdBy?: string;
    lastUpdatedBy?: string;
}
