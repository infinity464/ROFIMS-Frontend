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
import { EmployeeListService } from '@/services/employee-list.service';
import { EmployeeList } from '@/models/employee-list.model';
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
    private employeeListService = inject(EmployeeListService);
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
            roots: this.orgService.getAll(1).pipe(catchError(() => of([] as OrgNode[]))),
            heldCounts: this.servingMembersService.getServingOrganogramCounts().pipe(catchError(() => of([] as OrganogramCountItem[]))),
            authCounts: this.masterBasicSetupService.getAuthorizedOrganogramCounts().pipe(catchError(() => of([] as AuthorizedCountItem[])))
        })
            .pipe(
                map(({ roots, heldCounts, authCounts }) => {
                    const cm = countMapFromApi(heldCounts);
                    const acm = authCountMapFromApi(authCounts);
                    const orgNodes = roots.map((n) => ({
                        ...n,
                        servingCount: cm.get(n.id) ?? 0,
                        authorizedCount: acm.get(n.id) ?? 0
                    }));
                    
                    const virtualNodes: OrgNode[] = [
                        {
                            id: -1,
                            parentId: null,
                            orgId: 0,
                            nameEN: 'Supernumerary',
                            commCode: 'SUP',
                            codeType: 'V',
                            nameBN: '',
                            displayNameEN: 'Supernumerary',
                            displayNameBN: '',
                            status: 1,
                            sortOrder: 9998,
                            level: 0,
                            children: [],
                            servingCount: 0,
                            authorizedCount: 0
                        },
                        {
                            id: -2,
                            parentId: null,
                            orgId: 0,
                            nameEN: 'Pending for Joining',
                            commCode: 'PND',
                            codeType: 'V',
                            nameBN: '',
                            displayNameEN: 'Pending for Joining',
                            displayNameBN: '',
                            status: 1,
                            sortOrder: 9999,
                            level: 0,
                            children: [],
                            servingCount: 0,
                            authorizedCount: 0
                        }
                    ];
                    
                    return [...orgNodes, ...virtualNodes];
                }),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: (merged) => {
                    this.flatNodes.set(merged);
                    this.loading.set(false);
                    this.countsLoading.set(false);
                    this.loadVirtualNodeCounts();
                },
                error: (err) => {
                    console.error('Error loading organogram:', err);
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

    private loadVirtualNodeCounts(): void {
        forkJoin({
            supernumeraryList: this.employeeListService.getSupernumeraryList({}).pipe(catchError(() => of([] as EmployeeList[]))),
            pendingJoiningList: this.employeeListService.getEmployeesByPostingStatus({ postingStatus: 'PendingForJoining' }).pipe(catchError(() => of([] as EmployeeList[])))
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: ({ supernumeraryList, pendingJoiningList }) => {
                    this.flatNodes.update(nodes => 
                        nodes.map(n => {
                            if (n.id === -1) {
                                return { ...n, servingCount: supernumeraryList.length };
                            }
                            if (n.id === -2) {
                                return { ...n, servingCount: pendingJoiningList.length };
                            }
                            return n;
                        })
                    );
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
        
        if (node.id === -1) {
            this.loadSupernumeraryPage(1, this.rows);
        } else if (node.id === -2) {
            this.loadPendingJoiningPage(1, this.rows);
        } else {
            this.loadMembersPage(1, this.rows);
        }
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

    private loadSupernumeraryPage(pageNo: number, rowPerPage: number): void {
        this.listLoading = true;
        this.employeeListService
            .getSupernumeraryListPaginated({
                pagination: { page_no: pageNo, row_per_page: rowPerPage }
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    const mapped: EmployeeServiceOverview[] = (res.datalist ?? []).map(emp => ({
                        employeeID: emp.employeeID,
                        serviceId: emp.serviceId,
                        rabID: emp.rabID ?? null,
                        prefixId: null,
                        prefix: emp.prefixName ?? null,
                        nameEnglish: emp.fullNameEN ?? null,
                        appointmentId: null,
                        appointment: null,
                        memberTypeId: emp.officerType ?? null,
                        memberType: null,
                        motherOrganizationId: null,
                        motherOrganization: emp.motherUnitName ?? null,
                        armyRankId: null,
                        armyRank: emp.rankName ?? null,
                        corpsId: null,
                        corps: emp.corpsName ?? null,
                        tradeId: null,
                        trade: emp.tradeName ?? null,
                        tradeRemarks: null,
                        genderId: null,
                        gender: null,
                        dateOfCommission: null,
                        dateOfJoiningInServiceTraining: null,
                        motherUnitId: null,
                        motherUnit: emp.motherUnitName ?? null,
                        location: null,
                        rabUnitId: emp.orgId ?? null,
                        rabUnit: null,
                        status: null,
                        joiningDate: emp.joiningDate ?? null,
                        permanentDistrictType: null,
                        permanentDistrictTypeName: null
                    }));
                    this.list = mapped;
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.listLoading = false;
                },
                error: (err) => {
                    this.listLoading = false;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load supernumerary list'
                    });
                }
            });
    }

    private loadPendingJoiningPage(pageNo: number, rowPerPage: number): void {
        this.listLoading = true;
        this.employeeListService
            .getEmployeesByPostingStatus({
                postingStatus: 'PendingForJoining'
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    const mappedList: EmployeeServiceOverview[] = res.map(emp => ({
                        employeeID: emp.employeeID,
                        serviceId: emp.serviceId,
                        rabID: emp.rabID ?? null,
                        prefixId: null,
                        prefix: emp.prefixName ?? null,
                        nameEnglish: emp.fullNameEN ?? null,
                        appointmentId: null,
                        appointment: null,
                        memberTypeId: emp.officerType ?? null,
                        memberType: null,
                        motherOrganizationId: null,
                        motherOrganization: emp.motherUnitName ?? null,
                        armyRankId: null,
                        armyRank: emp.rankName ?? null,
                        corpsId: null,
                        corps: emp.corpsName ?? null,
                        tradeId: null,
                        trade: emp.tradeName ?? null,
                        tradeRemarks: null,
                        genderId: null,
                        gender: null,
                        dateOfCommission: null,
                        dateOfJoiningInServiceTraining: null,
                        motherUnitId: null,
                        motherUnit: emp.motherUnitName ?? null,
                        location: null,
                        rabUnitId: emp.orgId ?? null,
                        rabUnit: null,
                        status: null,
                        joiningDate: emp.joiningDate ?? null,
                        permanentDistrictType: null,
                        permanentDistrictTypeName: null
                    }));
                    const start = (pageNo - 1) * rowPerPage;
                    const end = start + rowPerPage;
                    this.list = mappedList.slice(start, end);
                    this.totalRecords = res.length;
                    this.listLoading = false;
                },
                error: (err) => {
                    this.listLoading = false;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load pending joining list'
                    });
                }
            });
    }

    toggleSidebar(): void {
        this.sidebarCollapsed.update(v => !v);
    }
}