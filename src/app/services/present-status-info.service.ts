import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

@Injectable({
    providedIn: 'root'
})
export class PresentStatusInfoService {
    private apiUrl = `${environment.apis.core}/PresentStatusInfo`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/GetAll`).pipe(
            map((res: any) => (Array.isArray(res) ? res : [])),
            catchError((err) => {
                console.error('Error fetching present status records', err);
                return of([]);
            })
        );
    }

    getAllByEmployeeId(employeeId: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/GetByEmployeeIdAsyn/${employeeId}`).pipe(
            map((data) => (Array.isArray(data) ? data : data ? [data] : [])),
            catchError((err) => {
                console.error('Error fetching present status records', err);
                return of([]);
            })
        );
    }

    save(payload: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, payload);
    }

    update(payload: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/UpdateAsyn`, payload);
    }

    delete(presentStatusId: number, employeeId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${presentStatusId}/${employeeId}`);
    }
}
