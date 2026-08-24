import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface PaginatedResult<T> {
    datalist: T[];
    pages: { Rows: number; TotalPages: number };
}

export interface PermanentPostingMORecordModel {
    id: number;
    recordNo: string | null;
    postedOutEmployeeId: number | null;
    postingUnitId: number | null;
    postingOrderNo: string | null;
    postingOrderDate: string | null;
    possibleReleaseDate: string | null;
    isReliever: boolean | null;
    relieverNotGivenReason: string | null;
    /** Standard reason flag — বিমোচক ব্যতীত বদলি (transfer without a reliever). */
    isTransferWithoutReliever: boolean | null;
    relieverEmployeeId: number | null;
    noteSheetClearance: boolean | null;
    nsClearanceDate: string | null;
    clearanceGiven: boolean | null;
    clearanceGivenDate: string | null;
    postingOrderFilesReferences: string | null;
    isFinalPostedOut: boolean;
    status: string;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string | null;
    serviceId: string | null;
    // Display fields from view (EN)
    postedOutName: string | null;
    postedOutRabId: string | null;
    postedOutPrefix: string | null;
    postedOutRank: string | null;
    postedOutCorps: string | null;
    postedOutTrade: string | null;
    postingUnitName: string | null;
    /** Posted-out member's PRESENT battalion (current active RAB service row). */
    postedOutRabUnitId: number | null;
    postedOutRabUnit: string | null;
    postedOutRabUnitBN: string | null;
    relieverServiceId: string | null;
    relieverPrefix: string | null;
    // Display fields (BN)
    postedOutNameBN: string | null;
    postedOutPrefixBN: string | null;
    postedOutRankBN: string | null;
    postedOutCorpsBN: string | null;
    postedOutTradeBN: string | null;
    postingUnitNameBN: string | null;
    relieverPrefixBN: string | null;
}

export interface PermanentPostingCombinedReportModel {
    id: number;
    postingOrderNo: string | null;
    postingOrderDate: string | null;
    possibleReleaseDate: string | null;
    isReliever: boolean | null;
    // Posted Out (EN)
    postedOutName: string | null;
    postedOutServiceId: string | null;
    postedOutPrefix: string | null;
    // Posted Out (BN)
    postedOutNameBN: string | null;
    postedOutPrefixBN: string | null;
    postedOutRabUnitId: number | null;
    postedOutRabUnit: string | null;
    postedOutRabUnitBN: string | null;
    // Joinee Detail
    joineeDetailId: number | null;
    isAddedInNewJoineeDataEntry: boolean | null;
    relieverServiceId: string | null;
    relieverNameBangla: string | null;
    relieverPrefix: string | null;
    relieverPrefixBN: string | null;
    // Mother Org
    motherOrgName: string | null;
    motherOrgNameBN: string | null;
    motherOrgUnitName: string | null;
    motherOrgUnitNameBN: string | null;
    // Member Type
    memberTypeName: string | null;
    memberTypeNameBN: string | null;
    // Rank
    rankName: string | null;
    rankNameBN: string | null;
    // Corps
    corpsName: string | null;
    corpsNameBN: string | null;
    // Trade
    tradeName: string | null;
    tradeNameBN: string | null;
}

export interface PostedOutServedReportModel {
    employeeID: number;
    serviceId: string | null;
    prefix: string | null;
    prefixBN: string | null;
    rank: string | null;
    rankBN: string | null;
    corps: string | null;
    corpsBN: string | null;
    trade: string | null;
    tradeBN: string | null;
    name: string | null;
    nameBN: string | null;
    servedFromDate: string | null;
    presentUnit: string | null;
    presentUnitBN: string | null;
    postedUnit: string | null;
    postedUnitBN: string | null;
    contactNumber: string | null;
    postingOrderDate: string | null;
    isFinalPostedOut: boolean | null;
    rmks: string | null;
}

export interface EmployeeClearanceStatus {
    employeeId: number;
    hasPostedOut: boolean;
    postedOutId: number | null;
    hasClearanceNoteSheet: boolean;
    clearanceNoteSheetId: number | null;
    clearanceNoteSheetNo: string | null;
    clearanceApproved: boolean;
    /** True when the latest clearance note-sheet was cancelled (member is free again). */
    clearanceCancelled: boolean;
    /** None | PostedOut | ClearanceNoteSheet | ClearanceApproved | ClearanceCancelled */
    step: string;
}

@Injectable({ providedIn: 'root' })
export class PermanentPostingMORecordService {
    private baseUrl = `${environment.apis.core}/PermanentPostingMORecord`;

    constructor(private http: HttpClient) {}

    /** Step-wise clearance workflow status for a member (posted-out → note-sheet → approved). */
    getEmployeeClearanceStatus(employeeId: number): Observable<EmployeeClearanceStatus> {
        return this.http.get<EmployeeClearanceStatus>(`${this.baseUrl}/GetEmployeeClearanceStatus/${employeeId}`);
    }

