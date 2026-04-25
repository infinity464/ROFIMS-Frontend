import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TreeTableModule } from 'primeng/treetable';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Toast } from 'primeng/toast';
import { Tag } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService, TreeNode } from 'primeng/api';

import { IdentityService } from '@/services/identity.service';
import { MenuService } from '@/services/menu.service';
import { RoleMenuPermissionService } from '@/services/role-menu-permission.service';
import { SharedService } from '@/shared/services/shared-service';
import { ApplicationRole } from '@/models/identity.model';
import { MenuModel } from '@/models/menu.model';
import { RoleMenuPermissionModel, MenuPermissionRow } from '@/models/role-menu-permission.model';
import { MenuType, MenuTypeOptions } from '@/models/enums';

@Component({
    selector: 'app-role-menu-permission',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TreeTableModule,
        ButtonModule,
        SelectModule,
        CheckboxModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        Toast,
        Tag,
        TooltipModule,
        ConfirmDialog
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './role-menu-permission.html',
    styleUrl: './role-menu-permission.scss'
})
export class RoleMenuPermission implements OnInit {
    roles: ApplicationRole[] = [];
    menus: MenuModel[] = [];
    selectedRole: ApplicationRole | null = null;
    treeData: TreeNode[] = [];
    allTreeData: TreeNode[] = [];
    loading = false;
    saving = false;

    // Filter & Search
    selectedMenuTypeFilter: number | null = null;
    searchText: string = '';
    menuTypeFilterOptions = [
        { label: 'Header / Group', value: MenuType.Header },
        { label: 'Angular Route', value: MenuType.AngularRoute },
        { label: 'External Link', value: MenuType.ExternalLink },
        { label: 'Action', value: MenuType.Action }
    ];

    // Expose for template
    MenuType = MenuType;
    menuTypeOptions = MenuTypeOptions;

    constructor(
        private identityService: IdentityService,
        private menuService: MenuService,
        private permissionService: RoleMenuPermissionService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        this.loadRoles();
        this.loadMenus();
    }

    loadRoles(): void {
        this.identityService.getRoles().subscribe({
            next: (roles) => {
                this.roles = roles;
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load roles' });
            }
        });
    }

    loadMenus(): void {
        this.menuService.getAll().subscribe({
            next: (menus) => {
                this.menus = menus;
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load menus' });
            }
        });
    }

    onRoleChange(): void {
        if (!this.selectedRole) {
            this.treeData = [];
            return;
        }
        this.loading = true;
        this.permissionService.getByRoleId(this.selectedRole.id).subscribe({
            next: (permissions) => {
                this.buildPermissionTree(permissions);
                this.loading = false;
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load permissions' });
                this.loading = false;
            }
        });
    }

    private buildPermissionTree(permissions: RoleMenuPermissionModel[]): void {
        const permMap = new Map<number, RoleMenuPermissionModel>();
        permissions.forEach(p => permMap.set(p.menuId, p));

        // Convert menus to MenuPermissionRow
        const rows: MenuPermissionRow[] = this.menus.map(m => {
            const perm = permMap.get(m.id);
            return {
                menuId: m.id,
                menuNameEn: m.menuNameEn,
                menuNameBangla: m.menuNameBangla,
                parentMenuId: m.parentMenuId,
                permissionKey: m.permissionKey,
                menuType: m.menuType,
                iconName: m.iconName,
                sortOrder: m.sortOrder,
                permissionId: perm?.id ?? null,
                canView: perm?.canView ?? false,
                canInsert: perm?.canInsert ?? false,
                canUpdate: perm?.canUpdate ?? false,
                canDelete: perm?.canDelete ?? false
            };
        });

        // Build tree
        const nodeMap = new Map<number, TreeNode>();
        const roots: TreeNode[] = [];

        for (const row of rows) {
            nodeMap.set(row.menuId, { data: row, children: [], expanded: true });
        }

        for (const row of rows) {
            const node = nodeMap.get(row.menuId)!;
            if (row.parentMenuId != null && nodeMap.has(row.parentMenuId)) {
                nodeMap.get(row.parentMenuId)!.children!.push(node);
            } else {
                roots.push(node);
            }
        }

        // Sort by sortOrder
        const sortNodes = (nodes: TreeNode[]) => {
            nodes.sort((a, b) => (a.data as MenuPermissionRow).sortOrder - (b.data as MenuPermissionRow).sortOrder);
            nodes.forEach(n => sortNodes(n.children || []));
        };
        sortNodes(roots);

        this.allTreeData = roots;
        this.applyFilters();
    }

    applyMenuTypeFilter(): void {
        this.applyFilters();
    }

    onSearchChange(): void {
        this.applyFilters();
    }

    private applyFilters(): void {
        const typeFilter = this.selectedMenuTypeFilter;
        const search = (this.searchText || '').trim().toLowerCase();

        if (typeFilter == null && !search) {
            this.treeData = this.deepCloneNodes(this.allTreeData);
            return;
        }

        this.treeData = this.filterTreeNodes(this.allTreeData, typeFilter, search);
    }

    private filterTreeNodes(nodes: TreeNode[], typeFilter: number | null, search: string): TreeNode[] {
        const result: TreeNode[] = [];
        for (const node of nodes) {
            const row = node.data as MenuPermissionRow;
            const nameMatch = !search || row.menuNameEn.toLowerCase().includes(search);
            const typeMatch = typeFilter == null || row.menuType === typeFilter;
            const selfMatch = nameMatch && typeMatch;

            const filteredChildren = node.children ? this.filterTreeNodes(node.children, typeFilter, search) : [];

            if (selfMatch || filteredChildren.length > 0) {
                result.push({ ...node, children: filteredChildren, expanded: true });
            }
        }
        return result;
    }

