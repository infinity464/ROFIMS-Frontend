import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { OrganizationModel } from '../models/organization';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class OrganizationService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/MotherOrg`;

    getAllMotherOrg(): Observable<OrganizationModel[]> {
        return this.http.get<OrganizationModel[]>(`${this.apiUrl}/GetAllMotherOrgAsyn`);
    }

    getAllActiveMotherOrgs(): Observable<OrganizationModel[]> {
        return this.http.get<OrganizationModel[]>(`${this.apiUrl}/GetAllActiveMotherOrgs`);
    }
    GetAllOrgUnit(): Observable<OrganizationModel[]> {
        return this.http.get<OrganizationModel[]>(`${this.apiUrl}/GetAllOrgUnit`);
    }

    getWithKeywordAndPaging(keyword: string, pageNumber: number, pageSize: number): Observable<OrganizationModel[]> {
        return this.http.get<OrganizationModel[]>(`${this.apiUrl}/  GetPaginatedOnSearchAsyn?searchValue=${keyword}&page_no=${pageNumber}&row_per_page=${pageSize}`);
    }

    post(data: OrganizationModel): Observable<OrganizationModel> {
        return this.http.post<OrganizationModel>(`${this.apiUrl}/SaveAsyn`, data);
    }

    update(data: OrganizationModel): Observable<OrganizationModel> {
        return this.http.put<OrganizationModel>(`${this.apiUrl}/UpdateAsyn`, data);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/DeleteAsyn/${id}`);
    }
}
