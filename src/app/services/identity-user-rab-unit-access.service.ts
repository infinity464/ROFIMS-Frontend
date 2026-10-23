import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

const BASE = `${environment.apis.core}/IdentityUserRabUnitAccess`;

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
   * picked, which may live at any org-tree depth (Unit / Wing / Branch /
   * Sub-Branch / Section / Sub-Section). Used by the edit form to pre-fill the
   * tree picker.
   *
   * Note: data-scoping is enforced server-side from the JWT claim, not from
   * any client-cached list — so the FE never needs the descendant closure on
   * its own behalf. The backend endpoint
   * <c>GET /IdentityUserRabUnitAccess/GetAccessibleOrgNodeIds</c> still exists
   * if a future consumer needs the closure for any reason.
   */
  getByUserId(userId: string): Observable<number[]> {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<number[]>(`${BASE}/GetByUserId`, { params });
  }

  /** Returns all users with their RAB Unit accesses (for list display). */
  getAllByUser(): Observable<UserRabUnitAccessDto[]> {
    return this.http.get<UserRabUnitAccessDto[]>(`${BASE}/GetAllByUser`);
  }
}
