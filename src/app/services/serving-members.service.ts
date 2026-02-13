import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import { PagedResponse } from '@/Core/Models/Pagination';

@Injectable({
    providedIn: 'root'
})
export class ServingMembersService {
    private readonly apiUrl = `${environment.apis.core}/EmployeeInfo`;

    constructor(private http: HttpClient) {}

    getPresentlyServingMembers(): Observable<EmployeeServiceOverview[]> {
        return this.http.get<EmployeeServiceOverview[]>(`${this.apiUrl}/GetBasicServiceInformationOfServingMember`);
    }

    getPresentlyServingMembersPaginated(pageNo: number, rowPerPage: number): Observable<PagedResponse<EmployeeServiceOverview>> {
        const params = new HttpParams().set('page_no', String(pageNo)).set('row_per_page', String(rowPerPage));
        return this.http.get<PagedResponse<EmployeeServiceOverview>>(`${this.apiUrl}/GetBasicServiceInformationOfServingMemberPaginated`, { params });
    }

    /** Gets employee profile (Basic Service + Other Personal Information) from vw_EmployeePersonalServiceOverview. */
    getEmployeePersonalServiceOverview(employeeId: number): Observable<EmployeePersonalServiceOverview> {
        return this.http.get<EmployeePersonalServiceOverview>(`${this.apiUrl}/GetEmployeePersonalServiceOverview/${employeeId}`);
    }
}
