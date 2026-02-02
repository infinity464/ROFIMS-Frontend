export interface RabIdSerialModel {
    rabIdSerialId: number;
    officerTypeId: number;
    minId: number;
    maxId: number;
    currentId: number | null;

    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;

    // Navigation property (optional, for display)
    officerType?: {
        codeId: number;
        codeValueEN: string;
        codeValueBN: string;
    };
}
