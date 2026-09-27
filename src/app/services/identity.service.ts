import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import type {
  UserListItem,
  ApplicationRole,
  UserModel,
  UpdateRoleModel,
  CreateRoleModel,
  Responses,
  AdminResetPasswordModel,
  SetUserActiveModel,
  SetUserHiddenModel,
  MyUserAccessRules,
  RoleUserAccessRules
} from '@/models/identity.model';

const BASE = `${environment.apis.auth}/Identity`;

@Injectable({ providedIn: 'root' })
export class IdentityService {
  constructor(private http: HttpClient) {}

  /** Every user (approver / recipient pickers). Not filtered by user-management rules. */
  getAllUsers(): Observable<UserListItem[]> {
    return this.http.get<UserListItem[]>(`${BASE}/GetAllUsers`);
  }

  /** Users the caller may see on /identity/user-create (View rule), hidden users included. */
  getManageableUsers(): Observable<UserListItem[]> {
    return this.http.get<UserListItem[]>(`${BASE}/GetManageableUsers`);
  }

  /** The caller's current user-management rules (fresh from the server, not the login copy). */
  getMyUserAccessRules(): Observable<MyUserAccessRules> {
    return this.http.get<MyUserAccessRules>(`${BASE}/GetMyUserAccessRules`);
  }

  /** Every role's user-management rules. Full-access callers only (403 otherwise). */
  getRoleUserAccessRules(): Observable<RoleUserAccessRules[]> {
    return this.http.get<RoleUserAccessRules[]>(`${BASE}/GetRoleUserAccessRules`);
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

  createRole(role: CreateRoleModel): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/CreateRole`, role);
  }

  updateRole(role: UpdateRoleModel): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/UpdateRole`, role);
  }

  adminResetPassword(model: AdminResetPasswordModel): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/AdminResetPassword`, model);
  }

  setUserActive(model: SetUserActiveModel): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/SetUserActive`, model);
  }

  /** Hide or unhide a disabled user in the /identity/user-create list. */
  setUserHidden(model: SetUserHiddenModel): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/SetUserHidden`, model);
  }

  // --- Session policy + force logout ---

  getSessionPolicy(): Observable<{ idleTimeoutMinutes: number; logoutOnBrowserClose: boolean }> {
    return this.http.get<{ idleTimeoutMinutes: number; logoutOnBrowserClose: boolean }>(`${BASE}/GetSessionPolicy`);
  }

  updateSessionPolicy(model: { idleTimeoutMinutes: number; logoutOnBrowserClose: boolean }): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/UpdateSessionPolicy`, model);
  }

  forceLogoutUser(model: { email: string }): Observable<Responses> {
    return this.http.post<Responses>(`${BASE}/ForceLogoutUser`, model);
  }
}
