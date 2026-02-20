import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, map, tap, catchError } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

const BASE = `${environment.apis.core}/IdentityUserMapping`;
const CACHE_KEY = 'currentUserEmployeeMapping';

export interface IdentityUserMappingDto {
  userId: string;
  email: string;
  userName: string;
  employeeId?: number | null;
  /** API may return PascalCase */
  EmployeeId?: number | null;
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
  constructor(
    private http: HttpClient,
  ) {}

  /**
   * Returns the Employee ID for the given identity userId using IdentityUserMapping.
   * Caches result in localStorage for optimization.
   */
  getEmployeeIdForUser(userId: string | null): Observable<number | null> {
    if (!userId || userId.trim() === '') return of(null);
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { u, e } = JSON.parse(cached);
        if (u === userId && typeof e === 'number' && e > 0) return of(e);
      }
    } catch { /* ignore parse error */ }
    return this.http.get<IdentityUserMappingDto[]>(`${BASE}/GetMappings`).pipe(
      map((list) => {
        const arr = Array.isArray(list) ? list : [];
        const m = arr.find((x: any) => (x.userId ?? x.UserId ?? '') === userId);
        const empId = m?.employeeId ?? m?.EmployeeId ?? null;
        return typeof empId === 'number' && empId > 0 ? empId : null;
      }),
      tap((empId) => {
        if (empId != null) {
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ u: userId, e: empId }));
          } catch { /* ignore */ }
        }
      }),
      catchError(() => of(null))
    );
  }

  /** Clears the cached employee mapping (call on logout). */
  clearEmployeeMappingCache(): void {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }

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
