/** Matches backend rab.Models.RoleMenuPermission */
export interface RoleMenuPermissionModel {
    id: number;
    roleId: string;
    menuId: number;
    canView: boolean;
    canInsert: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    isActive: boolean;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastUpdatedDate: string;
}

/**
 * Used by the permission matrix UI: a menu enriched with
 * the current permission flags for the selected role.
 */
export interface MenuPermissionRow {
    menuId: number;
    menuNameEn: string;
    menuNameBangla: string | null;
    parentMenuId: number | null;
    permissionKey: string | null;
    menuType: number;
    iconName: string | null;
    sortOrder: number;
    /** Populated from RoleMenuPermission table; null if no row exists yet */
    permissionId: number | null;
    canView: boolean;
    canInsert: boolean;
    canUpdate: boolean;
    canDelete: boolean;
}

/**
 * Returned by GetUserMenus endpoint: menu + permission flags for the logged-in user's role.
 * Stored in localStorage for dynamic sidebar rendering.
 */
export interface UserMenuModel {
    menuId: number;
    menuNameEn: string;
    menuNameBangla: string | null;
    parentMenuId: number | null;
    iconName: string | null;
    menuType: number;
    routerName: string | null;
    exactMatch: boolean;
    isExternal: boolean;
    url: string | null;
    target: string | null;
    sortOrder: number;
    permissionKey: string | null;
    canView: boolean;
    canInsert: boolean;
    canUpdate: boolean;
    canDelete: boolean;
}
