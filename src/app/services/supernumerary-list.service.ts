import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { GetSupernumeraryListRequest, SupernumeraryList } from '@/models/supernumerary-list.model';

@Injectable({
    providedIn: 'root'
})
export class SupernumeraryListService {
    private readonly apiUrl = `${environment.apis.core}/EmployeeInfo`;

    constructor(private http: HttpClient) {}

    getSupernumeraryList(request: GetSupernumeraryListRequest): Observable<SupernumeraryList[]> {
        return this.http.post<SupernumeraryList[]>(`${this.apiUrl}/GetSupernumeraryList`, request);
    }
}
