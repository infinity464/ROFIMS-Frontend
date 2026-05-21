import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

const BASE = `${environment.apis.core}/IdentityUserRabUnitAccess`;
export const RAB_UNIT_ACCESS_CACHE_KEY = 'currentUserRabUnitAccess';

export interface OrgPathSegment {
  /** Display name (CodeValueEN) of the segment. */
  name: string;
  /**
   * CommonCode CodeType — e.g. "RabUnit", "RabWing", "RabBranch", "RabSubBranch",
   * "RabSection", "RabSubSection". The UI strips the "Rab" prefix to look up
   * the matching colour in <c>LEVEL_COLORS</c>.
   */
  codeType: string;
}

export interface UserRabUnitAccessDto {
  userId: string;
  rabUnitIds: number[];
  rabUnitNames: string[];
  /**
   * Breadcrumb per selected node (e.g. "RAB HQ / Admin Wing / General Branch"),
   * index-aligned with {@link rabUnitNames}. Server walks the CommonCode
   * ancestor chain. Optional for backwards compat with older API responses.
   */
  rabUnitPaths?: string[];
  /**
   * Structured form of {@link rabUnitPaths}: each outer-array element is one
   * selected node's full ancestor chain root → leaf, with codeType per segment
   * so the UI can colour each level (Unit / Wing / Branch / Sub-Branch /
   * Section / Sub-Section) independently in tooltips.
   * Index-aligned with {@link rabUnitIds}.
   */
  rabUnitPathSegments?: OrgPathSegment[][];
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

  /**
   * Returns the **selected** node CodeIds for a user — exactly what the admin
   * picked, which may now live at any org-tree depth (Unit / Wing / Branch /
   * Sub-Branch / Section / Sub-Section). Used by the edit form to pre-fill the
   * tree picker. DO NOT use this for data-scoping the logged-in user's queries —
   * use `getAccessibleOrgNodeIds` (which returns the descendant closure) instead.
   */
  getByUserId(userId: string): Observable<number[]> {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<number[]>(`${BASE}/GetByUserId`, { params });
  }

  /**
   * Returns the **descendant closure** of a user's selected nodes — i.e. every
   * org-tree CodeId the user is allowed to see. If the admin picked a Wing,
   * this returns the Wing + all its Branches + Sub-Branches + Sections + Sub-
   * Sections. Backed by a recursive CTE over CommonCode on the server.
   * This is the right input for any client-side data filter and is what the
   * localStorage cache writes via {@link cacheForUser}.
   */
  getAccessibleOrgNodeIds(userId: string): Observable<number[]> {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<number[]>(`${BASE}/GetAccessibleOrgNodeIds`, { params });
  }

  /** Returns all users with their RAB Unit accesses (for list display). */
  getAllByUser(): Observable<UserRabUnitAccessDto[]> {
    return this.http.get<UserRabUnitAccessDto[]>(`${BASE}/GetAllByUser`);
  }

  /**
   * Fetches the current user's accessible org-node IDs (the descendant closure,
   * NOT just selected nodes) and caches them in localStorage. Call once after
   * login. Swallows errors (cache is a best-effort optimization).
   *
   * The cache shape (`{ userId, rabUnitIds: number[] }`) is unchanged for
   * backwards compatibility with existing consumers — only the semantic of the
   * IDs broadened (was implicitly Unit-only because that's all the picker
   * supported; now any depth, but the closure is what callers always needed).
   */
  cacheForUser(userId: string): Observable<number[]> {
    return this.getAccessibleOrgNodeIds(userId).pipe(
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
