import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CommonCode } from '../models/common-code';
import { Observable } from 'rxjs';
import { PagedResponse } from '@/Core/Models/Pagination';
import { OrganizationModel } from '../../../organization-setup/models/organization';

@Injectable({
    providedIn: 'root'
})
export class MasterBasicSetupService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/CommonCode`;

    getAllByType(codeType: string): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetByTypeAsyn/${codeType}`);
    }
    getByParentId(parentCodeId: number): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetByParentIdAsyn/${parentCodeId}`);
    }

    getAncestorsOfCommonCode(codeId: number): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetParentalInfoAsyn/${codeId}`);
    }

   getAllActiveMotherOrgs(): Observable<OrganizationModel[]> {
        return this.http.get<OrganizationModel[]>(`${environment.apis.core}/MotherOrg/GetAllActiveMotherOrgs`);
    }

    getAllActiveCommonCodesByOrgIdAndType(orgId: number, codeType: string): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetActiveByOrgIdAndTypeAsyn/${orgId}/${codeType}`);
    }

    getAllWithPaging(codeType: string, pageNumber: number, pageSize: number): Observable<PagedResponse<CommonCode>> {
        return this.http.get<PagedResponse<CommonCode>>(`${this.apiUrl}/GetPaginatedOnConditionAsyn/${codeType}?page_no=${pageNumber}&row_per_page=${pageSize}`);
    }

    getByKeyordWithPaging(codeType: string, keyword: string, pageNumber: number, pageSize: number): Observable<PagedResponse<CommonCode>> {
        return this.http.get<PagedResponse<CommonCode>>(`${this.apiUrl}/GetPaginatedOnSearchAsyn/${codeType}?searchValue=${keyword}&page_no=${pageNumber}&row_per_page=${pageSize}`);
    }

    create(data: CommonCode): Observable<CommonCode> {
        return this.http.post<CommonCode>(`${this.apiUrl}/SaveAsyn`, data);
    }

    update(data: CommonCode): Observable<CommonCode> {
        return this.http.put<CommonCode>(`${this.apiUrl}/UpdateAsyn`, data);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/DeleteAsyn/${id}`);
    }
}
