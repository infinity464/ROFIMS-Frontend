import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CommonCode } from '../Models/common-code';
import { Observable } from 'rxjs';
import { PagedResponse } from '@/Core/Models/Pagination';

@Injectable({
    providedIn: 'root'
})
export class MotherOrgService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/rab/api/CommonCode`;
    private codeType = 'location';

    getAll(): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetByTypeAsyn/${this.codeType}`);
    }

    getAllWithPaging(pageNumber: number, pageSize: number): Observable<PagedResponse<CommonCode>> {
        return this.http.get<PagedResponse<CommonCode>>(`${this.apiUrl}/GetPaginatedOnConditionAsyn/${this.codeType}?page_no=${pageNumber}&row_per_page=${pageSize}`);
    }

    getById(id: number): Observable<CommonCode> {
        return this.http.get<CommonCode>(`${this.apiUrl}/${id}`);
    }

    create(data: CommonCode): Observable<CommonCode> {
        return this.http.post<CommonCode>(`${this.apiUrl}/SaveAsyn`, data);
    }

    update(data: CommonCode): Observable<CommonCode> {
        return this.http.put<CommonCode>(
            `${this.apiUrl}/UpdateAsyn
`,
            data
        );
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/DeleteAsyn/${id}`);
    }
}
