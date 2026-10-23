export interface EquivalentNameVacancyDistributionModel {
    id?: number;
    orgId: number;
    equivalentNameId: number;
    rabCodeId: number;
    quantity: number;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

/** Per-office entry lock for the equivalent-name vacancy-distribution grid. */
export interface EquivalentNameVacancyLockModel {
    id?: number;
    orgId: number;
    rabCodeId: number;
    isLocked: boolean;
    createdBy?: string;
    lastUpdatedBy?: string;
}
