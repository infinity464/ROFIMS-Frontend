import { Injectable } from '@angular/core';
import { environment } from '@/Core/Environments/environment';
import { EmployeeInfoModel } from '../model/employeeinfo.model';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
@Injectable({
    providedIn: 'root'
})
export class EmployeeinfoService {
    private empApi = `${environment.apis.core}`;
    constructor(private http: HttpClient) {}

    getAll(): Observable<EmployeeInfoModel[]> {
        return this.http.get<EmployeeInfoModel[]>(`${this.empApi}/EmployeeInfo/GetAll`);
    }
}
