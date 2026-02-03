import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';

@Injectable({
    providedIn: 'root'
})
export class ServingMembersService {
    private readonly apiUrl = `${environment.apis.core}/EmployeeInfo`;

    constructor(private http: HttpClient) {}

    getPresentlyServingMembers(): Observable<EmployeeServiceOverview[]> {
        return this.http.get<EmployeeServiceOverview[]>(`${this.apiUrl}/GetBasicServiceInformationOfServingMember`);
    }
}
