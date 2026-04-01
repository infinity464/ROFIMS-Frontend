/** Hierarchy: Unit → Wing → Branch → Sub-Branch → Section → Sub-Section */
export const LEVELS = ['Unit', 'Wing', 'Branch', 'Sub-Branch', 'Section', 'Sub-Section'] as const;
export type LevelType = (typeof LEVELS)[number];

export const LEVEL_COLORS: Record<LevelType, string> = {
    'Unit': '#185FA5',
    'Wing': '#3B6D11',
    'Branch': '#854F0B',
    'Sub-Branch': '#993556',
    'Section': '#534AB7',
    'Sub-Section': '#0F6E56'
};

export interface OrgNode {
    id: number;
    orgId: number;
    commCode: string;
    codeType: string;
    nameEN: string;
    nameBN: string;
    displayNameEN: string;
    displayNameBN: string;
    status: number;
    parentId: number | null;
    sortOrder: number;
    level: number;
    children: OrgNode[];
    expanded?: boolean;
    /** True after children have been fetched (used to hide arrow when 0 children) */
    childrenLoaded?: boolean;
    /** Rollup serving count for organogram (optional; from GetServingOrganogramCounts). */
    servingCount?: number;
}

export interface CreateOrgDto {
    orgId: number;
    commCode: string;
    codeValueEN: string;
    codeValueBN?: string | null;
    displayCodeValueEN?: string | null;
    displayCodeValueBN?: string | null;
    status: number;
    parentCodeId: number | null;
    sortOrder: number;
    level: number;
    codeType: string;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

export interface UpdateOrgDto {
    orgId: number;
    commCode: string;
    codeValueEN: string;
    codeValueBN?: string | null;
    displayCodeValueEN?: string | null;
    displayCodeValueBN?: string | null;
    status: number;
    parentCodeId: number | null;
    sortOrder: number;
    level: number;
    codeType: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

/** API response shape (CommonCode table) */
export interface CommonCodeDto {
    orgId: number;
    codeId: number;
    commCode: string | null;
    codeType: string;
    codeValueEN: string;
    codeValueBN: string | null;
    displayCodeValueEN: string | null;
    displayCodeValueBN: string | null;
    status: boolean;
    parentCodeId: number | null;
    sortOrder: number | null;
    level: number | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}
