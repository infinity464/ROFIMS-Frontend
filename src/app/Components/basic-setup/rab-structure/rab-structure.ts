import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TreeNode } from 'primeng/api';
import { TreeModule } from 'primeng/tree';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CommonCode } from '../shared/models/common-code';
import { Fluid } from 'primeng/fluid';
import { SharedService } from '@/shared/services/shared-service';
import { TooltipModule } from 'primeng/tooltip';

/** Hierarchy: Unit → Wing → Branch → Sub-Branch → Section → Sub-Section */
const HIERARCHY_CONFIG: Record<string, { codeType: string; label: string } | null> = {
    RabUnit: { codeType: 'RabWing', label: 'Wing' },
    RabWing: { codeType: 'RabBranch', label: 'Branch' },
    RabBranch: { codeType: 'RabSubBranch', label: 'Sub-Branch' },
    RabSubBranch: { codeType: 'RabSection', label: 'Section' },
    RabSection: { codeType: 'RabSubSection', label: 'Sub-Section' },
    RabSubSection: null
};

const LABEL_MAP: Record<string, string> = {
    RabUnit: 'Unit',
    RabWing: 'Wing',
    RabBranch: 'Branch',
    RabSubBranch: 'Sub-Branch',
    RabSection: 'Section',
    RabSubSection: 'Sub-Section'
};

export interface OrgTreeNode extends TreeNode {
    data?: { codeId: number; codeType: string; raw?: CommonCode };
}

