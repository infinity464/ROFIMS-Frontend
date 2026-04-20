import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

const BASE = `${environment.apis.core}/IdentityUserMemberTypeAccess`;

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
}
