import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { GetEmployeeListRequest, EmployeeList, AllocateRabIdRequest, AllocateRabIdResultItem } from '@/models/employee-list.model';
import { PagedResponse } from '@/Core/Models/Pagination';

/** Request body for GetSupernumeraryListPaginated API. */
export interface GetSupernumeraryListPaginatedRequest {
    orgIds: number[];
    memberTypeId: number;
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

    getSupernumeraryList(request: GetEmployeeListRequest): Observable<EmployeeList[]> {
        return this.http.post<EmployeeList[]>(`${this.apiUrl}/GetSupernumeraryList`, request);
    }

    getSupernumeraryListPaginated(request: GetSupernumeraryListPaginatedRequest): Observable<PagedResponse<EmployeeList>> {
        return this.http.post<PagedResponse<EmployeeList>>(`${this.apiUrl}/GetSupernumeraryListPaginated`, request);
    }

    allocateRabId(request: AllocateRabIdRequest): Observable<AllocateRabIdResultItem[]> {
        return this.http.post<AllocateRabIdResultItem[]>(`${this.apiUrl}/AllocateRabId`, request);
    }
}