@Component({
    selector: 'app-rab-structure',
    standalone: true,
    imports: [
        CommonModule,
        TreeModule,
        Fluid,
        ButtonModule,
        DialogModule,
        InputTextModule,
        SelectModule,
        ReactiveFormsModule,
        ConfirmDialogModule,
        TooltipModule
    ],
    providers: [ConfirmationService],
    templateUrl: './rab-structure.html',
    styleUrl: './rab-structure.scss'
})
export class RabStructureComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    treeNodes: OrgTreeNode[] = [];
    loading = false;
    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    currentNode: OrgTreeNode | null = null;
    childLabel = '';
    childCodeType = '';
    orgForm!: FormGroup;

    constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private sharedService: SharedService,
        private fb: FormBuilder
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadTree();
    }

    private initForm(): void {
        this.orgForm = this.fb.group({
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true]
        });
    }

    loadTree(): void {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (units) => {
                if (!units?.length) {
                    this.treeNodes = [];
                    this.loading = false;
                    return;
                }
                this.loadChildrenRecursive(units, 'RabUnit').then((nodes) => {
                    this.treeNodes = nodes;
                    this.loading = false;
                }).catch(() => {
                    this.loading = false;
                });
            },
            error: (err: any) => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load structure' });
            }
        });
    }

    private async loadChildrenRecursive(items: CommonCode[], parentCodeType: string): Promise<OrgTreeNode[]> {
        const nodes: OrgTreeNode[] = [];
        const expectedChildType = HIERARCHY_CONFIG[parentCodeType]?.codeType;
        for (const item of items) {
            const codeType = this.resolveCodeType(item, expectedChildType);
            const children = await this.fetchChildren(item.codeId);
            const childNodes = children.length > 0 ? await this.loadChildrenRecursive(children, codeType) : [];
            nodes.push({
                label: item.codeValueEN || '',
                type: codeType,
                styleClass: codeType?.toLowerCase().replace('rab', 'rab-') || '',
                data: { codeId: item.codeId, codeType, raw: item },
                children: childNodes,
                expanded: true
            });
        }
        return nodes;
    }

    /** Resolve codeType from API (camelCase or PascalCase) or infer from parent's expected child type */
    private resolveCodeType(item: CommonCode, expectedChildType?: string): string {
        const raw = item as any;
        return raw?.codeType ?? raw?.CodeType ?? expectedChildType ?? 'RabUnit';
    }

    private fetchChildren(parentId: number): Promise<CommonCode[]> {
        return new Promise((resolve, reject) => {
            this.masterBasicSetupService.getByParentId(parentId).subscribe({
                next: (children) => resolve(Array.isArray(children) ? children : []),
                error: reject
            });
        });
    }

    getNodeLabel(codeType: string): string {
        return LABEL_MAP[codeType] || codeType;
    }

    canAddChild(node: OrgTreeNode): boolean {
        const codeType = node.data?.codeType;
        return codeType ? HIERARCHY_CONFIG[codeType] != null : false;
    }

    openAddRoot(): void {
        this.currentNode = null;
        this.isEditMode = false;
        this.childLabel = 'Unit';
        this.childCodeType = 'RabUnit';
        this.orgForm.reset({
            codeValueEN: '',
            codeValueBN: '',
            status: true
        });
        this.displayDialog = true;
    }

    openAddChild(node: OrgTreeNode): void {
        const codeType = node.data?.codeType;
        const childConfig = codeType ? HIERARCHY_CONFIG[codeType] : null;
        if (!childConfig) return;
        this.currentNode = node;
        this.isEditMode = false;
        this.childLabel = childConfig.label;
        this.childCodeType = childConfig.codeType;
        this.orgForm.reset({
            codeValueEN: '',
            codeValueBN: '',
            status: true
        });
        this.displayDialog = true;
    }

    openEdit(node: OrgTreeNode): void {
        const raw = node.data?.raw;
        if (!raw) return;
        this.currentNode = node;
        this.isEditMode = true;
        this.childLabel = this.getNodeLabel(node.data?.codeType || '');
        this.childCodeType = node.data?.codeType || '';
        this.orgForm.patchValue({
            codeValueEN: raw.codeValueEN || '',
            codeValueBN: raw.codeValueBN || '',
            status: raw.status ?? true
        });
        this.displayDialog = true;
    }

    closeDialog(): void {
        this.displayDialog = false;
        this.currentNode = null;
    }

    save(): void {
        if (this.orgForm.invalid) {
            this.orgForm.markAllAsTouched();
            return;
        }
        const user = this.sharedService.getCurrentUser();
        const now = this.sharedService.getCurrentDateTime();
        const parentId = this.isEditMode
            ? (this.currentNode?.data?.raw as CommonCode)?.parentCodeId ?? null
            : (this.currentNode?.data?.codeId ?? null);
        const payload = {
            ...this.orgForm.value,
            codeType: this.childCodeType,
            orgId: 0,
            codeId: this.isEditMode && this.currentNode?.data ? this.currentNode.data.codeId : 0,
            parentCodeId: parentId,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            sortOrder: null,
            level: null,
            createdBy: user,
            createdDate: now,
            lastUpdatedBy: user,
            lastupdate: now
        };

        this.isSaving = true;
        const obs = this.isEditMode
            ? this.masterBasicSetupService.update(payload)
            : this.masterBasicSetupService.create(payload);

        obs.subscribe({
            next: () => {
                this.closeDialog();
                this.loadTree();
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: this.isEditMode ? 'Updated successfully' : 'Created successfully'
                });
                this.isSaving = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Operation failed' });
                this.isSaving = false;
            }
        });
    }

    confirmDelete(node: OrgTreeNode, event: Event): void {
        const name = node.label || 'this item';
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: `Delete "${name}"? This will also delete all descendants.`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectLabel: 'Cancel',
            acceptLabel: 'Delete',
            acceptButtonProps: { severity: 'danger' },
            accept: () => this.deleteNode(node)
        });
    }

    private deleteNode(node: OrgTreeNode): void {
        const codeId = node.data?.codeId;
        if (codeId == null) return;
        this.masterBasicSetupService.delete(codeId).subscribe({
            next: () => {
                this.loadTree();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Deleted successfully' });
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed' });
            }
        });
    }
}
