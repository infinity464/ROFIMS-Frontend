export interface CommonCode {
    orgId: number;
    codeId: number;

    codeType: string;

    codeValueEN: string;
    codeValueBN: string | null;

    commCode: string | null;

    displayCodeValueEN: string | null;
    displayCodeValueBN: string | null;

    status: boolean;

    parentCodeId: number | null;
    sortOrder: number | null;
    level: number | null;

    createdBy: string;
    createdDate: string;

    lastUpdatedBy: string;
    lastupdate: string;
}
