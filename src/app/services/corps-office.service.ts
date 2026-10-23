import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CorpsOfficeModel } from '@/models/corps-office.model';

@Injectable({ providedIn: 'root' })
export class CorpsOfficeService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/CorpsOffice`;

    getAll(): Observable<CorpsOfficeModel[]> {
        return this.http.get<CorpsOfficeModel[]>(`${this.apiUrl}/GetAll`);
    }

    getById(id: number): Observable<CorpsOfficeModel[]> {
        return this.http.get<CorpsOfficeModel[]>(`${this.apiUrl}/GetFilteredByKeysAsyn/${id}`);
    }

    create(model: CorpsOfficeModel): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, model);
    }

    update(model: CorpsOfficeModel): Observable<any> {
        return this.http.put(`${this.apiUrl}/UpdateAsyn`, model);
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${id}`);
    }
}
