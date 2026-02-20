export interface MotherOrgRankVacancyModel {
    id?: number;
    orgId: number;
    motherOrgRankId: number;
    totalVacancy: number;
    status: boolean;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

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
