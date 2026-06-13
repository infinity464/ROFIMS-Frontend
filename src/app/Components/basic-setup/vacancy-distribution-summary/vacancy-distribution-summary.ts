import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { FluidModule } from 'primeng/fluid';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';
import { CommonCode } from '../shared/models/common-code';
import { OrganizationModel } from '../organization-setup/models/organization';
import { MotherOrgRankVacancyDistributionModel, MotherOrgVacancyLockModel } from '../shared/models/mother-org-rank-vacancy';

export interface RankColumn {
    field: string;
    header: string;
    motherOrgRankId: number;
}

/** One display row: office label, indent level, quantities per rank, and a row total */
export interface DisplayRow {
    rabCodeId: number;
    /** 0=Unit, 1=Wing, 2=Branch, 3=Sub-Branch, 4=Section, 5=Sub-Section */
    level: 0 | 1 | 2 | 3 | 4 | 5;
    officeName: string;
    /** This office's OWN directly-assigned quantity per rank field (no descendants). */
    ownByField: Record<string, number>;
    /** Displayed quantity per rank field = own + sum of all descendants (roll-up). */
    qtyByField: Record<string, number>;
    /** Displayed row total = sum of qtyByField (rolled-up). */
    total: number;
    /** Has at least one descendant row directly below */
    hasChildren: boolean;
    /** Backend entry-lock: true = this office's cells are frozen against direct entry. */
    locked: boolean;
    /** This row is the last sibling at its level (└ elbow). Otherwise ├ elbow. */
    isLast: boolean;
    /** For each ancestor level a (0..level-1): true = draw vertical pipe (ancestor has more siblings to come) */
    branchLines: boolean[];
}

