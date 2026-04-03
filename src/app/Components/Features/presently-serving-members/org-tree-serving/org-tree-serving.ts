import {
    Component,
    OnInit,
    inject,
    signal,
    computed,
    DestroyRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { RouterModule } from '@angular/router';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TreeNodeComponent } from '@/Components/basic-setup/org-tree/tree-node/tree-node.component';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { OrgNode } from '@/Components/basic-setup/org-tree/models/org-node.model';
import { OrganogramCountItem, ServingMembersService } from '@/services/serving-members.service';
import { MasterBasicSetupService, AuthorizedCountItem } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { MemberViewComponent } from './member-view/member-view.component';
import { LayoutService } from '@/layout/service/layout.service';

function countMapFromApi(rows: OrganogramCountItem[] | null | undefined): Map<number, number> {
    const m = new Map<number, number>();
    for (const row of rows ?? []) {
        if (row?.codeId > 0) m.set(row.codeId, row.servingCount ?? 0);
    }
    return m;
}

function authCountMapFromApi(rows: AuthorizedCountItem[] | null | undefined): Map<number, number> {
    const m = new Map<number, number>();
    for (const row of rows ?? []) {
        if (row?.codeId > 0) m.set(row.codeId, row.authorizedCount ?? 0);
    }
    return m;
}

@Component({
    selector: 'app-org-tree-serving',
    standalone: true,
    imports: [CommonModule, CardModule, RouterModule, Fluid, ButtonModule, ToastModule, TreeNodeComponent, MemberViewComponent],
    providers: [MessageService],
    templateUrl: './org-tree-serving.html',
    styleUrl: './org-tree-serving.scss'
})
export class OrgTreeServingComponent implements OnInit {
    private orgService = inject(OrgService);
    private servingMembersService = inject(ServingMembersService);
    private masterBasicSetupService = inject(MasterBasicSetupService);
    private messageService = inject(MessageService);
    private destroyRef = inject(DestroyRef);
    private layoutService = inject(LayoutService);

    readonly flatNodes = signal<OrgNode[]>([]);
    readonly loading = signal(false);
    readonly loadingParentId = signal<number | null>(null);
    readonly countsLoading = signal(false);
    readonly selectedNodeId = signal<number | null>(null);
    readonly sidebarCollapsed = signal(false);
    readonly isDarkMode = computed(() => this.layoutService.isDarkTheme());

    readonly treeNodes = computed(() => this.orgService.getTree(this.flatNodes()));

    list: EmployeeServiceOverview[] = [];
    listLoading = false;
    totalRecords = 0;
    first = 0;
    rows = 10;

    private currentPageNo = 1;

    ngOnInit(): void {
        this.loadTreeAndCounts();
    }

