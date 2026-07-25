import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../Core/Environments/environment';
import { LoginAuditPagedResponse } from './login-audit.model';

@Injectable({ providedIn: 'root' })
export class LoginAuditService {
  private readonly baseUrl = `${environment.apis.auth}/LoginAudit`;

  constructor(private http: HttpClient) {}

  getAll(
    page: number = 1,
    pageSize: number = 10,
    search?: string,
    status?: string,
    fromDate?: string,
    toDate?: string
  ): Observable<LoginAuditPagedResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);
    if (fromDate) params = params.set('fromDate', fromDate);
    if (toDate) params = params.set('toDate', toDate);

    return this.http.get<LoginAuditPagedResponse>(`${this.baseUrl}/GetAll`, { params });
  }

  getByUserId(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
    status?: string,
    fromDate?: string,
    toDate?: string
  ): Observable<LoginAuditPagedResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (status) params = params.set('status', status);
    if (fromDate) params = params.set('fromDate', fromDate);
    if (toDate) params = params.set('toDate', toDate);

    return this.http.get<LoginAuditPagedResponse>(`${this.baseUrl}/GetByUserId/${userId}`, { params });
  }
}
