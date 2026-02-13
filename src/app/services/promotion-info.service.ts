import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** PromotionInfo entity for CRUD. API: PromotionInfo/SaveAsyn, SaveUpdateAsyn, DeleteAsyn, GetByEmployeeId */
export interface PromotionInfoModel {
    employeeID: number;
    promotionID: number;
    previousRank?: number | null;
    promotedRank?: number | null;
    promotedDate?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    probationaryPeriod?: string | null;
    auth?: string | null;
    remarks?: string | null;
    isActive?: boolean;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
    filesReferences?: string | null;
}

/** Row from vw_PromotionInfoByEmployee. API: PromotionInfo/ViewByEmployeeId/{employeeId} */
export interface PromotionInfoByEmployeeView {
    employeeID: number;
    ser: number;
    previousRankId?: number | null;
    previousRank: string | null;
    promotedRankId?: number | null;
    promotedRank: string | null;
    promotedDate: string | null;
    auth: string | null;
    remarks: string | null;
    probationaryPeriod: string | null;
    fromDate: string | null;
    toDate: string | null;
    isActive: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class PromotionInfoService {
    private apiUrl = `${environment.apis.core}/PromotionInfo`;

    constructor(private http: HttpClient) {}

    /** Gets promotion list by employee (entity list for CRUD). */
    getByEmployeeId(employeeId: number): Observable<PromotionInfoModel[]> {
        return this.http.get<PromotionInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    /** Gets list from vw_PromotionInfoByEmployee by employee ID (for profile display). */
    getViewByEmployeeId(employeeId: number): Observable<PromotionInfoByEmployeeView[]> {
        return this.http.get<PromotionInfoByEmployeeView[]>(`${this.apiUrl}/GetViewByEmployeeId/${employeeId}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    /** Create new promotion. */
    save(payload: Partial<PromotionInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, payload);
    }

    /** Update existing promotion. */
    saveUpdate(payload: Partial<PromotionInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveUpdateAsyn`, payload);
    }

    /** Delete promotion. */
    delete(employeeID: number, promotionID: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeID}/${promotionID}`);
    }
}
