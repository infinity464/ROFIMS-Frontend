import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { UserMenuModel } from '@/models/role-menu-permission.model';
import { MenuType } from '@/models/enums';

const STORAGE_KEY = 'user_menus';
@Injectable({ providedIn: 'root' })
export class UserMenuService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/RoleMenuPermission`;

    /** Fetch user menus from backend by role ID */
    loadUserMenus(roleId: string): Observable<UserMenuModel[]> {
        return this.http.get<UserMenuModel[]>(`${this.apiUrl}/GetUserMenus/${roleId}`);
    }

    /** Store menus in localStorage */
    storeMenus(menus: UserMenuModel[]): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(menus));
    }

    /** Read menus from localStorage */
    getStoredMenus(): UserMenuModel[] {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        try {
            return JSON.parse(raw) as UserMenuModel[];
        } catch {
            return [];
        }
    }

    /** Clear menus from localStorage */
    clearMenus(): void {
        localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * Convert flat UserMenuModel[] to PrimeNG MenuItem[] tree
     * for the PanelMenu sidebar.
     */
    buildPrimeNGMenu(flatMenus: UserMenuModel[]): MenuItem[] {
        // Filter out menus where canView is explicitly false
        const viewable = flatMenus.filter(m => m.canView !== false);
        const sorted = [...viewable].sort((a, b) => a.sortOrder - b.sortOrder);

        // First pass: create all MenuItems
        const menuItemMap = new Map<number, MenuItem>();
        for (const m of sorted) {
            const item: MenuItem = {
                label: m.menuNameEn,
                icon: m.iconName ? `pi pi-fw ${m.iconName}` : undefined
            };

            if (m.menuType === MenuType.AngularRoute && m.routerName) {
                item.routerLink = [m.routerName];
                if (m.exactMatch) {
                    item.routerLinkActiveOptions = {
                        paths: 'exact',
                        queryParams: 'ignored',
                        matrixParams: 'ignored',
                        fragment: 'ignored'
                    };
                }
            } else if (m.menuType === MenuType.ExternalLink && m.url) {
                item.url = m.url;
                item.target = m.target || '_blank';
            }

            menuItemMap.set(m.menuId, item);
        }

        // Second pass: build hierarchy
        const roots: MenuItem[] = [];
        for (const m of sorted) {
            const item = menuItemMap.get(m.menuId)!;
            if (m.parentMenuId && menuItemMap.has(m.parentMenuId)) {
                const parent = menuItemMap.get(m.parentMenuId)!;
                if (!parent.items) parent.items = [];
                parent.items.push(item);
            } else {
                roots.push(item);
            }
        }

        return roots;
    }

    /**
     * Check if the current user has a specific permission for a menu.
     * @param permissionKey The permissionKey of the menu to check
     * @param action The permission action to check
     */
    hasPermission(permissionKey: string, action: 'canView' | 'canInsert' | 'canUpdate' | 'canDelete'): boolean {
        const menus = this.getStoredMenus();
        const menu = menus.find(m => m.permissionKey === permissionKey);
        return menu ? menu[action] : false;
    }

    /**
     * Get all permission flags for a menu identified by its route path.
     * Strips query params and leading/trailing slashes before matching.
     */
    getPermissionsByRoute(routePath: string): { canView: boolean; canInsert: boolean; canUpdate: boolean; canDelete: boolean } {
        const noPerms = { canView: false, canInsert: false, canUpdate: false, canDelete: false };
        if (!routePath) return noPerms;

        const normalize = (p: string) => p.split('?')[0].replace(/^\/+|\/+$/g, '').toLowerCase();
        const target = normalize(routePath);
        const menus = this.getStoredMenus();
        const menu = menus.find(m => m.routerName && normalize(m.routerName) === target);
        if (!menu) return noPerms;
        return {
            canView: menu.canView,
            canInsert: menu.canInsert,
            canUpdate: menu.canUpdate,
            canDelete: menu.canDelete
        };
    }
}
