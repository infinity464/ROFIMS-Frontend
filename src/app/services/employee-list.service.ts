import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { SupernumeraryRoll } from '@/models/supernumerary-roll.model';
import { GetEmployeeListRequest, EmployeeList, AllocateRabIdRequest, AllocateRabIdResultItem, SupernumeraryEmpProfile } from '@/models/employee-list.model';
import { PagedResponse } from '@/Core/Models/Pagination';

/** Request body for GetSupernumeraryList API (no pagination). All filters optional. Dates as yyyy-MM-dd. */
export interface GetSupernumeraryListRequest {
    orgIds?: number[] | null;
    memberTypeId?: number | null;
    rankId?: number | null;
    tradeId?: number | null;
    joiningDateFrom?: string | null;
    joiningDateTo?: string | null;
    joiningDateInRABFrom?: string | null;
    joiningDateInRABTo?: string | null;
    createdDateFrom?: string | null;
    createdDateTo?: string | null;
}

/** Request body for GetSupernumeraryListPaginated API. Extends filter request with pagination + text/dropdown filters. */
export interface GetSupernumeraryListPaginatedRequest extends GetSupernumeraryListRequest {
    pagination: { page_no: number; row_per_page: number };
    serviceId?: string | null;
    rabId?: string | null;
    nameEnglish?: string | null;
    corpsId?: number | null;
    permanentDistrictType?: number | null;
    wifePermanentDistrictType?: number | null;
}

export interface GetEmployeesByPostingStatusRequest {
    postingStatus: string;
    orgIds?: number[] | null;
    memberTypeId?: number | null;
    rankId?: number | null;
    tradeId?: number | null;
}

export interface GetEmployeesByPostingStatusPaginatedRequest {
    postingStatus: string;
    pagination: { page_no: number; row_per_page: number };
    orgIds?: number[] | null;
    memberTypeId?: number | null;
    rankId?: number | null;
    tradeId?: number | null;
    serviceId?: string | null;
    rabId?: string | null;
    nameEnglish?: string | null;
    corpsId?: number | null;
    permanentDistrictType?: number | null;
    wifePermanentDistrictType?: number | null;
}

@Injectable({
    providedIn: 'root'
})
export class EmployeeListService {
    private readonly apiUrl = `${environment.apis.core}/EmployeeInfo`;

    constructor(private http: HttpClient) {}

    getEmployeeList(request: GetEmployeeListRequest): Observable<EmployeeList[]> {
        return this.http.post<EmployeeList[]>(`${this.apiUrl}/GetEmployeeList`, request);
    }

    /** All filters optional. Returns full list for client-side pagination. */
    getSupernumeraryList(request: GetSupernumeraryListRequest): Observable<EmployeeList[]> {
        return this.http.post<EmployeeList[]>(`${this.apiUrl}/GetSupernumeraryList`, request);
    }

    /**
     * Rows for the supernumerary RAB-ID allocation roll. Posts the ids already on
     * screen rather than re-sending filters, so the printed roll matches the
     * filtered list exactly.
     */
    getSupernumeraryNominalRoll(employeeIds: number[]): Observable<SupernumeraryRoll> {
        return this.http
            .post<any>(`${this.apiUrl}/GetSupernumeraryNominalRoll`, { employeeIds })
            .pipe(
                map((r) => ({
                    rows: (r?.rows ?? r?.Rows ?? []).map((x: any) => ({
                        employeeId: x.employeeId ?? x.EmployeeId ?? 0,
                        groupNameEN: x.groupNameEN ?? x.GroupNameEN ?? null,
                        groupNameBN: x.groupNameBN ?? x.GroupNameBN ?? null,
                        groupSortOrder: x.groupSortOrder ?? x.GroupSortOrder ?? null,
                        serviceId: x.serviceId ?? x.ServiceId ?? null,
                        rankNameEN: x.rankNameEN ?? x.RankNameEN ?? null,
                        rankNameBN: x.rankNameBN ?? x.RankNameBN ?? null,
                        rankSortOrder: x.rankSortOrder ?? x.RankSortOrder ?? null,
                        fullNameEN: x.fullNameEN ?? x.FullNameEN ?? null,
                        fullNameBN: x.fullNameBN ?? x.FullNameBN ?? null,
                        ownDistrictEN: x.ownDistrictEN ?? x.OwnDistrictEN ?? null,
                        ownDistrictBN: x.ownDistrictBN ?? x.OwnDistrictBN ?? null,
                        spouseDistrictEN: x.spouseDistrictEN ?? x.SpouseDistrictEN ?? null,
                        spouseDistrictBN: x.spouseDistrictBN ?? x.SpouseDistrictBN ?? null,
                        motherUnitNameEN: x.motherUnitNameEN ?? x.MotherUnitNameEN ?? null,
                        motherUnitNameBN: x.motherUnitNameBN ?? x.MotherUnitNameBN ?? null,
                        motherUnitDistrictEN: x.motherUnitDistrictEN ?? x.MotherUnitDistrictEN ?? null,
                        motherUnitDistrictBN: x.motherUnitDistrictBN ?? x.MotherUnitDistrictBN ?? null,
                        joiningDate: x.joiningDate ?? x.JoiningDate ?? null,
                        rabId: x.rabId ?? x.RabId ?? null
                    }))
                }))
            );
    }

