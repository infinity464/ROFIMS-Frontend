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
