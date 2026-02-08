import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

const BASE = `${environment.apis.core}/IdentityUserMapping`;

export interface IdentityUserMappingDto {
  userId: string;
  email: string;
  userName: string;
  employeeId?: number | null;
  employeeName?: string | null;
  rabID?: string | null;
  serviceId?: string | null;
}

export interface EmployeeDropdownDto {
  employeeID: number;
  fullNameEN: string | null;
  rabID: string | null;
  serviceId: string | null;
  /** Set by component for dropdown display */
  displayLabel?: string;
}

export interface SetMappingRequest {
  userId: string;
  employeeId: number;
}

export interface ResultViewModel {
  statusCode: number;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class IdentityUserMappingService {
  constructor(private http: HttpClient) {}

  getMappings(): Observable<IdentityUserMappingDto[]> {
    return this.http.get<IdentityUserMappingDto[]>(`${BASE}/GetMappings`);
  }

  setMapping(request: SetMappingRequest): Observable<ResultViewModel> {
    return this.http.post<ResultViewModel>(`${BASE}/SetMapping`, request);
  }

  clearMapping(userId: string): Observable<ResultViewModel> {
    return this.http.post<ResultViewModel>(`${BASE}/ClearMapping`, { userId });
  }

  getEmployeesForDropdown(search?: string): Observable<EmployeeDropdownDto[]> {
    let params = new HttpParams();
    if (search != null && search.trim() !== '') params = params.set('search', search.trim());
    return this.http.get<EmployeeDropdownDto[]>(`${BASE}/GetEmployeesForDropdown`, { params });
  }
}
