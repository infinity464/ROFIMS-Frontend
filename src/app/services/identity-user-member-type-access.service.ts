import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

const BASE = `${environment.apis.core}/IdentityUserMemberTypeAccess`;
export const MEMBER_TYPE_ACCESS_CACHE_KEY = 'currentUserMemberTypeAccess';

export interface UserMemberTypeAccessDto {
  userId: string;
  memberTypeIds: number[];
  memberTypeNames: string[];
}

export interface SetUserMemberTypeAccessesRequest {
  userId: string;
  memberTypeIds: number[];
}

export interface ResultViewModel {
  statusCode: number;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class IdentityUserMemberTypeAccessService {
  constructor(private http: HttpClient) {}

  /** Replace-all: sends the full current set. Empty array clears all access. */
  setAccesses(request: SetUserMemberTypeAccessesRequest): Observable<ResultViewModel> {
    return this.http.post<ResultViewModel>(`${BASE}/SetAccesses`, request);
  }

  /** Returns member-type CodeIds assigned to a single user. */
  getByUserId(userId: string): Observable<number[]> {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<number[]>(`${BASE}/GetByUserId`, { params });
  }

  /** Returns all users with their member-type accesses (for list display). */
  getAllByUser(): Observable<UserMemberTypeAccessDto[]> {
    return this.http.get<UserMemberTypeAccessDto[]>(`${BASE}/GetAllByUser`);
  }

  /**
   * Fetches the current user's member-type IDs from the API and caches them in localStorage.
   * Call once after login. Swallows errors (cache is a best-effort optimization).
   */
  cacheForUser(userId: string): Observable<number[]> {
    return this.getByUserId(userId).pipe(
      tap((ids) => {
        try {
          localStorage.setItem(
            MEMBER_TYPE_ACCESS_CACHE_KEY,
            JSON.stringify({ userId, memberTypeIds: Array.isArray(ids) ? ids : [] })
          );
        } catch {
          /* ignore storage errors */
        }
      }),
      catchError(() => of([] as number[]))
    );
  }

  /** Reads the cached member-type IDs for the given user, or null if missing/stale. */
  getCachedMemberTypeIds(userId: string | null): number[] | null {
    if (!userId) return null;
    try {
      const raw = localStorage.getItem(MEMBER_TYPE_ACCESS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { userId?: string; memberTypeIds?: unknown };
      if (parsed?.userId === userId && Array.isArray(parsed.memberTypeIds)) {
        return parsed.memberTypeIds.filter((n): n is number => typeof n === 'number');
      }
    } catch {
      /* ignore parse errors */
    }
    return null;
  }

  /** Clears the cached member-type IDs (call on logout). */
  clearCache(): void {
    try {
      localStorage.removeItem(MEMBER_TYPE_ACCESS_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }
}
