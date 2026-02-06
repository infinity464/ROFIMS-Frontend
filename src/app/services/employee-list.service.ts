import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { GetEmployeeListRequest, EmployeeList, AllocateRabIdRequest, AllocateRabIdResultItem } from '@/models/employee-list.model';

@Injectable({
    providedIn: 'root'
})
export class EmployeeListService {
    private readonly apiUrl = `${environment.apis.core}/EmployeeInfo`;

    constructor(private http: HttpClient) {}

    getEmployeeList(request: GetEmployeeListRequest): Observable<EmployeeList[]> {
        return this.http.post<EmployeeList[]>(`${this.apiUrl}/GetEmployeeList`, request);
    }

    allocateRabId(request: AllocateRabIdRequest): Observable<AllocateRabIdResultItem[]> {
        return this.http.post<AllocateRabIdResultItem[]>(`${this.apiUrl}/AllocateRabId`, request);
    }
}