    private deepCloneNodes(nodes: TreeNode[]): TreeNode[] {
        return nodes.map(n => ({ ...n, children: n.children ? this.deepCloneNodes(n.children) : [] }));
    }

    onPermissionChange(row: MenuPermissionRow): void {
        if (!this.selectedRole) return;

        const currentUser = this.sharedService.getCurrentUser() || 'system';
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const model: RoleMenuPermissionModel = {
            id: row.permissionId ?? 0,
            roleId: this.selectedRole.id,
            menuId: row.menuId,
            canView: row.canView,
            canInsert: row.canInsert,
            canUpdate: row.canUpdate,
            canDelete: row.canDelete,
            isActive: true,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastUpdatedDate: currentDateTime
        };

        this.permissionService.saveUpdate(model).subscribe({
            next: (res) => {
                this.messageService.add({ severity: 'success', summary: 'Saved', detail: `Permission updated for "${row.menuNameEn}"`, life: 2000 });
                // Reload to get updated ID if it was a new insert
                if (!row.permissionId) {
                    this.onRoleChange();
                }
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to save permission' });
                // Revert the checkbox
                this.onRoleChange();
            }
        });
    }

    toggleAllColumn(column: 'canView' | 'canInsert' | 'canUpdate' | 'canDelete', event: any): void {
        const checked = event.checked;
        this.setColumnRecursive(this.treeData, column, checked);
        // Save all in batch
        this.saveAllPermissions();
    }

    private setColumnRecursive(nodes: TreeNode[], column: string, value: boolean): void {
        for (const node of nodes) {
            (node.data as any)[column] = value;
            if (node.children) {
                this.setColumnRecursive(node.children, column, value);
            }
        }
    }

    isAllChecked(column: 'canView' | 'canInsert' | 'canUpdate' | 'canDelete'): boolean {
        return this.checkAllRecursive(this.treeData, column);
    }

    private checkAllRecursive(nodes: TreeNode[], column: string): boolean {
        for (const node of nodes) {
            if (!(node.data as any)[column]) return false;
            if (node.children && !this.checkAllRecursive(node.children, column)) return false;
        }
        return nodes.length > 0;
    }

    private saveAllPermissions(): void {
        if (!this.selectedRole) return;

        this.saving = true;
        const currentUser = this.sharedService.getCurrentUser() || 'system';
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const rows = this.flattenTree(this.treeData);
        let completed = 0;
        let errors = 0;

        for (const row of rows) {
            const model: RoleMenuPermissionModel = {
                id: row.permissionId ?? 0,
                roleId: this.selectedRole.id,
                menuId: row.menuId,
                canView: row.canView,
                canInsert: row.canInsert,
                canUpdate: row.canUpdate,
                canDelete: row.canDelete,
                isActive: true,
                createdBy: currentUser,
                createdDate: currentDateTime,
                lastUpdatedBy: currentUser,
                lastUpdatedDate: currentDateTime
            };

            this.permissionService.saveUpdate(model).subscribe({
                next: () => {
                    completed++;
                    if (completed + errors === rows.length) {
                        this.saving = false;
                        if (errors === 0) {
                            this.messageService.add({ severity: 'success', summary: 'Saved', detail: `All ${completed} permissions updated`, life: 3000 });
                        } else {
                            this.messageService.add({ severity: 'warn', summary: 'Partial Save', detail: `${completed} saved, ${errors} failed` });
                        }
                        this.onRoleChange();
                    }
                },
                error: (err: any) => {
                    errors++;
                    if (completed + errors === rows.length) {
                        this.saving = false;
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: `${errors} permissions failed to save` });
                        this.onRoleChange();
                    }
                }
            });
        }
    }

    private flattenTree(nodes: TreeNode[]): MenuPermissionRow[] {
        const result: MenuPermissionRow[] = [];
        for (const node of nodes) {
            result.push(node.data as MenuPermissionRow);
            if (node.children) {
                result.push(...this.flattenTree(node.children));
            }
        }
        return result;
    }

    toggleRowAll(row: MenuPermissionRow, checked: boolean): void {
        row.canView = checked;
        row.canInsert = checked;
        row.canUpdate = checked;
        row.canDelete = checked;
        this.onPermissionChange(row);
    }

    isRowAllChecked(row: MenuPermissionRow): boolean {
        return row.canView && row.canInsert && row.canUpdate && row.canDelete;
    }

    expandAll(): void {
        this.treeData = this.setExpandedState(this.treeData, true);
    }

    collapseAll(): void {
        this.treeData = this.setExpandedState(this.treeData, false);
    }

    private setExpandedState(nodes: TreeNode[], expanded: boolean): TreeNode[] {
        return nodes.map(node => ({
            ...node,
            expanded,
            children: node.children ? this.setExpandedState(node.children, expanded) : []
        }));
    }

    getMenuTypeLabel(type: number): string {
        const found = this.menuTypeOptions.find(o => o.value === type);
        return found ? found.label : 'Unknown';
    }

    getMenuTypeSeverity(type: number): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
        switch (type) {
            case MenuType.Header: return 'secondary';
            case MenuType.AngularRoute: return 'info';
            case MenuType.ExternalLink: return 'warn';
            case MenuType.Action: return 'success';
            default: return 'info';
        }
    }

    getIconClass(row: MenuPermissionRow): string {
        if (!row.iconName) return '';
        return 'pi ' + row.iconName;
    }
}
