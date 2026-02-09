import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface PromotionInfoModel {
    employeeID: number;
    promotionID: number;
    previousRank?: number | null;
    promotedRank?: number | null;
    promotedDate?: string | null;
    auth?: string | null;
    remarks?: string | null;
    probationaryPeriod?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    isActive?: boolean;
    createdBy?: string | null;
    createdDate?: string | null;
    lastUpdatedBy?: string | null;
    lastupdate?: string | null;
    /** JSON array of { FileId, fileName } for file references */
    filesReferences?: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class PromotionInfoService {
    private apiUrl = `${environment.apis.core}/PromotionInfo`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<PromotionInfoModel[]> {
        return this.http
            .get<PromotionInfoModel[]>(`${this.apiUrl}/GetAll`)
            .pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    getByEmployeeId(employeeId: number): Observable<PromotionInfoModel[]> {
        return this.http
            .get<PromotionInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`)
            .pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    save(payload: Partial<PromotionInfoModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveAsyn`, body);
    }

    saveUpdate(payload: Partial<PromotionInfoModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveUpdateAsyn`, body);
    }

    delete(employeeID: number, promotionID: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeID}/${promotionID}`);
    }

    private toApiPayload(payload: Partial<PromotionInfoModel>): any {
        const now = new Date().toISOString();
        return {
            employeeID: payload.employeeID ?? 0,
            promotionID: payload.promotionID ?? 0,
            previousRank: payload.previousRank ?? null,
            promotedRank: payload.promotedRank ?? null,
            promotedDate: payload.promotedDate ?? null,
            auth: payload.auth ?? null,
            remarks: payload.remarks ?? null,
            probationaryPeriod: payload.probationaryPeriod ?? null,
            fromDate: payload.fromDate ?? null,
            toDate: payload.toDate ?? null,
            isActive: payload.isActive ?? true,
            createdBy: payload.createdBy ?? 'user',
            createdDate: payload.createdDate ?? now,
            lastUpdatedBy: payload.lastUpdatedBy ?? 'user',
            lastupdate: payload.lastupdate ?? now,
            filesReferences: payload.filesReferences ?? null
        };
    }
}
