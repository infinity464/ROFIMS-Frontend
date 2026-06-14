import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { EmployeePersonalServiceOverview, EmployeeBriefProfile } from '@/models/employee-personal-service-overview.model';
import { PagedResponse } from '@/Core/Models/Pagination';

export interface ServingMemberFilterOptionsItem {
    codeId: number;
    codeValueEN: string;
    /** Owning Mother Organization (set for ranks/corps/trades; drives the cascade). */
    orgId?: number | null;
    /** Parent CommonCode (set for trades = Corps CodeId; drives the Trade-by-Corps cascade). */
    parentCodeId?: number | null;
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
    motherOrganizationId?: number | null;
    rabUnitId?: number | null;
    rankId?: number | null;
    corpsId?: number | null;
    tradeId?: number | null;
    joiningDateFrom?: string | null;
    joiningDateTo?: string | null;
    permanentDistrictType?: number | null;
    wifePermanentDistrictType?: number | null;
    appointmentId?: number | null;
    /** Subtree filter: placement under this CommonCode org node (inclusive). */
    organogramNodeCodeId?: number | null;
}

/** Rollup serving counts per org tree node (API: GetServingOrganogramCounts). */
export interface OrganogramCountItem {
    codeId: number;
    servingCount: number;
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

    /** Lightweight count of presently-serving members (dashboard KPI) — no row payload, fast load. */
    getPresentlyServingCount(): Observable<number> {
        return this.http
            .get<{ count: number }>(`${this.apiUrl}/GetBasicServiceInformationOfServingMemberCount`)
            .pipe(map((r) => r?.count ?? 0));
    }

    /** Gets filter dropdown options for presently serving members (RAB units, ranks, corps, trades, districts, appointments). */
    getServingMemberFilterOptions(): Observable<ServingMemberFilterOptions> {
        return this.http.get<ServingMemberFilterOptions>(`${this.apiUrl}/GetServingMemberFilterOptions`);
    }

    /** Rollup serving member counts per org CommonCode node (same hierarchy as org-tree). */
    getServingOrganogramCounts(): Observable<OrganogramCountItem[]> {
        return this.http.get<OrganogramCountItem[]>(`${this.apiUrl}/GetServingOrganogramCounts`);
    }

    /** Gets presently serving members with filter and pagination. Home District = Permanent Address District; Spouse Home District = Spouse Permanent Address District. */
    getPresentlyServingMembersPaginatedFiltered(request: ServingMemberPaginatedFilterRequest): Observable<PagedResponse<EmployeeServiceOverview>> {
        return this.http.post<PagedResponse<EmployeeServiceOverview>>(`${this.apiUrl}/GetBasicServiceInformationOfServingMemberPaginatedFiltered`, request);
    }

    /** Gets employee profile (Basic Service + Other Personal Information) from vw_EmployeePersonalServiceOverview. */
    getEmployeePersonalServiceOverview(employeeId: number): Observable<EmployeePersonalServiceOverview> {
        return this.http.get<EmployeePersonalServiceOverview>(`${this.apiUrl}/GetEmployeePersonalServiceOverview/${employeeId}`);
    }

    getEmployeeBriefProfile(employeeId: number): Observable<EmployeeBriefProfile> {
        return this.http.get<EmployeeBriefProfile>(`${this.apiUrl}/GetEmployeeBriefProfile/${employeeId}`);
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
