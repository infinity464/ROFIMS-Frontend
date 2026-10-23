export interface MenuModel {
    id: number;
    menuNameEn: string;
    menuNameBangla: string | null;
    parentMenuId: number | null;
    iconName: string | null;
    iconType: string | null;
    cssClass: string | null;
    menuType: number;
    routerName: string | null;
    exactMatch: boolean;
    routerOutlet: string | null;
    isExternal: boolean;
    url: string | null;
    target: string | null;
    routeParamsJson: string | null;
    sortOrder: number;
    isVisible: boolean;
    isActive: boolean;
    permissionKey: string | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}

export interface MenuTreeNode {
    data: MenuModel;
    children: MenuTreeNode[];
    expanded?: boolean;
}
