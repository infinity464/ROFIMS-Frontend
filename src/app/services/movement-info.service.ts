import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { MovementInfoModel } from '@/models/movement-info.model';
import { PagedResponse } from '@/Core/Models/Pagination';

export interface MovementInfoFilterRequest {
    searchText?: string;
    moveOrderType?: number | null;
    /** ISO date (yyyy-MM-dd). */
    dateFrom?: string | null;
    /** ISO date (yyyy-MM-dd). */
    dateTo?: string | null;
}

export interface MovementInfoPaginatedFilterRequest {
    pagination: { page_no: number; row_per_page: number };
    filter: MovementInfoFilterRequest;
}

/** Flat row returned by GetByEmployeeId — display strings are pre-joined on the server. */
export interface MovementInfoByEmployeeDto {
    movementId: number;
    letterNo: string | null;
    letterDate: string | null;
    /** 1 = Permanent, 2 = Temporary. */
    movementType: number;
    /** 1 = CC, 2 = MO, 3 = Article47Handover, 4 = Article47Takeover. */
    moveOrderType: number;
    movementReasonId: number | null;
    movementReason: string | null;
    movementReasonBN: string | null;
    destinedMotherUnitId: number | null;
    destinedMotherUnit: string | null;
    destinedMotherUnitBN: string | null;
    destinedRABUnitId: number | null;
    destinedRABUnit: string | null;
    destinedRABUnitBN: string | null;
    dateOfRelease: string | null;
    dateOfReduce: string | null;
    handoverDate: string | null;
    takeoverDate: string | null;
}

/** Payload for recording the return of a Temporary movement. */
export interface RecordMovementReturnRequest {
    movementId: number;
    /** ISO date (yyyy-MM-dd). */
    returnDate?: string | null;
    returnDetails?: string | null;
    returnRemark?: string | null;
    /** JSON-serialised array of { fileId, fileName } attached return files. */
    returnFiles?: string | null;
    lastUpdatedBy?: string;
}

@Injectable({ providedIn: 'root' })
export class MovementInfoService {
    private http = inject(HttpClient);
    private baseUrl = `${environment.apis.core}/MovementInfo`;

    getAll(): Observable<MovementInfoModel[]> {
        return this.http.get<MovementInfoModel[]>(`${this.baseUrl}/GetAll`);
    }

    getPaginatedFiltered(request: MovementInfoPaginatedFilterRequest): Observable<PagedResponse<MovementInfoModel>> {
        return this.http.post<PagedResponse<MovementInfoModel>>(`${this.baseUrl}/GetPaginatedFiltered`, request);
    }

    getById(movementId: number): Observable<MovementInfoModel> {
        return this.http.get<MovementInfoModel>(`${this.baseUrl}/GetFilteredByKeysAsyn/${movementId}`);
    }

    /** All movements in which the employee appears, joined with reason / destined-unit names. */
    getByEmployeeId(employeeId: number): Observable<MovementInfoByEmployeeDto[]> {
        return this.http.get<MovementInfoByEmployeeDto[]>(`${this.baseUrl}/GetByEmployeeId/${employeeId}`);
    }

    /** Lookup a movement by opaque PublicToken (used by the QR-code URL). */
    getByPublicToken(token: string): Observable<MovementInfoModel | MovementInfoModel[]> {
        return this.http.get<MovementInfoModel | MovementInfoModel[]>(
            `${this.baseUrl}/GetByPublicToken/${encodeURIComponent(token)}`
        );
    }

    save(model: MovementInfoModel): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveAsyn`, model);
    }

    update(model: MovementInfoModel): Observable<any> {
        return this.http.post(`${this.baseUrl}/UpdateAsyn`, model);
    }

    delete(movementId: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${movementId}`);
    }

    recordReturn(request: RecordMovementReturnRequest): Observable<any> {
        return this.http.post(`${this.baseUrl}/RecordReturn`, request);
    }
}
