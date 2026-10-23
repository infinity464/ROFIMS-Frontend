export interface MotherOrgOfficeHeadUnit {
    id?: number;
    orgHeadId?: number;
    unitOrgId: number;
}

export interface MotherOrgOfficeHead {
    orgHeadId: number;
    motherOrgId: number | null;
    headNameEN: string;
    headNameBN?: string;
    status?: boolean;
    units: MotherOrgOfficeHeadUnit[];

    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

/** Shape returned by the backend ResultViewModel. */
export interface OfficeHeadResult {
    statusCode: number;
    description: string;
    data?: unknown;
}