@Component({
    selector: 'app-vacancy-distribution-summary',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, FluidModule, SelectModule, ButtonModule, InputTextModule, DialogModule, ToastModule],
    providers: [MessageService],
    templateUrl: './vacancy-distribution-summary.html',
    styleUrl: './vacancy-distribution-summary.scss'
})
export class VacancyDistributionSummaryComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    title = 'Man Power Setup';
    orgList: OrganizationModel[] = [];
    selectedOrg: OrganizationModel | null = null;
    loading = false;

    dynamicColumns: RankColumn[] = [];
    displayRows: DisplayRow[] = [];

    /** column totals: field -> sum of all rows (respects unit filter) */
    columnTotals: Record<string, number> = {};
    grandTotal = 0;

    /** Optional filter: show only this Unit and its Wings/Branches. null = All */
    selectedUnitFilter: number | null = null;
    /** RAB Unit options for the filter dropdown */
    rabUnitOptions: { codeId: number; label: string }[] = [];

    private rabNameById: Record<number, string> = {};
    /** ordered list: Unit > Wing > Branch > Sub-Branch > Section > Sub-Section; unitCodeId for filtering */
    private orderedRabIds: { codeId: number; level: 0 | 1 | 2 | 3 | 4 | 5; unitCodeId: number }[] = [];
    private lastDistributionList: MotherOrgRankVacancyDistributionModel[] = [];
    /** rabCodeIds whose entry is locked in the backend for the selected org. */
    private lockedRabIds = new Set<number>();
    /** rabCodeId currently being toggled (shows spinner on the lock button). */
    togglingLockRabId: number | null = null;

    showDistributionModal = false;
    distributionForm!: FormGroup;
    isSubmittingDistribution = false;

    /** Cascading RAB options: Unit → Wing → Branch → Sub-Branch → Section → Sub-Section */
    unitOptionsModal: { codeId: number; label: string }[] = [];
    wingOptionsModal: { codeId: number; label: string }[] = [];
    branchOptionsModal: { codeId: number; label: string }[] = [];
    subBranchOptionsModal: { codeId: number; label: string }[] = [];
    sectionOptionsModal: { codeId: number; label: string }[] = [];
    subSectionOptionsModal: { codeId: number; label: string }[] = [];

    constructor(
        private masterBasicSetup: MasterBasicSetupService,
        private messageService: MessageService,
        private shareService: SharedService,
        private fb: FormBuilder
    ) {}

    /** Rank options for modal dropdown */
    get rankOptionsForModal(): { codeId: number; label: string }[] {
        return this.dynamicColumns.map((c) => ({ codeId: c.motherOrgRankId, label: c.header }));
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.distributionForm = this.fb.group({
            motherOrgRankId: [null as number | null, Validators.required],
            unitId: [null as number | null, Validators.required],
            wingId: [null as number | null],
            branchId: [null as number | null],
            subBranchId: [null as number | null],
            sectionId: [null as number | null],
            subSectionId: [null as number | null],
            quantity: [0, [Validators.required, Validators.min(0)]]
        });
        this.loadOrganizations();
        this.loadRabTree();
    }

    /** Resolved rabCodeId from cascade: Sub-Section > Section > Sub-Branch > Branch > Wing > Unit */
    get resolvedRabCodeId(): number | null {
        const v = this.distributionForm?.value;
        if (!v) return null;
        return v.subSectionId ?? v.sectionId ?? v.subBranchId ?? v.branchId ?? v.wingId ?? v.unitId ?? null;
    }

    openDistributionModal(): void {
        if (!this.selectedOrg || this.dynamicColumns.length === 0) return;
        this.unitOptionsModal = this.rabUnitOptions.map((o) => ({ codeId: o.codeId, label: o.label }));
        this.wingOptionsModal = [];
        this.branchOptionsModal = [];
        this.subBranchOptionsModal = [];
        this.sectionOptionsModal = [];
        this.subSectionOptionsModal = [];
        this.distributionForm.reset({
            motherOrgRankId: null,
            unitId: null,
            wingId: null,
            branchId: null,
            subBranchId: null,
            sectionId: null,
            subSectionId: null,
            quantity: 0
        });
        this.showDistributionModal = true;
    }

    onModalUnitChange(unitId: number | null): void {
        this.distributionForm.patchValue({ wingId: null, branchId: null, subBranchId: null, sectionId: null, subSectionId: null }, { emitEvent: false });
        this.wingOptionsModal = [];
        this.branchOptionsModal = [];
        this.subBranchOptionsModal = [];
        this.sectionOptionsModal = [];
        this.subSectionOptionsModal = [];
        if (!unitId) return;
        this.masterBasicSetup.getByParentId(unitId).subscribe({
            next: (items) => {
                const list = (items ?? []) as CommonCode[];
                this.wingOptionsModal = list.map((c) => ({ codeId: c.codeId, label: c.codeValueEN ?? String(c.codeId) }));
            }
        });
    }

    onModalWingChange(wingId: number | null): void {
        this.distributionForm.patchValue({ branchId: null, subBranchId: null, sectionId: null, subSectionId: null }, { emitEvent: false });
        this.branchOptionsModal = [];
        this.subBranchOptionsModal = [];
        this.sectionOptionsModal = [];
        this.subSectionOptionsModal = [];
        if (!wingId) return;
        this.masterBasicSetup.getByParentId(wingId).subscribe({
            next: (items) => {
                const list = (items ?? []) as CommonCode[];
                this.branchOptionsModal = list.map((c) => ({ codeId: c.codeId, label: c.codeValueEN ?? String(c.codeId) }));
            }
        });
    }

    onModalBranchChange(branchId: number | null): void {
        this.distributionForm.patchValue({ subBranchId: null, sectionId: null, subSectionId: null }, { emitEvent: false });
        this.subBranchOptionsModal = [];
        this.sectionOptionsModal = [];
        this.subSectionOptionsModal = [];
        if (!branchId) return;
        this.masterBasicSetup.getByParentId(branchId).subscribe({
            next: (items) => {
                const list = (items ?? []) as CommonCode[];
                this.subBranchOptionsModal = list.map((c) => ({ codeId: c.codeId, label: c.codeValueEN ?? String(c.codeId) }));
            }
        });
    }

    onModalSubBranchChange(subBranchId: number | null): void {
        this.distributionForm.patchValue({ sectionId: null, subSectionId: null }, { emitEvent: false });
        this.sectionOptionsModal = [];
        this.subSectionOptionsModal = [];
        if (!subBranchId) return;
        this.masterBasicSetup.getByParentId(subBranchId).subscribe({
            next: (items) => {
                const list = (items ?? []) as CommonCode[];
                this.sectionOptionsModal = list.map((c) => ({ codeId: c.codeId, label: c.codeValueEN ?? String(c.codeId) }));
            }
        });
    }

    onModalSectionChange(sectionId: number | null): void {
        this.distributionForm.patchValue({ subSectionId: null }, { emitEvent: false });
        this.subSectionOptionsModal = [];
        if (!sectionId) return;
        this.masterBasicSetup.getByParentId(sectionId).subscribe({
            next: (items) => {
                const list = (items ?? []) as CommonCode[];
                this.subSectionOptionsModal = list.map((c) => ({ codeId: c.codeId, label: c.codeValueEN ?? String(c.codeId) }));
            }
        });
    }

    closeDistributionModal(): void {
        this.showDistributionModal = false;
    }

    saveDistributionModal(): void {
        if (!this.selectedOrg || this.distributionForm.invalid) return;
        const rabCodeId = this.resolvedRabCodeId;
        if (!rabCodeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select at least Unit' });
            return;
        }
        const val = this.distributionForm.value;
        const model: MotherOrgRankVacancyDistributionModel = {
            orgId: this.selectedOrg.orgId,
            motherOrgRankId: val.motherOrgRankId,
            rabCodeId,
            quantity: val.quantity ?? 0,
            createdBy: this.shareService.getCurrentUser?.() ?? 'System',
            lastUpdatedBy: this.shareService.getCurrentUser?.() ?? 'System'
        };
        const existing = this.lastDistributionList.find(
            (d) =>
                d.orgId === model.orgId &&
                d.motherOrgRankId === model.motherOrgRankId &&
                (d.rabCodeId ?? (d as { RABCodeId?: number }).RABCodeId) === model.rabCodeId
        );
        if (existing?.id) {
            model.id = existing.id;
        }
        this.isSubmittingDistribution = true;
        const obs = model.id != null
            ? this.masterBasicSetup.updateMotherOrgRankVacancyDistribution(model)
            : this.masterBasicSetup.saveMotherOrgRankVacancyDistribution(model);
        obs.subscribe({
            next: (res) => {
                if (res?.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Distribution saved' });
                    this.closeDistributionModal();
                    if (this.selectedOrg) this.loadSummaryForOrg(this.selectedOrg.orgId);
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Save failed' });
                }
                this.isSubmittingDistribution = false;
            },
            error: (err) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description ?? err?.message ?? 'Failed to save distribution'
                });
                this.isSubmittingDistribution = false;
            }
        });
    }

    onOrgChange(): void {
        this.dynamicColumns = [];
        this.displayRows = [];
        this.columnTotals = {};
        this.grandTotal = 0;
        this.selectedUnitFilter = null;
        if (!this.selectedOrg) return;
        this.loadSummaryForOrg(this.selectedOrg.orgId);
    }

    onUnitFilterChange(): void {
        this.buildDisplayRows(this.lastDistributionList);
    }

    /** Options for unit filter: All + each RAB Unit */
    get unitFilterOptions(): { codeId: number | null; label: string }[] {
        return [{ codeId: null, label: 'All' }, ...this.rabUnitOptions];
    }

    /** Track which cell is being edited: "rabCodeId_field" */
    editingCellKey: string | null = null;
    editingCellValue: number = 0;
    savingCellKey: string | null = null;

    cellKey(row: DisplayRow, field: string): string {
        return `${row.rabCodeId}_${field}`;
    }

    cellDisplay(row: DisplayRow, field: string): string {
        const v = row.qtyByField[field] ?? 0;
        return v > 0 ? String(v) : '—';
    }

    /** Hover popover data + position for a parent cell's own/descendants breakdown. */
    hoverBreakdown: { own: number; children: number; total: number } | null = null;
    hoverPos = { x: 0, y: 0 };

    /**
     * Returns the own/descendants/total split for a parent cell — but only when the
     * office has children AND both its own value and the descendants' sum are non-zero.
     * Returns null otherwise (leaf rows, pure-own, or pure-children cells).
     */
    cellBreakdown(row: DisplayRow, col: RankColumn): { own: number; children: number; total: number } | null {
        if (!row.hasChildren || this.isCellLocked(row)) return null;
        const own = row.ownByField[col.field] ?? 0;
        const total = row.qtyByField[col.field] ?? 0;
        const children = total - own;
        return own > 0 && children > 0 ? { own, children, total } : null;
    }

    onCellEnter(row: DisplayRow, col: RankColumn, event: MouseEvent): void {
        if (this.editingCellKey) { this.hoverBreakdown = null; return; }
        const bd = this.cellBreakdown(row, col);
        this.hoverBreakdown = bd;
        if (bd) this.hoverPos = { x: event.clientX, y: event.clientY };
    }

    onCellMove(event: MouseEvent): void {
        if (this.hoverBreakdown) this.hoverPos = { x: event.clientX, y: event.clientY };
    }

    onCellLeave(): void {
        this.hoverBreakdown = null;
    }

    colTotalDisplay(field: string): string {
        const v = this.columnTotals[field] ?? 0;
        return v > 0 ? String(v) : '—';
    }

    /** A cell is locked when the user has locked this office's entry in the backend. */
    isCellLocked(row: DisplayRow): boolean {
        return row.locked;
    }

    /** Toggle the backend entry-lock for an office (requires update permission). */
    toggleLock(row: DisplayRow, event: Event): void {
        event.stopPropagation();
        if (!this.selectedOrg || !this.canUpdate || this.togglingLockRabId != null) return;
        const next = !row.locked;
        const model: MotherOrgVacancyLockModel = {
            orgId: this.selectedOrg.orgId,
            rabCodeId: row.rabCodeId,
            isLocked: next,
            createdBy: this.shareService.getCurrentUser?.() ?? 'System',
            lastUpdatedBy: this.shareService.getCurrentUser?.() ?? 'System'
        };
        this.togglingLockRabId = row.rabCodeId;
        this.masterBasicSetup.setMotherOrgVacancyLock(model).subscribe({
            next: (res) => {
                this.togglingLockRabId = null;
                if (res?.statusCode === 200) {
                    if (next) this.lockedRabIds.add(row.rabCodeId);
                    else this.lockedRabIds.delete(row.rabCodeId);
                    row.locked = next;
                    // Close any in-progress edit on a row that just got locked.
                    if (next && this.editingCellKey?.startsWith(`${row.rabCodeId}_`)) {
                        this.editingCellKey = null;
                    }
                    this.messageService.add({
                        severity: 'success', summary: 'Success',
                        detail: next ? 'Entry locked' : 'Entry unlocked'
                    });
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Failed to update lock' });
                }
            },
            error: (err) => {
                this.togglingLockRabId = null;
                this.messageService.add({
                    severity: 'error', summary: 'Error',
                    detail: err?.error?.description ?? err?.message ?? 'Failed to update lock'
                });
            }
        });
    }

    startEdit(row: DisplayRow, col: RankColumn, event: Event): void {
        if (!this.selectedOrg) return;
        // Block accidental direct entry on aggregate (parent) rows.
        if (this.isCellLocked(row)) return;
        this.editingCellKey = this.cellKey(row, col.field);
        // Edit this office's OWN value, not the rolled-up display total.
        this.editingCellValue = row.ownByField[col.field] ?? 0;
        // Focus the input after render
        setTimeout(() => {
            const el = (event.target as HTMLElement)?.closest('td')?.querySelector('input');
            el?.focus();
            el?.select();
        });
    }

    onCellKeydown(event: KeyboardEvent, row: DisplayRow, col: RankColumn): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.saveCell(row, col);
        } else if (event.key === 'Escape') {
            this.editingCellKey = null;
        }
    }

    onCellBlur(row: DisplayRow, col: RankColumn): void {
        if (this.editingCellKey === this.cellKey(row, col.field)) {
            this.saveCell(row, col);
        }
    }

    private saveCell(row: DisplayRow, col: RankColumn): void {
        if (!this.selectedOrg) { this.editingCellKey = null; return; }
        const oldValue = row.ownByField[col.field] ?? 0;
        const newValue = this.editingCellValue ?? 0;

        // No change — just close
        if (newValue === oldValue) {
            this.editingCellKey = null;
            return;
        }

        const key = this.cellKey(row, col.field);
        this.savingCellKey = key;
        this.editingCellKey = null;

        const existing = this.lastDistributionList.find(
            (d) => d.orgId === this.selectedOrg!.orgId
                && d.motherOrgRankId === col.motherOrgRankId
                && (d.rabCodeId ?? (d as any).RABCodeId) === row.rabCodeId
        );

        const model: MotherOrgRankVacancyDistributionModel = {
            orgId: this.selectedOrg.orgId,
            motherOrgRankId: col.motherOrgRankId,
            rabCodeId: row.rabCodeId,
            quantity: newValue,
            createdBy: this.shareService.getCurrentUser?.() ?? 'System',
            lastUpdatedBy: this.shareService.getCurrentUser?.() ?? 'System'
        };
        if (existing?.id) model.id = existing.id;

        const obs = model.id != null
            ? this.masterBasicSetup.updateMotherOrgRankVacancyDistribution(model)
            : this.masterBasicSetup.saveMotherOrgRankVacancyDistribution(model);

        obs.subscribe({
            next: (res) => {
                this.savingCellKey = null;
                if (res?.statusCode === 200) {
                    // Update distribution cache, then rebuild so ancestor roll-ups refresh.
                    if (existing) {
                        existing.quantity = newValue;
                    } else {
                        this.lastDistributionList.push({ ...model });
                    }
                    this.buildDisplayRows(this.lastDistributionList);
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Save failed' });
                }
            },
            error: (err) => {
                this.savingCellKey = null;
                this.messageService.add({
                    severity: 'error', summary: 'Error',
                    detail: err?.error?.description ?? 'Failed to save'
                });
            }
        });
    }

    private loadOrganizations(): void {
        this.masterBasicSetup.getAllActiveMotherOrgs().subscribe({
            next: (list) => { this.orgList = list ?? []; },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load organizations' });
            }
        });
    }

    /** Stable sort by sortOrder (nulls last), tie-broken by English name. */
    private sortCodes(list: CommonCode[] | null | undefined): CommonCode[] {
        return [...(list ?? [])].sort((a, b) => {
            const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            if (sa !== sb) return sa - sb;
            return (a.codeValueEN ?? '').localeCompare(b.codeValueEN ?? '');
        });
    }

    /** Load full RAB tree: Unit → Wing → Branch → Sub-Branch → Section → Sub-Section */
    private loadRabTree(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (units) => {
                const unitList = this.sortCodes((units ?? []) as CommonCode[]);
                if (!unitList.length) { this.rabUnitOptions = []; this.orderedRabIds = []; return; }
                unitList.forEach((u) => { this.rabNameById[u.codeId] = u.codeValueEN ?? ''; });
                this.rabUnitOptions = unitList.map((u) => ({ codeId: u.codeId, label: u.codeValueEN ?? '' }));
                this.buildOrderedRabIds(unitList).subscribe({
                    next: (ordered) => {
                        this.orderedRabIds = ordered;
                        // The summary may have loaded before the tree finished (race): if rows
                        // were built flat from a now-stale empty tree, rebuild them in tree order.
                        if (this.lastDistributionList.length) {
                            this.buildDisplayRows(this.lastDistributionList);
                        }
                    },
                    error: (err: any) => {}
                });
            },
            error: (err: any) => {}
        });
    }

    private buildOrderedRabIds(units: CommonCode[]): import('rxjs').Observable<{ codeId: number; level: 0 | 1 | 2 | 3 | 4 | 5; unitCodeId: number }[]> {
        const wingsReqs = units.map((u) => this.masterBasicSetup.getByParentId(u.codeId));
        return forkJoin(wingsReqs).pipe(
            switchMap((wingsPerUnitRaw) => {
                const wingsPerUnit = wingsPerUnitRaw.map((w) => this.sortCodes(w as CommonCode[]));
                const allWings = wingsPerUnit.flat() as CommonCode[];
                allWings.forEach((w) => { this.rabNameById[w.codeId] = w.codeValueEN ?? ''; });
                if (!allWings.length) {
                    return of(units.map((u) => ({ codeId: u.codeId, level: 0 as const, unitCodeId: u.codeId })));
                }
                const branchReqs = allWings.map((w) => this.masterBasicSetup.getByParentId(w.codeId));
                return forkJoin(branchReqs).pipe(
                    switchMap((branchesPerWingRaw) => {
                        const branchesPerWing = branchesPerWingRaw.map((b) => this.sortCodes(b as CommonCode[]));
                        const allBranches = branchesPerWing.flat() as CommonCode[];
                        allBranches.forEach((b) => { this.rabNameById[b.codeId] = b.codeValueEN ?? ''; });
                        if (allBranches.length === 0) {
                            return of(this.flattenToOrdered(units, wingsPerUnit, branchesPerWing));
                        }
                        const subBranchReqs = allBranches.map((b) => this.masterBasicSetup.getByParentId(b.codeId));
                        return forkJoin(subBranchReqs).pipe(
                            switchMap((subBranchesPerBranchRaw) => {
                                const subBranchesPerBranch = subBranchesPerBranchRaw.map((sb) => this.sortCodes(sb as CommonCode[]));
                                const allSubBranches = subBranchesPerBranch.flat() as CommonCode[];
                                allSubBranches.forEach((sb) => { this.rabNameById[sb.codeId] = sb.codeValueEN ?? ''; });
                                const sectionReqs = allSubBranches.map((sb) => this.masterBasicSetup.getByParentId(sb.codeId));
                                return forkJoin(sectionReqs).pipe(
                                    switchMap((sectionsPerSubBranchRaw) => {
                                        const sectionsPerSubBranch = sectionsPerSubBranchRaw.map((s) => this.sortCodes(s as CommonCode[]));
                                        const allSections = sectionsPerSubBranch.flat() as CommonCode[];
                                        allSections.forEach((s) => { this.rabNameById[s.codeId] = s.codeValueEN ?? ''; });
                                        const subSectionReqs = allSections.map((s) => this.masterBasicSetup.getByParentId(s.codeId));
                                        return forkJoin(subSectionReqs).pipe(
                                            switchMap((subSectionsPerSectionRaw) => {
                                                const subSectionsPerSection = subSectionsPerSectionRaw.map((ss) => this.sortCodes(ss as CommonCode[]));
                                                const allSubSections = subSectionsPerSection.flat() as CommonCode[];
                                                allSubSections.forEach((ss) => { this.rabNameById[ss.codeId] = ss.codeValueEN ?? ''; });
                                                const result = this.flattenHierarchy(
                                                    units, wingsPerUnit, branchesPerWing,
                                                    subBranchesPerBranch, sectionsPerSubBranch, subSectionsPerSection
                                                );
                                                return of(result);
                                            })
                                        );
                                    })
                                );
                            })
                        );
                    })
                );
            })
        );
    }

    private flattenHierarchy(
        units: CommonCode[],
        wingsPerUnit: CommonCode[][],
        branchesPerWing: CommonCode[][],
        subBranchesPerBranch: CommonCode[][],
        sectionsPerSubBranch: CommonCode[][],
        subSectionsPerSection: CommonCode[][]
    ): { codeId: number; level: 0 | 1 | 2 | 3 | 4 | 5; unitCodeId: number }[] {
        const ordered: { codeId: number; level: 0 | 1 | 2 | 3 | 4 | 5; unitCodeId: number }[] = [];
        let wingIdx = 0;
        let branchIdx = 0;
        let subBranchIdx = 0;
        let sectionIdx = 0;
        units.forEach((unit) => {
            ordered.push({ codeId: unit.codeId, level: 0, unitCodeId: unit.codeId });
            const wings = wingsPerUnit[units.indexOf(unit)] ?? [];
            wings.forEach((wing) => {
                ordered.push({ codeId: wing.codeId, level: 1, unitCodeId: unit.codeId });
                const branches = branchesPerWing[wingIdx] ?? [];
                branches.forEach((branch) => {
                    ordered.push({ codeId: branch.codeId, level: 2, unitCodeId: unit.codeId });
                    const subBranches = subBranchesPerBranch[branchIdx] ?? [];
                    subBranches.forEach((sb) => {
                        ordered.push({ codeId: sb.codeId, level: 3, unitCodeId: unit.codeId });
                        const sections = sectionsPerSubBranch[subBranchIdx] ?? [];
                        sections.forEach((sec) => {
                            ordered.push({ codeId: sec.codeId, level: 4, unitCodeId: unit.codeId });
                            const subSections = subSectionsPerSection[sectionIdx] ?? [];
                            subSections.forEach((ss) => {
                                ordered.push({ codeId: ss.codeId, level: 5, unitCodeId: unit.codeId });
                            });
                            sectionIdx++;
                        });
                        subBranchIdx++;
                    });
                    branchIdx++;
                });
                wingIdx++;
            });
        });
        return ordered;
    }

    private flattenToOrdered(
        units: CommonCode[],
        wingsPerUnit: CommonCode[][],
        branchesPerWing: CommonCode[][]
    ): { codeId: number; level: 0 | 1 | 2 | 3 | 4 | 5; unitCodeId: number }[] {
        const ordered: { codeId: number; level: 0 | 1 | 2 | 3 | 4 | 5; unitCodeId: number }[] = [];
        let wingIdx = 0;
        units.forEach((unit) => {
            ordered.push({ codeId: unit.codeId, level: 0, unitCodeId: unit.codeId });
            const wings = (wingsPerUnit[units.indexOf(unit)] ?? []) as CommonCode[];
            wings.forEach((wing) => {
                ordered.push({ codeId: wing.codeId, level: 1, unitCodeId: unit.codeId });
                const branches = (branchesPerWing[wingIdx] ?? []) as CommonCode[];
                branches.forEach((b) => {
                    ordered.push({ codeId: b.codeId, level: 2, unitCodeId: unit.codeId });
                });
                wingIdx++;
            });
        });
        return ordered;
    }

    private loadSummaryForOrg(orgId: number): void {
        this.loading = true;
        this.masterBasicSetup.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
            next: (ranks) => {
                const rankList = this.sortCodes((ranks ?? []) as CommonCode[]);
                if (rankList.length === 0) { this.loading = false; return; }
                const rankNameById: Record<number, string> = {};
                rankList.forEach((r) => { rankNameById[r.codeId] = r.codeValueEN ?? ''; });
                this.dynamicColumns = rankList.map((r) => ({
                    field: `rank_${r.codeId}`,
                    header: rankNameById[r.codeId] ?? String(r.codeId),
                    motherOrgRankId: r.codeId
                }));
                forkJoin({
                    distPerRank: forkJoin(
                        rankList.map((r) =>
                            this.masterBasicSetup.getMotherOrgRankVacancyDistributionByVacancy(orgId, r.codeId)
                        )
                    ),
                    locks: this.masterBasicSetup.getMotherOrgVacancyLocksByOrg(orgId)
                }).subscribe({
                            next: ({ distPerRank, locks }) => {
                                const allDist: MotherOrgRankVacancyDistributionModel[] = [];
                                distPerRank.forEach((list) => allDist.push(...(list ?? [])));
                                this.lastDistributionList = allDist;
                                this.lockedRabIds = new Set(
                                    (locks ?? []).filter((l) => l.isLocked).map((l) => l.rabCodeId)
                                );
                                this.buildDisplayRows(allDist);
                                this.loading = false;
                            },
                            error: (err: any) => {
                                this.loading = false;
                                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load distribution data' });
                            }
                        });
            },
            error: (err: any) => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load ranks' });
            }
        });
    }

    private buildDisplayRows(distributionList: MotherOrgRankVacancyDistributionModel[]): void {
        /* map: rabCodeId -> { motherOrgRankId -> quantity } */
        const byRab = new Map<number, Record<number, number>>();
        distributionList.forEach((d) => {
            const codeId = d.rabCodeId;
            if (!byRab.has(codeId)) byRab.set(codeId, {});
            const entry = byRab.get(codeId)!;
            entry[d.motherOrgRankId] = (entry[d.motherOrgRankId] ?? 0) + (d.quantity ?? 0);
        });

        /* Build rows in tree order; include all Units/Wings/Branches (show 0 as —) */
        this.columnTotals = {};
        this.grandTotal = 0;
        this.dynamicColumns.forEach((c) => { this.columnTotals[c.field] = 0; });

        const rows: DisplayRow[] = [];
        let source = this.orderedRabIds.length
            ? this.orderedRabIds
            : Array.from(byRab.keys()).map((id) => ({ codeId: id, level: 0 as const, unitCodeId: id }));
        if (this.selectedUnitFilter != null && this.orderedRabIds.length) {
            source = source.filter((x) => x.unitCodeId === this.selectedUnitFilter);
        }

        source.forEach(({ codeId, level }) => {
            const qtyByRankId = byRab.get(codeId) ?? {};
            const ownByField: Record<string, number> = {};
            let ownTotal = 0;
            this.dynamicColumns.forEach((col) => {
                const qty = qtyByRankId[col.motherOrgRankId] ?? 0;
                ownByField[col.field] = qty;
                ownTotal += qty;
                // Column/grand totals use OWN values only — roll-up rows must not double-count.
                this.columnTotals[col.field] = (this.columnTotals[col.field] ?? 0) + qty;
            });
            this.grandTotal += ownTotal;
            rows.push({
                rabCodeId: codeId,
                level,
                officeName: this.rabNameById[codeId] ?? String(codeId),
                ownByField,
                qtyByField: { ...ownByField },
                total: ownTotal,
                locked: this.lockedRabIds.has(codeId),
                hasChildren: false,
                isLast: true,
                branchLines: []
            });
        });

        this.applyRollup(rows);
        this.decorateTreeShape(rows);
        this.displayRows = rows;
    }

    /**
     * Roll up every non-leaf row's displayed quantity to own + sum of all descendants.
     * Rows are in pre-order, so a row's descendants are the contiguous block that
     * follows it until the next row at the same-or-shallower level.
     */
    private applyRollup(rows: DisplayRow[]): void {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rolled: Record<string, number> = { ...row.ownByField };
            for (let j = i + 1; j < rows.length; j++) {
                if (rows[j].level <= row.level) break;
                const descOwn = rows[j].ownByField;
                for (const field in descOwn) {
                    rolled[field] = (rolled[field] ?? 0) + descOwn[field];
                }
            }
            row.qtyByField = rolled;
            row.total = this.dynamicColumns.reduce((sum, col) => sum + (rolled[col.field] ?? 0), 0);
        }
    }

    /** Compute hasChildren / isLast / branchLines for tree connector rendering. */
    private decorateTreeShape(rows: DisplayRow[]): void {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            row.hasChildren = i + 1 < rows.length && rows[i + 1].level > row.level;

            let isLast = true;
            for (let j = i + 1; j < rows.length; j++) {
                if (rows[j].level < row.level) break;
                if (rows[j].level === row.level) { isLast = false; break; }
            }
            row.isLast = isLast;

            const lines: boolean[] = [];
            for (let a = 0; a < row.level; a++) {
                let more = false;
                for (let j = i + 1; j < rows.length; j++) {
                    if (rows[j].level < a) break;
                    if (rows[j].level === a) { more = true; break; }
                }
                lines.push(more);
            }
            row.branchLines = lines;
        }
    }
}
