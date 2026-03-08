export interface RABUnitAORModel {
    aorId?: number;
    rabUnitId: number;
    divisionId: number;
    districtId: number;
    upazilaId?: number | null;
    status: boolean;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

export interface ResultViewModel {
    statusCode: number;
    description?: string;
    data?: unknown;
}
