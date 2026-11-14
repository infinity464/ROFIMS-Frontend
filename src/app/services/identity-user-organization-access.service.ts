import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';

export interface OrganizationScopeOption {
  orgId: number;
  orgNameEN: string;
  orgNameBN?: string;
  isActive: boolean;
}

export interface UserOrganizationScope {
  userId: string;
  organizationMode: 'all' | 'specific';
  organizationIds: number[];
  organizations: OrganizationScopeOption[];
}

@Injectable({ providedIn: 'root' })
export class IdentityUserOrganizationAccessService {
  private readonly base = `${environment.apis.core}/IdentityUserOrganizationAccess`;
  constructor(private http: HttpClient) {}
  getMyScope() { return this.http.get<UserOrganizationScope>(`${this.base}/GetMyScope`); }
  getByUserId(userId: string) { return this.http.get<UserOrganizationScope>(`${this.base}/GetByUserId`, { params: { userId } }); }
}
