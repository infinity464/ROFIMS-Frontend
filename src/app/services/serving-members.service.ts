import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import { PagedResponse } from '@/Core/Models/Pagination';

export interface ServingMemberFilterOptionsItem {
    codeId: number;
    codeValueEN: string;
}

export interface ServingMemberFilterOptions {
    rabUnits: ServingMemberFilterOptionsItem[];
    ranks: ServingMemberFilterOptionsItem[];
    corps: ServingMemberFilterOptionsItem[];
    trades: ServingMemberFilterOptionsItem[];
    districts: ServingMemberFilterOptionsItem[];
    appointments: ServingMemberFilterOptionsItem[];
}

export interface ServingMemberFilterRequest {
    rabId?: string;
    serviceId?: string;
    nidId?: string;
    nameBangla?: string;
    nameEnglish?: string;
    rabUnitId?: number | null;
    rankId?: number | null;
    corpsId?: number | null;
    tradeId?: number | null;
    joiningDateFrom?: string | null;
    joiningDateTo?: string | null;
    permanentDistrictType?: number | null;
    wifePermanentDistrictType?: number | null;
    appointmentId?: number | null;
}

export interface ServingMemberPaginatedFilterRequest {
    pagination: { page_no: number; row_per_page: number };
    filter: ServingMemberFilterRequest;
}

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

    /** Gets filter dropdown options for presently serving members (RAB units, ranks, corps, trades, districts, appointments). */
    getServingMemberFilterOptions(): Observable<ServingMemberFilterOptions> {
        return this.http.get<ServingMemberFilterOptions>(`${this.apiUrl}/GetServingMemberFilterOptions`);
    }

    /** Gets presently serving members with filter and pagination. Home District = Permanent Address District; Wife Home District = Wife Permanent Address District. */
    getPresentlyServingMembersPaginatedFiltered(request: ServingMemberPaginatedFilterRequest): Observable<PagedResponse<EmployeeServiceOverview>> {
        return this.http.post<PagedResponse<EmployeeServiceOverview>>(`${this.apiUrl}/GetBasicServiceInformationOfServingMemberPaginatedFiltered`, request);
    }

    /** Gets employee profile (Basic Service + Other Personal Information) from vw_EmployeePersonalServiceOverview. */
    getEmployeePersonalServiceOverview(employeeId: number): Observable<EmployeePersonalServiceOverview> {
        return this.http.get<EmployeePersonalServiceOverview>(`${this.apiUrl}/GetEmployeePersonalServiceOverview/${employeeId}`);
    }

    // --- Ex-Members (PostingStatus = ExMember; RAB Unit from Top 1 PreviousRABServiceInfo ORDER BY ServiceFrom DESC) ---

    getExMembersPaginated(pageNo: number, rowPerPage: number): Observable<PagedResponse<EmployeeServiceOverview>> {
        const params = new HttpParams().set('page_no', String(pageNo)).set('row_per_page', String(rowPerPage));
        return this.http.get<PagedResponse<EmployeeServiceOverview>>(`${this.apiUrl}/GetBasicServiceInformationOfExMemberPaginated`, { params });
    }

    getExMembersPaginatedFiltered(request: ServingMemberPaginatedFilterRequest): Observable<PagedResponse<EmployeeServiceOverview>> {
        return this.http.post<PagedResponse<EmployeeServiceOverview>>(`${this.apiUrl}/GetBasicServiceInformationOfExMemberPaginatedFiltered`, request);
    }
}
