import {
    Component,
    OnInit,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
    DestroyRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TreeNodeComponent } from './tree-node/tree-node.component';
import { OrgFormComponent, FormMode } from './org-form/org-form.component';
import { OrgService } from './org.service';
import { OrgNode } from './models/org-node.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LayoutService } from '@/layout/service/layout.service';

@Component({
    selector: 'app-org-tree',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        Fluid,
        ButtonModule,
        ConfirmDialogModule,
        DialogModule,
        ToastModule,
        TreeNodeComponent,
        OrgFormComponent
    ],
    providers: [ConfirmationService],
    templateUrl: './org-tree.component.html',
    styleUrl: './org-tree.component.scss'
})
export class OrgTreeComponent implements OnInit {
    private orgService = inject(OrgService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private destroyRef = inject(DestroyRef);
    private layoutService = inject(LayoutService);

    readonly flatNodes = signal<OrgNode[]>([]);
    readonly selectedNode = signal<OrgNode | null>(null);
    readonly formMode = signal<FormMode>('empty');
    readonly loading = signal(false);
    readonly loadingParentId = signal<number | null>(null);
    readonly isDarkMode = computed(() => this.layoutService.isDarkTheme());

    readonly formVisible = computed(() => this.formMode() !== 'empty');
    readonly formTitle = computed(() => {
        const m = this.formMode();
        if (m === 'add-unit') return 'New Unit';
        if (m === 'add-child') return 'Add Child';
        if (m === 'edit') return 'Edit';
        return '';
    });
    readonly formSubmitLabel = computed(() => (this.formMode() === 'edit' ? 'Save' : 'Add'));

    readonly treeNodes = computed(() => this.orgService.getTree(this.flatNodes()));

    readonly breadcrumbPath = computed(() => {
        const sel = this.selectedNode();
        const flat = this.flatNodes();
        if (!sel) return [];
        const path: OrgNode[] = [];
        let current: OrgNode | null = sel;
        while (current) {
            path.unshift(current);
            current = current.parentId != null ? (flat.find(f => f.id === current!.parentId) ?? null) : null;
        }
        return path;
    });

    readonly siblingCount = computed(() => {
        const mode = this.formMode();
        const parent = this.selectedNode();
        const flat = this.flatNodes();
        if (mode === 'add-unit') return flat.filter(n => n.parentId == null).length;
        if (mode === 'add-child' && parent) return flat.filter(n => n.parentId === parent.id).length;
        return 0;
    });

    ngOnInit(): void {
        this.load();
    }

    load(): void {
        this.loading.set(true);
        this.orgService.getAll(1).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (flat) => {
                this.flatNodes.set(flat);
                this.loading.set(false);
            },
            error: () => {
                this.loading.set(false);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load hierarchy' });
            }
        });
    }

    openNewUnit(): void {
        this.selectedNode.set(null);
        this.formMode.set('add-unit');
    }

    onAddChild(parent: OrgNode): void {
        this.selectedNode.set(parent);
        this.formMode.set('add-child');
    }

    onEdit(node: OrgNode): void {
        this.selectedNode.set(node);
        this.formMode.set('edit');
    }

    onExpandToggled(e: { node: OrgNode; expanded: boolean }): void {
        this.flatNodes.update(flat =>
            flat.map(n => n.id === e.node.id ? { ...n, expanded: e.expanded } : n)
        );
    }

    onExpandRequest(node: OrgNode): void {
        const flat = this.flatNodes();
        const hasChildren = flat.some(n => n.parentId === node.id);
        if (hasChildren) return;
        this.loadingParentId.set(node.id);
        this.orgService.loadChildren(node.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (children) => {
                this.flatNodes.update(f => {
                    const updated = [...f, ...children].map(n =>
                        n.id === node.id ? { ...n, expanded: true, childrenLoaded: true } : n
                    );
                    return updated;
                });
                this.loadingParentId.set(null);
            },
            error: () => {
                this.loadingParentId.set(null);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load children' });
            }
        });
    }

    onDelete(node: OrgNode): void {
        const hasChildren = (this.flatNodes().filter(n => n.parentId === node.id).length > 0);
        const message = hasChildren
            ? `"${node.nameEN || node.commCode}" has children. Delete anyway? This will remove all descendants.`
            : `Delete "${node.nameEN || node.commCode}"?`;

        this.confirmationService.confirm({
            message,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectLabel: 'Cancel',
            acceptLabel: 'Delete',
            acceptButtonProps: { severity: 'danger' },
            accept: () => {
                this.orgService.delete(node.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
                    next: () => {
                        this.load();
                        this.formMode.set('empty');
                        this.selectedNode.set(null);
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Deleted' });
                    },
                    error: () => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed' });
                    }
                });
            }
        });
    }

    onFormSaved(): void {
        const parent = this.selectedNode();
        const wasAddChild = this.formMode() === 'add-child';
        this.formMode.set('empty');
        this.selectedNode.set(null);
        if (wasAddChild && parent) {
            this.orgService.loadChildren(parent.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
                next: (children) => {
                    const seen = new Set(this.flatNodes().map(n => n.id));
                    const newOnes = children.filter(c => !seen.has(c.id));
                    if (newOnes.length) this.flatNodes.update(f => [...f, ...newOnes]);
                }
            });
        } else {
            this.load();
        }
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Saved' });
    }

    onFormCancelled(): void {
        this.formMode.set('empty');
        this.selectedNode.set(null);
    }

    onDialogVisibleChange(visible: boolean): void {
        if (!visible) this.onFormCancelled();
    }

    private buildPath(node: OrgNode): OrgNode[] {
        const flat = this.flatNodes();
        const path: OrgNode[] = [];
        let current: OrgNode | null = node;
        while (current) {
            path.unshift(current);
            current = current.parentId != null ? (flat.find(f => f.id === current!.parentId) ?? null) : null;
        }
        return path;
    }
}
