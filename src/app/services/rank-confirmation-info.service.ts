import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface RankConfirmationInfoModel {
    employeeId: number;
    rankConfirmId: number;
    presentRank?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    rankConfirmDate?: string | null;
    auth?: string | null;
    remarks?: string | null;
    isActive?: boolean;
    createdBy?: string | null;
    createdDate?: string | null;
    lastUpdatedBy?: string | null;
    lastupdate?: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class RankConfirmationInfoService {
    private apiUrl = `${environment.apis.core}/RankConfirmationInfo`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<RankConfirmationInfoModel[]> {
        return this.http
            .get<RankConfirmationInfoModel[]>(`${this.apiUrl}/GetAll`)
            .pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    getByEmployeeId(employeeId: number): Observable<RankConfirmationInfoModel[]> {
        return this.http
            .get<RankConfirmationInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`)
            .pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    save(payload: Partial<RankConfirmationInfoModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveAsyn`, body);
    }

    saveUpdate(payload: Partial<RankConfirmationInfoModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveUpdateAsyn`, body);
    }

    delete(employeeId: number, rankConfirmId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeId}/${rankConfirmId}`);
    }

    private toApiPayload(payload: Partial<RankConfirmationInfoModel>): any {
        const now = new Date().toISOString();
        return {
            employeeId: payload.employeeId ?? 0,
            rankConfirmId: payload.rankConfirmId ?? 0,
            presentRank: payload.presentRank ?? null,
            startDate: payload.startDate ?? null,
            endDate: payload.endDate ?? null,
            rankConfirmDate: payload.rankConfirmDate ?? null,
            auth: payload.auth ?? null,
            remarks: payload.remarks ?? null,
            isActive: payload.isActive ?? true,
            createdBy: payload.createdBy ?? 'user',
            createdDate: payload.createdDate ?? now,
            lastUpdatedBy: payload.lastUpdatedBy ?? 'user',
            lastupdate: payload.lastupdate ?? now
        };
    }
}
