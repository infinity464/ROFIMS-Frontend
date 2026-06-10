import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { PagedResponse } from '@/Core/Models/Pagination';

export interface PermanentPostingJoineeDetailModel {
    id: number;
    permanentPostingMORecordId: number | null;
    isAddedInNewJoineeDataEntry: boolean;
    employeeId: number | null;
    prefixId: number | null;
    motherOrgId: number | null;
    motherOrgUnitId: number | null;
    memberType: number | null;
    rank: number | null;
    corps: number | null;
    trade: number | null;
    serviceId: string | null;
    previousRabId: string | null;
    nameBangla: string | null;
    joiningOrderNo: string | null;
    joiningOrderDate: string | null;
    possibleJoiningDate: string | null;
    joiningOrderFilesReferences: string | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string | null;
}

export interface PermanentPostingJoineeDetailListModel {
    id: number;
    permanentPostingMORecordId: number | null;
    isAddedInNewJoineeDataEntry: boolean;
    employeeId: number | null;
    serviceId: string | null;
    previousRabId: string | null;
    nameBangla: string | null;
    joiningOrderNo: string | null;
    joiningOrderDate: string | null;
    possibleJoiningDate: string | null;
    joiningOrderFilesReferences: string | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string | null;
    linkStatus: string | null;
    parentRecordNo: string | null;
    postedOutEmployeeId: number | null;
    postedOutServiceId: string | null;
    postedOutNameBN: string | null;
    postedOutNameEN: string | null;
    postedOutRank: string | null;
    postedOutRankBN: string | null;
    postedOutRabUnit: string | null;
    postedOutRabUnitBN: string | null;
    motherOrgName: string | null;
    motherOrgNameBN: string | null;
    motherOrgUnitName: string | null;
    motherOrgUnitNameBN: string | null;
    memberTypeName: string | null;
    memberTypeNameBN: string | null;
    prefixName: string | null;
    prefixNameBN: string | null;
    rankName: string | null;
    rankNameBN: string | null;
    corpsName: string | null;
    corpsNameBN: string | null;
    tradeName: string | null;
    tradeNameBN: string | null;
}

export interface PermanentPostingJoineeDetailFilterRequest {
    searchText?: string;
    isAddedInNewJoineeDataEntry?: boolean | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    possibleJoiningDateFrom?: string | null;
    possibleJoiningDateTo?: string | null;
}

export interface PermanentPostingJoineeDetailPaginatedFilterRequest {
    pagination: { page_no: number; row_per_page: number };
    filter: PermanentPostingJoineeDetailFilterRequest;
}

@Injectable({ providedIn: 'root' })
export class PermanentPostingJoineeDetailService {
    private baseUrl = `${environment.apis.core}/PermanentPostingJoineeDetail`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<PermanentPostingJoineeDetailModel[]> {
        return this.http.get<any>(`${this.baseUrl}/GetAll`).pipe(map((r) => (Array.isArray(r) ? r : [])));
    }

    getAllList(): Observable<PermanentPostingJoineeDetailListModel[]> {
        return this.http.get<any>(`${this.baseUrl}/GetAllListAsyn`).pipe(map((r) => (Array.isArray(r) ? r : [])));
    }

    getPaginatedFiltered(request: PermanentPostingJoineeDetailPaginatedFilterRequest): Observable<PagedResponse<PermanentPostingJoineeDetailListModel>> {
        return this.http.post<PagedResponse<PermanentPostingJoineeDetailListModel>>(`${this.baseUrl}/GetPaginatedFiltered`, request);
    }

    getByRecordId(recordId: number): Observable<PermanentPostingJoineeDetailModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetByRecordIdAsyn/${recordId}`).pipe(
            map((r) => { const a = Array.isArray(r) ? r : r ? [r] : []; return a.length ? a[0] : null; })
        );
    }

    getByServiceId(serviceId: string): Observable<PermanentPostingJoineeDetailModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetByServiceIdAsyn/${encodeURIComponent(serviceId)}`).pipe(
            map((r) => { const a = Array.isArray(r) ? r : r ? [r] : []; return a.length ? a[0] : null; })
        );
    }

    /** Returns the joinee record only if IsAddedInNewJoineeDataEntry == false (pending). */
    getPendingByServiceId(serviceId: string): Observable<PermanentPostingJoineeDetailModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetPendingByServiceIdAsyn/${encodeURIComponent(serviceId)}`).pipe(
            map((r) => { const a = Array.isArray(r) ? r : r ? [r] : []; return a.length ? a[0] : null; })
        );
    }

    saveUpdate(model: Partial<PermanentPostingJoineeDetailModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveUpdateAsyn`, {
            id: model.id ?? 0,
            permanentPostingMORecordId: model.permanentPostingMORecordId ?? null,
            isAddedInNewJoineeDataEntry: model.isAddedInNewJoineeDataEntry ?? false,
            employeeId: model.employeeId ?? null,
            prefixId: model.prefixId ?? null,
            motherOrgId: model.motherOrgId ?? null,
            motherOrgUnitId: model.motherOrgUnitId ?? null,
            memberType: model.memberType ?? null,
            rank: model.rank ?? null,
            corps: model.corps ?? null,
            trade: model.trade ?? null,
            serviceId: model.serviceId ?? null,
            previousRabId: model.previousRabId ?? null,
            nameBangla: model.nameBangla ?? null,
            joiningOrderNo: model.joiningOrderNo ?? null,
            joiningOrderDate: model.joiningOrderDate ?? null,
            possibleJoiningDate: model.possibleJoiningDate ?? null,
            joiningOrderFilesReferences: model.joiningOrderFilesReferences ?? null,
            createdBy: model.createdBy ?? 'system',
            lastUpdatedBy: model.lastUpdatedBy ?? 'system'
        });
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${id}`);
    }
}
