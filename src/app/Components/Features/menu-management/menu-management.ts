import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { TreeTableModule } from 'primeng/treetable';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { Tag } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { FluidModule } from 'primeng/fluid';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConfirmationService, MessageService, TreeNode } from 'primeng/api';

import { MenuService } from '@/services/menu.service';
import { MenuModel, MenuTreeNode } from '@/models/menu.model';
import { MenuType, MenuTypeOptions, IconTypeOptions, LinkTargetOptions } from '@/models/enums';
import { SharedService } from '@/shared/services/shared-service';

@Component({
    selector: 'app-menu-management',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        TableModule,
        TreeTableModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        CheckboxModule,
        Dialog,
        ConfirmDialog,
        Toast,
        Tag,
        TooltipModule,
        InputNumberModule,
        TextareaModule,
        FluidModule,
        IconFieldModule,
        InputIconModule
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './menu-management.html',
    styleUrl: './menu-management.scss'
})
export class MenuManagement implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    treeData: TreeNode[] = [];
    filteredTreeData: TreeNode[] = [];
    flatMenus: MenuModel[] = [];
    parentOptions: { label: string; value: number | null }[] = [];
    loading = false;
    dialogVisible = false;
    viewDialogVisible = false;
    viewingMenu: MenuModel | null = null;
    isSubmitting = false;
    editingId: number | null = null;
    searchValue = '';

    // Pagination
    rows = 10;
    totalRecords = 0;

    // Filters
    selectedTypeFilter: number | null = null;
    selectedStatusFilter: string | null = null;

    menuTypeFilterOptions = [
        { label: 'Header / Group', value: 0 },
        { label: 'Angular Route', value: 1 },
        { label: 'External Link', value: 2 },
        { label: 'Action', value: 3 }
    ];

    statusFilterOptions = [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Visible', value: 'visible' },
        { label: 'Hidden', value: 'hidden' }
    ];

    menuForm!: FormGroup;

    // Enum options for dropdowns
    menuTypeOptions = MenuTypeOptions;
    iconTypeOptions = IconTypeOptions;
    linkTargetOptions = LinkTargetOptions;

    // Expose MenuType enum for template
    MenuType = MenuType;

    constructor(
        private menuService: MenuService,
        private fb: FormBuilder,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initForm();
        this.loadMenus();
    }

    initForm(): void {
        this.menuForm = this.fb.group({
            menuNameEn: ['', Validators.required],
            menuNameBangla: [''],
            parentMenuId: [null],
            iconName: [''],
            iconType: ['pi'],
            cssClass: [''],
            menuType: [1, Validators.required],
            routerName: [''],
            exactMatch: [false],
            routerOutlet: [''],
            isExternal: [false],
            url: [''],
            target: ['_self'],
            routeParamsJson: [''],
            sortOrder: [0],
            isVisible: [true],
            isActive: [true],
            permissionKey: ['']
        });
    }

    loadMenus(): void {
        this.loading = true;
        const expandedIds = this.collectExpandedIds(this.filteredTreeData);
        this.menuService.getAll().subscribe({
            next: (data) => {
                this.flatMenus = data;
                this.treeData = this.buildPrimeTreeNodes(data);
                if (expandedIds.size > 0) {
                    this.applyExpandedState(this.treeData, expandedIds);
                }
                this.buildParentOptions(data);
                this.applyFilters();
                this.loading = false;
            },
            error: (err) => {
                console.error('Failed to load menus', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load menus' });
                this.loading = false;
            }
        });
    }

    buildPrimeTreeNodes(flatList: MenuModel[]): TreeNode[] {
        const tree = this.menuService.buildTree(flatList);
        return tree.map((n) => this.toPrimeTreeNode(n));
    }

    private toPrimeTreeNode(node: MenuTreeNode): TreeNode {
        return {
            data: node.data,
            children: node.children.map((c) => this.toPrimeTreeNode(c)),
            expanded: false
        };
    }

    buildParentOptions(menus: MenuModel[]): void {
        this.parentOptions = [
            { label: '-- Root (No Parent) --', value: null },
            ...menus.map((m) => ({
                label: `${m.menuNameEn} (ID: ${m.id})`,
                value: m.id
            }))
        ];
    }

    get selectedMenuType(): number {
        return this.menuForm.get('menuType')?.value;
    }

    // Filter logic
    applyFilters(): void {
        const search = this.searchValue?.toLowerCase().trim() || '';
        const typeFilter = this.selectedTypeFilter;
        const statusFilter = this.selectedStatusFilter;

        if (!search && typeFilter == null && !statusFilter) {
            this.filteredTreeData = [...this.treeData];
        } else {
            this.filteredTreeData = this.filterTree(this.treeData, search, typeFilter, statusFilter);
        }

        this.totalRecords = this.countNodes(this.filteredTreeData);
    }

    private filterTree(nodes: TreeNode[], search: string, typeFilter: number | null, statusFilter: string | null): TreeNode[] {
        const result: TreeNode[] = [];

        for (const node of nodes) {
            const data = node.data as MenuModel;
            const matchesSearch = !search ||
                data.menuNameEn?.toLowerCase().includes(search) ||
                data.menuNameBangla?.toLowerCase().includes(search) ||
                data.routerName?.toLowerCase().includes(search) ||
                data.url?.toLowerCase().includes(search);

            const matchesType = typeFilter == null || data.menuType === typeFilter;

            let matchesStatus = true;
            if (statusFilter === 'active') matchesStatus = data.isActive;
            else if (statusFilter === 'inactive') matchesStatus = !data.isActive;
            else if (statusFilter === 'visible') matchesStatus = data.isVisible;
            else if (statusFilter === 'hidden') matchesStatus = !data.isVisible;

            const filteredChildren = this.filterTree(node.children || [], search, typeFilter, statusFilter);

            if ((matchesSearch && matchesType && matchesStatus) || filteredChildren.length > 0) {
                result.push({
                    ...node,
                    children: filteredChildren,
                    expanded: true
                });
            }
        }

        return result;
    }

    private countNodes(nodes: TreeNode[]): number {
        let count = 0;
        for (const node of nodes) {
            count++;
            if (node.children) {
                count += this.countNodes(node.children);
            }
        }
        return count;
    }

    clearFilters(): void {
        this.searchValue = '';
        this.selectedTypeFilter = null;
        this.selectedStatusFilter = null;
        this.applyFilters();
    }

    expandAll(): void {
        this.filteredTreeData = this.setExpandedState(this.filteredTreeData, true);
    }

    collapseAll(): void {
        this.filteredTreeData = this.setExpandedState(this.filteredTreeData, false);
    }

    private setExpandedState(nodes: TreeNode[], expanded: boolean): TreeNode[] {
        return nodes.map(node => ({
            ...node,
            expanded,
            children: node.children ? this.setExpandedState(node.children, expanded) : []
        }));
    }

    private collectExpandedIds(nodes: TreeNode[]): Set<number> {
        const ids = new Set<number>();
        const walk = (list: TreeNode[]) => {
            for (const n of list) {
                const id = (n.data as MenuModel)?.id;
                if (n.expanded && id != null) ids.add(id);
                if (n.children?.length) walk(n.children);
            }
        };
        walk(nodes);
        return ids;
    }

    private applyExpandedState(nodes: TreeNode[], expandedIds: Set<number>): void {
        for (const n of nodes) {
            const id = (n.data as MenuModel)?.id;
            if (id != null && expandedIds.has(id)) n.expanded = true;
            if (n.children?.length) this.applyExpandedState(n.children, expandedIds);
        }
    }

    // Icon class helper
    getIconClass(rowData: MenuModel): string {
        if (!rowData.iconName) return '';
        if (rowData.iconType === 'pi') {
            return 'pi ' + rowData.iconName;
        }
        return rowData.iconName;
    }

    // View dialog
    openViewDialog(menu: MenuModel): void {
        this.viewingMenu = menu;
        this.viewDialogVisible = true;
    }

    getParentName(parentMenuId: number | null): string {
        if (parentMenuId == null) return '-- Root (No Parent) --';
        const parent = this.flatMenus.find(m => m.id === parentMenuId);
        return parent ? `${parent.menuNameEn} (ID: ${parent.id})` : `ID: ${parentMenuId}`;
    }

    // Dialog actions
    openNewDialog(parentId?: number | null): void {
        this.editingId = null;
        this.menuForm.reset({
            menuNameEn: '',
            menuNameBangla: '',
            parentMenuId: parentId ?? null,
            iconName: '',
            iconType: 'pi',
            cssClass: '',
            menuType: 1,
            routerName: '',
            exactMatch: false,
            routerOutlet: '',
            isExternal: false,
            url: '',
            target: '_self',
            routeParamsJson: '',
            sortOrder: 0,
            isVisible: true,
            isActive: true,
            permissionKey: ''
        });
        this.dialogVisible = true;
    }

    openEditDialog(menu: MenuModel): void {
        this.editingId = menu.id;
        this.menuForm.patchValue({
            menuNameEn: menu.menuNameEn,
            menuNameBangla: menu.menuNameBangla || '',
            parentMenuId: menu.parentMenuId,
            iconName: menu.iconName || '',
            iconType: menu.iconType || 'pi',
            cssClass: menu.cssClass || '',
            menuType: menu.menuType,
            routerName: menu.routerName || '',
            exactMatch: menu.exactMatch,
            routerOutlet: menu.routerOutlet || '',
            isExternal: menu.isExternal,
            url: menu.url || '',
            target: menu.target || '_self',
            routeParamsJson: menu.routeParamsJson || '',
            sortOrder: menu.sortOrder,
            isVisible: menu.isVisible,
            isActive: menu.isActive,
            permissionKey: menu.permissionKey || ''
        });
        this.dialogVisible = true;
    }

    saveMenu(): void {
        if (this.menuForm.invalid) {
            this.menuForm.markAllAsTouched();
            return;
        }

        this.isSubmitting = true;
        const currentUser = this.sharedService.getCurrentUser() || 'system';
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const formValue = this.menuForm.value;

        if (this.editingId) {
            const existing = this.flatMenus.find((m) => m.id === this.editingId);
            const payload: MenuModel = {
                ...formValue,
                id: this.editingId,
                menuNameBangla: formValue.menuNameBangla || null,
                iconName: formValue.iconName || null,
                iconType: formValue.iconType || null,
                cssClass: formValue.cssClass || null,
                routerName: formValue.routerName || null,
                routerOutlet: formValue.routerOutlet || null,
                url: formValue.url || null,
                target: formValue.target || null,
                routeParamsJson: formValue.routeParamsJson || null,
                permissionKey: formValue.permissionKey || null,
                createdBy: existing?.createdBy || currentUser,
                createdDate: existing?.createdDate || currentDateTime,
                lastUpdatedBy: currentUser,
                lastupdate: currentDateTime
            };

            this.menuService.update(payload).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Menu updated successfully' });
                    this.dialogVisible = false;
                    this.isSubmitting = false;
                    this.loadMenus();
                },
                error: (err) => {
                    console.error('Error updating menu', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update menu' });
                    this.isSubmitting = false;
                }
            });
        } else {
            const payload: MenuModel = {
                ...formValue,
                id: 0,
                menuNameBangla: formValue.menuNameBangla || null,
                iconName: formValue.iconName || null,
                iconType: formValue.iconType || null,
                cssClass: formValue.cssClass || null,
                routerName: formValue.routerName || null,
                routerOutlet: formValue.routerOutlet || null,
                url: formValue.url || null,
                target: formValue.target || null,
                routeParamsJson: formValue.routeParamsJson || null,
                permissionKey: formValue.permissionKey || null,
                createdBy: currentUser,
                createdDate: currentDateTime,
                lastUpdatedBy: currentUser,
                lastupdate: currentDateTime
            };

            this.menuService.save(payload).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Menu created successfully' });
                    this.dialogVisible = false;
                    this.isSubmitting = false;
                    this.loadMenus();
                },
                error: (err) => {
                    console.error('Error creating menu', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create menu' });
                    this.isSubmitting = false;
                }
            });
        }
    }

    confirmDelete(menu: MenuModel, event: Event): void {
        const hasChildren = this.flatMenus.some((m) => m.parentMenuId === menu.id);
        const message = hasChildren
            ? `"${menu.menuNameEn}" has child menus. Please delete or reassign them first.`
            : `Are you sure you want to delete "${menu.menuNameEn}"?`;

        if (hasChildren) {
            this.messageService.add({ severity: 'warn', summary: 'Cannot Delete', detail: message });
            return;
        }

        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: message,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.menuService.delete(menu.id).subscribe({
                    next: () => {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Menu deleted successfully' });
                        this.loadMenus();
                    },
                    error: (err) => {
                        console.error('Error deleting menu', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete menu' });
                    }
                });
            }
        });
    }

    getMenuTypeLabel(type: number): string {
        const found = this.menuTypeOptions.find((o) => o.value === type);
        return found ? found.label : 'Unknown';
    }

    getMenuTypeSeverity(type: number): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
        switch (type) {
            case MenuType.Header:
                return 'secondary';
            case MenuType.AngularRoute:
                return 'info';
            case MenuType.ExternalLink:
                return 'warn';
            case MenuType.Action:
                return 'success';
            default:
                return 'info';
        }
    }

    getRouteDisplay(menu: MenuModel): string {
        if (menu.menuType === MenuType.AngularRoute && menu.routerName) {
            return menu.routerName;
        }
        if (menu.menuType === MenuType.ExternalLink && menu.url) {
            return menu.url;
        }
        return '-';
    }
}
