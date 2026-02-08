import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import type {
  ApplicationUser,
  ApplicationRole,
  UserModel,
  UpdateRoleModel,
  Responses
} from '@/models/identity.model';

const BASE = `${environment.apis.auth}/Identity`;

@Injectable({ providedIn: 'root' })
export class IdentityService {
  constructor(private http: HttpClient) {}

  getAllUsers(): Observable<ApplicationUser[]> {
    return this.http.get<ApplicationUser[]>(`${BASE}/GetAllUsers`);
  }

  getRoles(): Observable<ApplicationRole[]> {
    return this.http.get<ApplicationRole[]>(`${BASE}/GetRoles`);
  }

  createUser(user: UserModel): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/CreateUser`, user);
  }

  updateUser(user: Partial<UserModel> & { email: string }): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/UpdateUser`, user);
  }

  createRole(role: { name: string }): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/CreateRole`, role);
  }

  updateRole(role: UpdateRoleModel): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/UpdateRole`, role);
  }
}
