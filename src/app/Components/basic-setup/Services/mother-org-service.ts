import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CommonCode } from '../Models/common-code';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class MotherOrgService {
    private http = inject(HttpClient);
    private apiUrl = environment.apis.core;
    private codeType = 'MotherOrg';

    getAll(): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/CommonCode/GetByTypeAsyn/${this.codeType}`);
    }

    getById(id: number): Observable<CommonCode> {
        return this.http.get<CommonCode>(`${this.apiUrl}/CommonCode/${id}`);
    }

    create(data: CommonCode): Observable<CommonCode> {
        return this.http.post<CommonCode>(`${this.apiUrl}/CommonCode/SaveAsyn`, data);
    }

    update(data: CommonCode): Observable<CommonCode> {
        return this.http.put<CommonCode>(`${this.apiUrl}/CommonCode/UpdateAsyn
`, data);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/CommonCode/DeleteAsyn/${id}`);
    }
}
