import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Fluid } from 'primeng/fluid';
import { UserMenuService } from '@/services/user-menu.service';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TreeNodeComponent } from '@/Components/basic-setup/org-tree/tree-node/tree-node.component';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { OrgNode } from '@/Components/basic-setup/org-tree/models/org-node.model';
import { OrganogramCountItem, ServingMembersService } from '@/services/serving-members.service';
import { MasterBasicSetupService, AuthorizedCountItem } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeListService } from '@/services/employee-list.service';
import { LayoutService } from '@/layout/service/layout.service';
import { CommonCodeService } from '@/services/common-code-service';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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
    selector: 'app-rab-organogram',
    standalone: true,
    imports: [CommonModule, Fluid, ToastModule, TreeNodeComponent],
    providers: [MessageService],
    templateUrl: './rab-organogram.html',
    styleUrl: './rab-organogram.scss'
})
export class RabOrganogramComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    private orgService = inject(OrgService);
    private servingMembersService = inject(ServingMembersService);
    private masterBasicSetupService = inject(MasterBasicSetupService);
    private employeeListService = inject(EmployeeListService);
    private commonCodeService = inject(CommonCodeService);
    private messageService = inject(MessageService);
    private destroyRef = inject(DestroyRef);
    private layoutService = inject(LayoutService);

    readonly isDarkMode = computed(() => this.layoutService.isDarkTheme());

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    // All flat nodes from API
    readonly flatNodes = signal<OrgNode[]>([]);
    readonly loading = signal(false);
    readonly loadingParentId = signal<number | null>(null);

    // HQ card loading (card 1)
    readonly hqLoading = signal(true);

    // Card visibility toggles
    readonly showHQ = signal(true);
    readonly showBattalions = signal(true);
    readonly showSupernumerary = signal(true);
    readonly showPending = signal(true);

    // Header totals
    readonly totalAuthorized = signal(0);
    readonly totalHeld = signal(0);

    memberTypes: CommonCode[] = [];

    // Computed: full tree (counts already rolled up from API)
    readonly treeNodes = computed(() => this.orgService.getTree(this.flatNodes()));

    // Card 1: HQ = first unit's tree (wings, branches, etc.)
    readonly hqNode = computed(() => {
        const roots = this.treeNodes();
        return roots.length > 0 ? roots[0] : null;
    });

    // Card 2: Battalions = all units except the first one
    readonly battalionNodes = computed(() => {
        const roots = this.treeNodes();
        return roots.filter((n) => n.id >= 0).slice(1);
    });

    readonly battalionTotalAuth = computed(() => this.battalionNodes().reduce((sum, n) => sum + (n.authorizedCount ?? 0), 0));

    readonly battalionTotalHeld = computed(() => this.battalionNodes().reduce((sum, n) => sum + (n.servingCount ?? 0), 0));

    // Card 3: Supernumerary
    readonly supernumeraryNode = computed(() => {
        return this.treeNodes().find((n) => n.id === -1) ?? null;
    });

    // Card 4: Pending for Joining
    readonly pendingNode = computed(() => {
        return this.treeNodes().find((n) => n.id === -2) ?? null;
    });

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadTreeAndCounts();
    }

    loadTreeAndCounts(): void {
        this.loading.set(true);
        this.hqLoading.set(true);

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

                    // Grand totals: sum only the root nodes' rolled-up counts. Roots are
                    // disjoint subtrees, so their roll-ups already cover every descendant
                    // exactly once. Summing the full rolled list would count each member
                    // once per ancestor level (over-count).
                    let totalH = 0;
                    let totalA = 0;
                    for (const n of orgNodes) {
                        totalH += n.servingCount ?? 0;
                        totalA += n.authorizedCount ?? 0;
                    }
                    this.totalHeld.set(totalH || 0);
                    this.totalAuthorized.set(totalA || 0);

                    const virtualNodes: OrgNode[] = [
                        {
                            id: -1,
                            parentId: null,
                            orgId: 0,
                            nameEN: 'Supernumerary Post',
                            commCode: 'S',
                            codeType: 'V',
                            nameBN: '',
                            displayNameEN: 'Supernumerary Post',
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
                            nameEN: 'Pending List for Joining',
                            commCode: 'P',
                            codeType: 'V',
                            nameBN: '',
                            displayNameEN: 'Pending List for Joining',
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
                    this.loadVirtualNodeCounts();
                    // Auto-expand HQ node to show wings
                    const hqRoot = this.treeNodes()[0];
                    if (hqRoot && !hqRoot.childrenLoaded) {
                        this.onExpandRequest(hqRoot);
                    } else {
                        this.hqLoading.set(false);
                    }
                },
                error: (err: any) => {
                    this.loading.set(false);
                    this.hqLoading.set(false);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load organogram' });
                }
            });
    }

    private loadVirtualNodeCounts(): void {
        this.commonCodeService
            .getAllActiveCommonCodesType('EmployeeType')
            .pipe(catchError(() => of([] as CommonCode[])))
            .subscribe({
                next: (memberTypes) => {
                    this.memberTypes = memberTypes;

                    if (memberTypes.length === 0) {
                        this.applyVirtualNodeCounts([], [], memberTypes);
                        return;
                    }

                    const supernumeraryRequests = memberTypes.map((mt) =>
                        this.employeeListService.getSupernumeraryList({ memberTypeId: mt.codeId }).pipe(
                            map((list) => ({ memberTypeId: mt.codeId, count: list.length })),
                            catchError(() => of({ memberTypeId: mt.codeId, count: 0 }))
                        )
                    );

                    const pendingRequests = memberTypes.map((mt) =>
                        this.employeeListService
                            .getEmployeesByPostingStatus({
                                postingStatus: 'PendingForJoining',
                                memberTypeId: mt.codeId
                            })
                            .pipe(
                                map((list) => ({ memberTypeId: mt.codeId, count: list.length })),
                                catchError(() => of({ memberTypeId: mt.codeId, count: 0 }))
                            )
                    );

                    forkJoin([...supernumeraryRequests, ...pendingRequests]).subscribe({
                        next: (results) => {
                            const superResults = results.slice(0, memberTypes.length);
                            const pendingResults = results.slice(memberTypes.length);
                            this.applyVirtualNodeCounts(superResults, pendingResults, memberTypes);
                        },
                        error: (err: any) => {
                            this.applyVirtualNodeCounts([], [], memberTypes);
                        }
                    });
                },
                error: (err: any) => {
                    this.memberTypes = [];
                }
            });
    }

    private applyVirtualNodeCounts(supernumeraryResults: { memberTypeId: number; count: number }[], pendingResults: { memberTypeId: number; count: number }[], memberTypes: CommonCode[]): void {
        const supernumeraryCounts = new Map<number, number>();
        const pendingCounts = new Map<number, number>();
        let supernumeraryTotal = 0;
        let pendingTotal = 0;

        for (const r of supernumeraryResults) {
            if (r.memberTypeId > 0) {
                supernumeraryCounts.set(r.memberTypeId, r.count);
                supernumeraryTotal += r.count;
            }
        }

        for (const r of pendingResults) {
            if (r.memberTypeId > 0) {
                pendingCounts.set(r.memberTypeId, r.count);
                pendingTotal += r.count;
            }
        }

        const supernumeraryChildren: OrgNode[] = [];
        const pendingChildren: OrgNode[] = [];

        for (let i = 0; i < memberTypes.length; i++) {
            const mt = memberTypes[i];
            const superCount = supernumeraryCounts.get(mt.codeId) ?? 0;
            supernumeraryChildren.push({
                id: -10 - i,
                parentId: -1,
                orgId: 0,
                nameEN: mt.codeValueEN,
                commCode: '',
                codeType: 'MT',
                nameBN: mt.codeValueBN ?? '',
                displayNameEN: mt.codeValueEN,
                displayNameBN: mt.codeValueBN ?? '',
                status: 1,
                sortOrder: i,
                level: 1,
                children: [],
                servingCount: superCount,
                authorizedCount: 0,
                expanded: false,
                childrenLoaded: true
            });

            const pendingCount = pendingCounts.get(mt.codeId) ?? 0;
            pendingChildren.push({
                id: -20 - i,
                parentId: -2,
                orgId: 0,
                nameEN: mt.codeValueEN,
                commCode: '',
                codeType: 'MT',
                nameBN: mt.codeValueBN ?? '',
                displayNameEN: mt.codeValueEN,
                displayNameBN: mt.codeValueBN ?? '',
                status: 1,
                sortOrder: i,
                level: 1,
                children: [],
                servingCount: pendingCount,
                authorizedCount: 0,
                expanded: false,
                childrenLoaded: true
            });
        }

        this.flatNodes.update((nodes) => {
            const updatedNodes = nodes.map((n) => {
                if (n.id === -1) {
                    return { ...n, servingCount: supernumeraryTotal, children: supernumeraryChildren, expanded: true, childrenLoaded: true };
                }
                if (n.id === -2) {
                    return { ...n, servingCount: pendingTotal, children: pendingChildren, expanded: true, childrenLoaded: true };
                }
                return n;
            });
            return [...updatedNodes, ...supernumeraryChildren, ...pendingChildren];
        });
    }

    onExpandToggled(e: { node: OrgNode; expanded: boolean }): void {
        this.flatNodes.update((flat) => flat.map((n) => (n.id === e.node.id ? { ...n, expanded: e.expanded } : n)));
    }

    onExpandRequest(node: OrgNode): void {
        const flat = this.flatNodes();
        if (flat.some((n) => n.parentId === node.id)) {
            // Children already loaded, just expand
            this.flatNodes.update((f) => f.map((n) => (n.id === node.id ? { ...n, expanded: true, childrenLoaded: true } : n)));
            this.hqLoading.set(false);
            return;
        }
        this.loadingParentId.set(node.id);
        this.orgService
            .loadChildren(node.id)
            .pipe(
                switchMap((children) =>
                    forkJoin({
                        heldCounts: this.servingMembersService.getServingOrganogramCounts().pipe(catchError(() => of([] as OrganogramCountItem[]))),
                        authCounts: this.masterBasicSetupService.getAuthorizedOrganogramCounts().pipe(catchError(() => of([] as AuthorizedCountItem[])))
                    }).pipe(map(({ heldCounts, authCounts }) => ({ children, heldCounts, authCounts })))
                ),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: ({ children, heldCounts, authCounts }) => {
                    const cm = countMapFromApi(heldCounts);
                    const acm = authCountMapFromApi(authCounts);
                    this.flatNodes.update((f) => {
                        const seen = new Set(f.map((n) => n.id));
                        const newOnes = children.filter((c) => !seen.has(c.id)).map((c) => ({ ...c, servingCount: cm.get(c.id) ?? 0, authorizedCount: acm.get(c.id) ?? 0 }));
                        return [...f, ...newOnes].map((n) =>
                            n.id === node.id
                                ? { ...n, expanded: true, childrenLoaded: true, servingCount: cm.get(n.id) ?? n.servingCount ?? 0, authorizedCount: acm.get(n.id) ?? n.authorizedCount ?? 0 }
                                : { ...n, servingCount: cm.get(n.id) ?? n.servingCount ?? 0, authorizedCount: acm.get(n.id) ?? n.authorizedCount ?? 0 }
                        );
                    });
                    this.loadingParentId.set(null);
                    this.hqLoading.set(false);
                },
                error: (err: any) => {
                    this.loadingParentId.set(null);
                    this.hqLoading.set(false);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load children' });
                }
            });
    }

    onNodeSelect(node: OrgNode): void {
        const path = this.buildBreadcrumb(node);

        if (node.id === -1) {
            this._router.navigate(['/supernumerary-list']);
            return;
        }
        if (node.id === -2) {
            this._router.navigate(['/presently-serving-members/rab-organogram-members'], {
                queryParams: { nodeId: 0, type: 'pending', name: path }
            });
            return;
        }
        if (node.id <= -10 && node.id >= -19) {
            const idx = -(node.id + 10);
            const memberTypeId = this.memberTypes[idx]?.codeId ?? 0;
            this._router.navigate(['/supernumerary-list'], {
                queryParams: memberTypeId > 0 ? { memberTypeId } : {}
            });
            return;
        }
        if (node.id <= -20 && node.id >= -29) {
            const idx = -(node.id + 20);
            const memberTypeId = this.memberTypes[idx]?.codeId ?? 0;
            this._router.navigate(['/presently-serving-members/rab-organogram-members'], {
                queryParams: { nodeId: memberTypeId, type: 'pending', name: path }
            });
            return;
        }

        this._router.navigate(['/presently-serving-members'], {
            queryParams: { organogramNodeCodeId: node.id, name: path }
        });
    }

    private buildBreadcrumb(node: OrgNode): string {
        const flat = this.flatNodes();
        const parts: string[] = [];
        let current: OrgNode | undefined = node;

        while (current) {
            parts.unshift(current.nameEN || current.commCode || '');
            if (current.parentId == null) break;
            current = flat.find((n) => n.id === current!.parentId);
        }

        return parts.join(' → ');
    }
}
