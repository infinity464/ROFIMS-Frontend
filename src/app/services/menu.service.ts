import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { MenuModel, MenuTreeNode } from '@/models/menu.model';

@Injectable({ providedIn: 'root' })
export class MenuService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/Menu`;

    getAll(): Observable<MenuModel[]> {
        return this.http.get<MenuModel[]>(`${this.apiUrl}/GetAll`);
    }

    getById(id: number): Observable<MenuModel | null> {
        return this.http.get<MenuModel[]>(`${this.apiUrl}/GetFilteredByKeysAsyn/${id}`).pipe(
            map((data) => (data && data.length > 0 ? data[0] : null))
        );
    }

    getRootMenus(): Observable<MenuModel[]> {
        return this.http.get<MenuModel[]>(`${this.apiUrl}/GetRootMenus`);
    }

    getByParentId(parentMenuId: number): Observable<MenuModel[]> {
        return this.http.get<MenuModel[]>(`${this.apiUrl}/GetByParentId/${parentMenuId}`);
    }

    save(model: MenuModel): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, model);
    }

    update(model: MenuModel): Observable<any> {
        return this.http.put(`${this.apiUrl}/UpdateAsyn`, model);
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${id}`);
    }

    buildTree(flatList: MenuModel[]): MenuTreeNode[] {
        const map = new Map<number, MenuTreeNode>();
        const roots: MenuTreeNode[] = [];

        // Create nodes
        for (const item of flatList) {
            map.set(item.id, { data: item, children: [], expanded: true });
        }

        // Build hierarchy
        for (const item of flatList) {
            const node = map.get(item.id)!;
            if (item.parentMenuId != null && map.has(item.parentMenuId)) {
                map.get(item.parentMenuId)!.children.push(node);
            } else {
                roots.push(node);
            }
        }

        // Sort by sortOrder at each level
        const sortNodes = (nodes: MenuTreeNode[]) => {
            nodes.sort((a, b) => a.data.sortOrder - b.data.sortOrder);
            nodes.forEach((n) => sortNodes(n.children));
        };
        sortNodes(roots);

        return roots;
    }
}
