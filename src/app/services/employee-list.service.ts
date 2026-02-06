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

/** Request body for GetSupernumeraryListPaginated API. Extends filter request with pagination. */
export interface GetSupernumeraryListPaginatedRequest extends GetSupernumeraryListRequest {
    pagination: { page_no: number; row_per_page: number };
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

    getSupernumeraryListPaginated(request: GetSupernumeraryListPaginatedRequest): Observable<PagedResponse<EmployeeList>> {
        return this.http.post<PagedResponse<EmployeeList>>(`${this.apiUrl}/GetSupernumeraryListPaginated`, request);
    }

    allocateRabId(request: AllocateRabIdRequest): Observable<AllocateRabIdResultItem[]> {
        return this.http.post<AllocateRabIdResultItem[]>(`${this.apiUrl}/AllocateRabId`, request);
    }

    getSupernumeraryEmpProfile(employeeId: number): Observable<SupernumeraryEmpProfile | null> {
        return this.http.get<SupernumeraryEmpProfile | null>(`${this.apiUrl}/GetSupernumeraryEmpProfile/${employeeId}`);
    }
}
