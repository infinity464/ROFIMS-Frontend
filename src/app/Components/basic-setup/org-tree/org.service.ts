import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import type { OrgNode, CreateOrgDto, UpdateOrgDto, CommonCodeDto } from './models/org-node.model';

const API_BASE = `${environment.apis.core}/CommonCode`;

function codeTypeToLevel(codeType: string): string {
    const key = (codeType || '').trim();
    const map: Record<string, string> = {
        RabUnit: 'Unit', RABUNIT: 'Unit', RabWing: 'Wing', RABWING: 'Wing',
        RabBranch: 'Branch', RABBRANCH: 'Branch',
        RabSubBranch: 'Sub-Branch', RABSUBBRANCH: 'Sub-Branch', SubBranch: 'Sub-Branch', 'Sub-Branch': 'Sub-Branch',
        RabSection: 'Section', RABSECTION: 'Section', Section: 'Section',
        RabSubSection: 'Sub-Section', RABSUBSECTION: 'Sub-Section', SubSection: 'Sub-Section', 'Sub-Section': 'Sub-Section',
        Unit: 'Unit', Wing: 'Wing', Branch: 'Branch'
    };
    return map[key] ?? codeType;
}

function levelToCodeType(level: string): string {
    const map: Record<string, string> = {
        Unit: 'RabUnit', Wing: 'RabWing', Branch: 'RabBranch',
        'Sub-Branch': 'RabSubBranch', Section: 'RabSection', 'Sub-Section': 'RabSubSection'
    };
    return map[level] ?? level;
}

function dtoToNode(d: any): OrgNode {
    const raw = d as Record<string, unknown>;
    const codeId = raw['codeId'] ?? raw['CodeId'];
    const parentCodeId = raw['parentCodeId'] ?? raw['ParentCodeId'] ?? null;
    const codeType = codeTypeToLevel(String(raw['codeType'] ?? raw['CodeType'] ?? ''));
    const level = Number(raw['level'] ?? raw['Level'] ?? 0);
    return {
        id: Number(codeId),
        orgId: Number(raw['orgId'] ?? raw['OrgId'] ?? 0),
        commCode: String(raw['commCode'] ?? raw['CommCode'] ?? ''),
        codeType,
        nameEN: String(raw['codeValueEN'] ?? raw['CodeValueEN'] ?? ''),
        nameBN: String(raw['codeValueBN'] ?? raw['CodeValueBN'] ?? ''),
        displayNameEN: String(raw['displayCodeValueEN'] ?? raw['DisplayCodeValueEN'] ?? ''),
        displayNameBN: String(raw['displayCodeValueBN'] ?? raw['DisplayCodeValueBN'] ?? ''),
        status: raw['status'] === true || raw['Status'] === true ? 1 : 0,
        parentId: parentCodeId != null ? Number(parentCodeId) : null,
        sortOrder: Number(raw['sortOrder'] ?? raw['SortOrder'] ?? 0),
        level,
        children: [],
        expanded: false
    };
}

@Injectable({ providedIn: 'root' })
export class OrgService {
    private http = inject(HttpClient);

    /** Load Units only (1 API call). Children loaded on expand. */
    getAll(_orgId: number): Observable<OrgNode[]> {
        return this.http.get<any>(`${API_BASE}/GetByTypeAsyn/RabUnit`).pipe(
            map(res => {
                const arr = Array.isArray(res) ? res : (res?.datalist ?? res?.data ?? res?.value ?? []);
                return (Array.isArray(arr) ? arr : []).map((d: any) => dtoToNode(d));
            }),
            catchError(() => of([]))
        );
    }

    /** Load children for a node on expand (1 API call per expand). */
    loadChildren(parentId: number): Observable<OrgNode[]> {
        return this.http.get<any>(`${API_BASE}/GetByParentIdAsyn/${parentId}`).pipe(
            map(res => {
                const arr = Array.isArray(res) ? res : (res?.datalist ?? res?.data ?? res?.value ?? []);
                return (Array.isArray(arr) ? arr : []).map((d: any) => dtoToNode(d));
            }),
            catchError(() => of([]))
        );
    }

    getTree(flat: OrgNode[]): OrgNode[] {
        return this.buildTree(flat.filter(n => n.parentId == null), flat);
    }

    buildTree(roots: OrgNode[], flat: OrgNode[]): OrgNode[] {
        return roots
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(root => ({
                ...root,
                children: this.buildTree(
                    flat.filter(n => n.parentId === root.id),
                    flat
                )
            }));
    }

    add(dto: CreateOrgDto): Observable<OrgNode> {
        const body = {
            orgId: dto.orgId,
            codeId: 0,
            commCode: dto.commCode,
            codeType: levelToCodeType(dto.codeType),
            codeValueEN: dto.codeValueEN,
            codeValueBN: dto.codeValueBN,
            displayCodeValueEN: dto.displayCodeValueEN,
            displayCodeValueBN: dto.displayCodeValueBN,
            status: dto.status === 1,
            parentCodeId: dto.parentCodeId,
            sortOrder: dto.sortOrder,
            level: dto.level,
            createdBy: dto.createdBy,
            createdDate: dto.createdDate,
            lastUpdatedBy: dto.lastUpdatedBy,
            lastupdate: dto.lastupdate
        };
        return this.http.post<CommonCodeDto>(`${API_BASE}/SaveAsyn`, body).pipe(
            map(r => (r && (r as any).codeId != null ? dtoToNode(r as CommonCodeDto) : ({} as OrgNode))),
            catchError(() => of({} as OrgNode))
        );
    }

    update(id: number, dto: UpdateOrgDto): Observable<OrgNode> {
        const body = {
            orgId: dto.orgId,
            codeId: id,
            commCode: dto.commCode,
            codeType: levelToCodeType(dto.codeType),
            codeValueEN: dto.codeValueEN,
            codeValueBN: dto.codeValueBN,
            displayCodeValueEN: dto.displayCodeValueEN,
            displayCodeValueBN: dto.displayCodeValueBN,
            status: dto.status === 1,
            parentCodeId: dto.parentCodeId,
            sortOrder: dto.sortOrder,
            level: dto.level,
            lastUpdatedBy: dto.lastUpdatedBy,
            lastupdate: dto.lastupdate
        };
        return this.http.put<CommonCodeDto>(`${API_BASE}/UpdateAsyn`, body).pipe(
            map(r => (r && (r as any).codeId != null ? dtoToNode(r as CommonCodeDto) : ({} as OrgNode))),
            catchError(() => of({} as OrgNode))
        );
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${API_BASE}/DeleteAsyn/${id}`);
    }
}
