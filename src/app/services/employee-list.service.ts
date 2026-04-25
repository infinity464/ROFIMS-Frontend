import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
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

    /** Sets IsSendingNotesheetStatus for multiple employees in bulk (e.g. draftInterPosting from Presently Serving Members). */
    setBulkIsSendingNotesheetStatus(employeeIds: number[], isSendingNotesheetStatus: string): Observable<{ statusCode?: number; description?: string }> {
        return this.http.post<{ statusCode?: number; description?: string }>(`${this.apiUrl}/SetBulkIsSendingNotesheetStatus`, {
            employeeIds,
            isSendingNotesheetStatus
        });
    }

    /** Gets employees marked for inter posting (IsSendingNotesheetStatus = draftInterPosting) not yet in DraftInterPostingDetail. */
    getEmployeesMarkedForInterPosting(): Observable<EmployeeList[]> {
        return this.http.get<EmployeeList[]>(`${this.apiUrl}/GetEmployeesMarkedForInterPosting`);
    }
}