    loadTreeAndCounts(): void {
        this.loading.set(true);
        this.countsLoading.set(true);
        forkJoin({
            roots: this.orgService.getAll(1),
            heldCounts: this.servingMembersService.getServingOrganogramCounts().pipe(catchError(() => of([] as OrganogramCountItem[]))),
            authCounts: this.masterBasicSetupService.getAuthorizedOrganogramCounts().pipe(catchError(() => of([] as AuthorizedCountItem[])))
        })
            .pipe(
                map(({ roots, heldCounts, authCounts }) => {
                    const cm = countMapFromApi(heldCounts);
                    const acm = authCountMapFromApi(authCounts);
                    return roots.map((n) => ({
                        ...n,
                        servingCount: cm.get(n.id) ?? 0,
                        authorizedCount: acm.get(n.id) ?? 0
                    }));
                }),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: (merged) => {
                    this.flatNodes.set(merged);
                    this.loading.set(false);
                    this.countsLoading.set(false);
                },
                error: () => {
                    this.loading.set(false);
                    this.countsLoading.set(false);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to load organogram'
                    });
                }
            });
    }

    onExpandToggled(e: { node: OrgNode; expanded: boolean }): void {
        this.flatNodes.update((flat) =>
            flat.map((n) => (n.id === e.node.id ? { ...n, expanded: e.expanded } : n))
        );
    }

    onExpandRequest(node: OrgNode): void {
        const flat = this.flatNodes();
        if (flat.some((n) => n.parentId === node.id)) return;
        this.loadingParentId.set(node.id);
        this.orgService
            .loadChildren(node.id)
            .pipe(
                switchMap((children) =>
                    forkJoin({
                        heldCounts: this.servingMembersService.getServingOrganogramCounts().pipe(catchError(() => of([] as OrganogramCountItem[]))),
                        authCounts: this.masterBasicSetupService.getAuthorizedOrganogramCounts().pipe(catchError(() => of([] as AuthorizedCountItem[])))
                    }).pipe(
                        map(({ heldCounts, authCounts }) => ({ children, heldCounts, authCounts }))
                    )
                ),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: ({ children, heldCounts, authCounts }) => {
                    const cm = countMapFromApi(heldCounts);
                    const acm = authCountMapFromApi(authCounts);
                    this.flatNodes.update((f) => {
                        const seen = new Set(f.map((n) => n.id));
                        const newOnes = children
                            .filter((c) => !seen.has(c.id))
                            .map((c) => ({ ...c, servingCount: cm.get(c.id) ?? 0, authorizedCount: acm.get(c.id) ?? 0 }));
                        return [...f, ...newOnes].map((n) =>
                            n.id === node.id
                                ? {
                                      ...n,
                                      expanded: true,
                                      childrenLoaded: true as any,
                                      servingCount: cm.get(n.id) ?? n.servingCount ?? 0,
                                      authorizedCount: acm.get(n.id) ?? n.authorizedCount ?? 0
                                  }
                                : { ...n, servingCount: cm.get(n.id) ?? n.servingCount ?? 0, authorizedCount: acm.get(n.id) ?? n.authorizedCount ?? 0 }
                        );
                    });
                    this.loadingParentId.set(null);
                },
                error: () => {
                    this.loadingParentId.set(null);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to load children'
                    });
                }
            });
    }

    onNodeSelect(node: OrgNode): void {
        this.selectedNodeId.set(node.id);
        this.currentPageNo = 1;
        this.first = 0;
        this.loadMembersPage(1, this.rows);
    }

    onPageChange(page: number): void {
        this.currentPageNo = page;
        this.first = (page - 1) * this.rows;
        this.loadMembersPage(page, this.rows);
    }

    onPageSizeChange(newSize: number): void {
        this.rows = newSize;
        this.currentPageNo = 1;
        this.first = 0;
        this.loadMembersPage(1, newSize);
    }

    getCurrentPage(): number {
        return this.currentPageNo;
    }

    getSelectedNodeName(): string {
        const nodeId = this.selectedNodeId();
        if (nodeId == null) return '';
        const node = this.flatNodes().find(n => n.id === nodeId);
        return node?.nameEN || node?.commCode || '';
    }

    private loadMembersPage(pageNo: number, rowPerPage: number): void {
        const nodeId = this.selectedNodeId();
        if (nodeId == null) {
            this.list = [];
            this.totalRecords = 0;
            return;
        }
        this.listLoading = true;
        this.servingMembersService
            .getPresentlyServingMembersPaginatedFiltered({
                pagination: { page_no: pageNo, row_per_page: rowPerPage },
                filter: { organogramNodeCodeId: nodeId }
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.listLoading = false;
                },
                error: (err) => {
                    this.listLoading = false;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load members'
                    });
                }
            });
    }

    clearSelection(): void {
        this.selectedNodeId.set(null);
        this.list = [];
        this.totalRecords = 0;
        this.currentPageNo = 1;
    }

    toggleSidebar(): void {
        this.sidebarCollapsed.update(v => !v);
    }
}