    getEmployeesByPostingStatus(request: GetEmployeesByPostingStatusRequest): Observable<EmployeeList[]> {
        return this.http.post<EmployeeList[]>(`${this.apiUrl}/GetEmployeesByPostingStatus`, request);
    }

    getSupernumeraryListPaginated(request: GetSupernumeraryListPaginatedRequest): Observable<PagedResponse<EmployeeList>> {
        return this.http.post<PagedResponse<EmployeeList>>(`${this.apiUrl}/GetSupernumeraryListPaginated`, request);
    }

    getEmployeesByPostingStatusPaginated(request: GetEmployeesByPostingStatusPaginatedRequest): Observable<PagedResponse<EmployeeList>> {
        return this.http.post<PagedResponse<EmployeeList>>(`${this.apiUrl}/GetEmployeesByPostingStatusPaginated`, request);
    }

    allocateRabId(request: AllocateRabIdRequest): Observable<AllocateRabIdResultItem[]> {
        return this.http.post<AllocateRabIdResultItem[]>(`${this.apiUrl}/AllocateRabId`, request);
    }

    getSupernumeraryEmpProfile(employeeId: number): Observable<SupernumeraryEmpProfile | null> {
        return this.http.get<SupernumeraryEmpProfile | null>(`${this.apiUrl}/GetSupernumeraryEmpProfile/${employeeId}`);
    }

    /** Gets employees where IsSendingNotesheetStatus equals the given status (e.g. draft). For Add Draft New Posting. */
    getEmployeesByIsSendingNotesheetStatus(status: string = 'draft'): Observable<EmployeeList[]> {
        return this.http.get<EmployeeList[]>(`${this.apiUrl}/GetEmployeesByIsSendingNotesheetStatus`, { params: { status } });
    }

    /** Gets serving employees (PostingStatus=Servings) not in any posting process. For Add Draft Inter Posting. */
    getServingEmployeesAvailableForPosting(): Observable<EmployeeList[]> {
        return this.http.get<EmployeeList[]>(`${this.apiUrl}/GetServingEmployeesAvailableForPosting`);
    }

    /** Sets IsSendingNotesheetStatus for an employee (e.g. when sending from Supernumerary List to new posting list). */
    setIsSendingNotesheetStatus(employeeId: number, isSendingNotesheetStatus: string, sendingRemark?: string): Observable<{ statusCode?: number; description?: string }> {
        return this.http.post<{ statusCode?: number; description?: string }>(`${this.apiUrl}/SetIsSendingNotesheetStatus`, {
            employeeId,
            isSendingNotesheetStatus,
            sendingRemark: sendingRemark || null
        });
    }

    /** Sets IsSendingNotesheetStatus for multiple employees in bulk (e.g. draftInterPosting from Presently Serving Members). Each item can include an optional interPostingRemark. */
    setBulkIsSendingNotesheetStatus(
        employees: { employeeId: number; interPostingRemark?: string | null }[],
        isSendingNotesheetStatus: string
    ): Observable<{ statusCode?: number; description?: string }> {
        return this.http.post<{ statusCode?: number; description?: string }>(`${this.apiUrl}/SetBulkIsSendingNotesheetStatus`, {
            employees,
            isSendingNotesheetStatus
        });
    }

    /** Gets employees marked for inter posting (IsSendingNotesheetStatus = draftInterPosting) not yet in DraftInterPostingDetail. */
    getEmployeesMarkedForInterPosting(): Observable<EmployeeList[]> {
        return this.http.get<EmployeeList[]>(`${this.apiUrl}/GetEmployeesMarkedForInterPosting`);
    }
}
