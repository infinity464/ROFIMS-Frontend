export interface RabIdSerialModel {
    rabIdSerialId: number;
    employeeTypeId: number;
    motherOrgIds?: string | null; // comma-separated OrgIds e.g. "1,2,3"
    minId: number;
    currentId: number | null;

    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;

    // Navigation property (optional, for display)
    employeeType?: {
        codeId: number;
        codeValueEN: string;
        codeValueBN: string;
    };
}
