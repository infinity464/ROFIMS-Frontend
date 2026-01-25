import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Organization } from '../models/organization';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class OrganizationService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/MotherOrg`;

    getAll(): Observable<Organization[]> {
        return this.http.get<Organization[]>(`${this.apiUrl}/GetAll`);
    }

    getWithKeywordAndPaging(keyword: string, pageNumber: number, pageSize: number): Observable<Organization[]> {
        return this.http.get<Organization[]>(`${this.apiUrl}/GetPaginatedOnSearchAsyn?searchValue=${keyword}&page_no=${pageNumber}&row_per_page=${pageSize}`);
    }

    post(data: Organization): Observable<Organization> {
        return this.http.post<Organization>(`${this.apiUrl}/SaveAsyn​`, data);
    }

    update(data: Organization): Observable<Organization> {
        return this.http.put<Organization>(`${this.apiUrl}/UpdateAsyn`, data);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/DeleteAsyn/${id}`);
    }
}