    getAll(): Observable<PermanentPostingMORecordModel[]> {
        return this.http.get<any>(`${this.baseUrl}/GetAllWithEmployeeAsyn`).pipe(map((r) => (Array.isArray(r) ? r : [])));
    }

    getAllPaginated(pageNo: number, rowPerPage: number, search?: string, dateFrom?: string, dateTo?: string)
        : Observable<PaginatedResult<PermanentPostingMORecordModel>> {
        let params = new HttpParams()
            .set('page_no', pageNo)
            .set('row_per_page', rowPerPage);
        if (search) params = params.set('search', search);
        if (dateFrom) params = params.set('dateFrom', dateFrom);
        if (dateTo) params = params.set('dateTo', dateTo);
        return this.http.get<PaginatedResult<PermanentPostingMORecordModel>>(
            `${this.baseUrl}/GetAllWithEmployeePaginated`, { params });
    }

    /** Lightweight total count (dashboard KPI) — no row payload, fast load. */
    getCount(search?: string, dateFrom?: string, dateTo?: string): Observable<number> {
        let params = new HttpParams();
        if (search) params = params.set('search', search);
        if (dateFrom) params = params.set('dateFrom', dateFrom);
        if (dateTo) params = params.set('dateTo', dateTo);
        return this.http
            .get<{ count: number }>(`${this.baseUrl}/GetAllWithEmployeeCount`, { params })
            .pipe(map((r) => r?.count ?? 0));
    }

    getById(id: number): Observable<PermanentPostingMORecordModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetFilteredByKeysAsyn/${id}`).pipe(
            map((r) => { const a = Array.isArray(r) ? r : r ? [r] : []; return a.length ? a[0] : null; })
        );
    }

    saveUpdate(model: Partial<PermanentPostingMORecordModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveUpdateAsyn`, {
            id: model.id ?? 0,
            recordNo: model.recordNo ?? null,
            postedOutEmployeeId: model.postedOutEmployeeId ?? null,
            postingUnitId: model.postingUnitId ?? null,
            postingOrderNo: model.postingOrderNo ?? null,
            postingOrderDate: model.postingOrderDate ?? null,
            possibleReleaseDate: model.possibleReleaseDate ?? null,
            isReliever: model.isReliever ?? null,
            relieverNotGivenReason: model.relieverNotGivenReason ?? null,
            isTransferWithoutReliever: model.isTransferWithoutReliever ?? null,
            relieverEmployeeId: model.relieverEmployeeId ?? null,
            noteSheetClearance: model.noteSheetClearance ?? null,
            nsClearanceDate: model.nsClearanceDate ?? null,
            clearanceGiven: model.clearanceGiven ?? null,
            clearanceGivenDate: model.clearanceGivenDate ?? null,
            postingOrderFilesReferences: model.postingOrderFilesReferences ?? null,
            isFinalPostedOut: model.isFinalPostedOut ?? false,
            status: model.status ?? 'Draft',
            createdBy: model.createdBy ?? 'system',
            lastUpdatedBy: model.lastUpdatedBy ?? 'system'
        });
    }

    getCombinedReportPaginated(
        pageNo: number, rowPerPage: number, search?: string,
        dateFrom?: string, dateTo?: string, entryStatus?: boolean | null,
        rabUnitId?: number | null
    ): Observable<PaginatedResult<PermanentPostingCombinedReportModel>> {
        let params = new HttpParams()
            .set('page_no', pageNo)
            .set('row_per_page', rowPerPage);
        if (search) params = params.set('search', search);
        if (dateFrom) params = params.set('dateFrom', dateFrom);
        if (dateTo) params = params.set('dateTo', dateTo);
        if (entryStatus !== undefined && entryStatus !== null) params = params.set('entryStatus', entryStatus);
        if (rabUnitId != null) params = params.set('rabUnitId', rabUnitId);
        return this.http.get<PaginatedResult<PermanentPostingCombinedReportModel>>(
            `${this.baseUrl}/GetCombinedReportPaginated`, { params });
    }

    getPostedOutServedReportPaginated(
        pageNo: number, rowPerPage: number, search?: string,
        dateFrom?: string, dateTo?: string, rankId?: number | null, presentUnitId?: number | null
    ): Observable<PaginatedResult<PostedOutServedReportModel>> {
        let params = new HttpParams()
            .set('page_no', pageNo)
            .set('row_per_page', rowPerPage);
        if (search) params = params.set('search', search);
        if (dateFrom) params = params.set('dateFrom', dateFrom);
        if (dateTo) params = params.set('dateTo', dateTo);
        if (rankId != null) params = params.set('rankId', rankId);
        if (presentUnitId != null) params = params.set('presentUnitId', presentUnitId);
        return this.http.get<PaginatedResult<PostedOutServedReportModel>>(
            `${this.baseUrl}/GetPostedOutServedReportPaginated`, { params });
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${id}`);
    }
}
