import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

const BASE = `${environment.apis.core}/IdentityUserRabUnitAccess`;
export const RAB_UNIT_ACCESS_CACHE_KEY = 'currentUserRabUnitAccess';

export interface UserRabUnitAccessDto {
  userId: string;
  rabUnitIds: number[];
  rabUnitNames: string[];
}

export interface SetUserRabUnitAccessesRequest {
  userId: string;
  rabUnitIds: number[];
}

export interface ResultViewModel {
  statusCode: number;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class IdentityUserRabUnitAccessService {
  constructor(private http: HttpClient) {}

  /** Replace-all: sends the full current set. Empty array clears all access. */
  setAccesses(request: SetUserRabUnitAccessesRequest): Observable<ResultViewModel> {
    return this.http.post<ResultViewModel>(`${BASE}/SetAccesses`, request);
  }

  /** Returns RAB Unit CodeIds assigned to a single user. */
  getByUserId(userId: string): Observable<number[]> {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<number[]>(`${BASE}/GetByUserId`, { params });
  }

  /** Returns all users with their RAB Unit accesses (for list display). */
  getAllByUser(): Observable<UserRabUnitAccessDto[]> {
    return this.http.get<UserRabUnitAccessDto[]>(`${BASE}/GetAllByUser`);
  }

  /**
   * Fetches the current user's RAB Unit IDs from the API and caches them in localStorage.
   * Call once after login. Swallows errors (cache is a best-effort optimization).
   */
  cacheForUser(userId: string): Observable<number[]> {
    return this.getByUserId(userId).pipe(
      tap((ids) => {
        try {
          localStorage.setItem(
            RAB_UNIT_ACCESS_CACHE_KEY,
            JSON.stringify({ userId, rabUnitIds: Array.isArray(ids) ? ids : [] })
          );
        } catch {
          /* ignore storage errors */
        }
      }),
      catchError(() => of([] as number[]))
    );
  }

  /** Reads the cached RAB Unit IDs for the given user, or null if missing/stale. */
  getCachedRabUnitIds(userId: string | null): number[] | null {
    if (!userId) return null;
    try {
      const raw = localStorage.getItem(RAB_UNIT_ACCESS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { userId?: string; rabUnitIds?: unknown };
      if (parsed?.userId === userId && Array.isArray(parsed.rabUnitIds)) {
        return parsed.rabUnitIds.filter((n): n is number => typeof n === 'number');
      }
    } catch {
      /* ignore parse errors */
    }
    return null;
  }

  /** Clears the cached RAB Unit IDs (call on logout). */
  clearCache(): void {
    try {
      localStorage.removeItem(RAB_UNIT_ACCESS_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }
}
