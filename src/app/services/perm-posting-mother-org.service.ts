import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface PermPostingMotherOrgModel {
    permPostingId: number;
    employeeId: number;
    poReceivedDate: string | null;
    hasReliever: boolean;
    relieverID: number | null;
    relieverJoinDate: string | null;
    isRelieverJoinStatus: boolean | null;
    nsClearanceCompDate: string | null;
    clearanceGivenDate: string | null;
    postingOrderFilesReferences: string | null;
    noteSheetFilesReferences: string | null;
    clearanceLatterFilesReferences: string | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}

@Injectable({
    providedIn: 'root'
})
export class PermPostingMotherOrgService {
    private baseUrl = `${environment.apis.core}/PermPostingMotherOrg`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<PermPostingMotherOrgModel[]> {
        return this.http.get<PermPostingMotherOrgModel[]>(`${this.baseUrl}/GetAll`).pipe(
            map((res: any) => (Array.isArray(res) ? res : []))
        );
    }

    getByKeys(permPostingId: number, employeeId: number): Observable<PermPostingMotherOrgModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetFilteredByKeysAsyn/${permPostingId}/${employeeId}`).pipe(
            map((res: any) => {
                const arr = Array.isArray(res) ? res : res ? [res] : [];
                return arr.length ? arr[0] : null;
            })
        );
    }

    getByEmployeeId(employeeId: number): Observable<PermPostingMotherOrgModel[]> {
        return this.getAll().pipe(
            map((list) => list.filter((x: any) => (x.employeeId ?? x.EmployeeId) === employeeId))
        );
    }

    save(payload: Partial<PermPostingMotherOrgModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveAsyn`, this.toPayload(payload));
    }

    update(payload: Partial<PermPostingMotherOrgModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/UpdateAsyn`, this.toPayload(payload));
    }

    saveUpdate(payload: Partial<PermPostingMotherOrgModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveUpdateAsyn`, this.toPayload(payload));
    }

    delete(permPostingId: number, employeeId: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${permPostingId}/${employeeId}`);
    }

    private toPayload(p: Partial<PermPostingMotherOrgModel>): any {
        return {
            permPostingId: p.permPostingId ?? 0,
            employeeId: p.employeeId,
            poReceivedDate: p.poReceivedDate ?? null,
            hasReliever: p.hasReliever ?? false,
            relieverID: p.relieverID ?? null,
            relieverJoinDate: p.relieverJoinDate ?? null,
            isRelieverJoinStatus: p.isRelieverJoinStatus ?? null,
            nsClearanceCompDate: p.nsClearanceCompDate ?? null,
            clearanceGivenDate: p.clearanceGivenDate ?? null,
            postingOrderFilesReferences: p.postingOrderFilesReferences ?? null,
            noteSheetFilesReferences: p.noteSheetFilesReferences ?? null,
            clearanceLatterFilesReferences: p.clearanceLatterFilesReferences ?? null,
            createdBy: p.createdBy ?? 'system',
            lastUpdatedBy: p.lastUpdatedBy ?? 'system'
        };
    }
}
