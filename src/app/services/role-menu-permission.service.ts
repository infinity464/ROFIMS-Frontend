import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { RoleMenuPermissionModel } from '@/models/role-menu-permission.model';

@Injectable({ providedIn: 'root' })
export class RoleMenuPermissionService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/RoleMenuPermission`;

    getAll(): Observable<RoleMenuPermissionModel[]> {
        return this.http.get<RoleMenuPermissionModel[]>(`${this.apiUrl}/GetAll`);
    }

    getById(id: number): Observable<RoleMenuPermissionModel[]> {
        return this.http.get<RoleMenuPermissionModel[]>(`${this.apiUrl}/GetFilteredByKeysAsyn/${id}`);
    }

    getByRoleId(roleId: string): Observable<RoleMenuPermissionModel[]> {
        return this.http.get<RoleMenuPermissionModel[]>(`${this.apiUrl}/GetByRoleId/${roleId}`);
    }

    save(model: RoleMenuPermissionModel): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, model);
    }

    update(model: RoleMenuPermissionModel): Observable<any> {
        return this.http.put(`${this.apiUrl}/UpdateAsyn`, model);
    }

    saveUpdate(model: RoleMenuPermissionModel): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveUpdateAsyn`, model);
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${id}`);
    }
}
