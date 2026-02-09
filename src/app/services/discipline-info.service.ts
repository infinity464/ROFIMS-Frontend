import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface DisciplineInfoModel {
    employeeId: number;
    disciplineId?: number;
    offenseDate?: string | null;
    offenseType?: number | null;
    briefStatementOfOffenceId?: number | null;
    offenseDetails?: string | null;
    punishmentTypeRAB?: number | null;
    punishmentDate?: string | null;
    punishmentTypeMotherOrg?: number | null;
    punishmentDateMotherOrg?: string | null;
    action?: string | null;
    auth?: string | null;
    remarks?: string | null;
    fileName?: string | null;
    filesReferences?: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

@Injectable({
    providedIn: 'root'
})
export class DisciplineInfoService {
    private apiUrl = `${environment.apis.core}/DisciplineInfo`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<DisciplineInfoModel[]> {
        return this.http.get<any>(`${this.apiUrl}/GetAll`).pipe(
            map((res) => {
                if (Array.isArray(res)) return res;
                if (res?.data != null && Array.isArray(res.data)) return res.data;
                return [];
            })
        );
    }

    getByEmployeeId(employeeId: number): Observable<DisciplineInfoModel[]> {
        return this.getAll().pipe(
            map((list) =>
                (list || []).filter(
                    (x: any) =>
                        (x.employeeId ?? x.EmployeeId) === employeeId
                )
            )
        );
    }

    save(payload: DisciplineInfoModel): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveAsyn`, body);
    }

    update(payload: DisciplineInfoModel): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/UpdateAsyn`, body);
    }

    delete(employeeId: number, disciplineId: number): Observable<any> {
        return this.http.delete(
            `${this.apiUrl}/DeleteAsyn/${employeeId}/${disciplineId}`
        );
    }

    private toApiPayload(p: DisciplineInfoModel): any {
        const now = new Date().toISOString();
        return {
            employeeId: p.employeeId,
            disciplineId: p.disciplineId ?? 0,
            offenseDate: p.offenseDate ?? null,
            offenseType: p.offenseType ?? null,
            briefStatementOfOffenceId: p.briefStatementOfOffenceId ?? null,
            offenseDetails: p.offenseDetails ?? null,
            punishmentTypeRAB: p.punishmentTypeRAB ?? null,
            punishmentDate: p.punishmentDate ?? null,
            punishmentTypeMotherOrg: p.punishmentTypeMotherOrg ?? null,
            punishmentDateMotherOrg: p.punishmentDateMotherOrg ?? null,
            action: p.action ?? null,
            auth: p.auth ?? null,
            remarks: p.remarks ?? null,
            fileName: p.fileName ?? null,
            filesReferences: p.filesReferences ?? null,
            createdBy: p.createdBy ?? 'user',
            createdDate: p.createdDate ?? now,
            lastUpdatedBy: p.lastUpdatedBy ?? 'user',
            lastupdate: p.lastupdate ?? now
        };
    }
}
