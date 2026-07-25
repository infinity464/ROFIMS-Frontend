import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageService } from 'primeng/api';

import { CourseInfoService, PendingRftsFilterParams } from '@/services/course-info-service';
import { DraftCourseService } from '@/services/draft-course.service';
import { CommonCodeService } from '@/services/common-code-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeModel } from '@/models/common-code-model';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { DraftCourseMemberRow } from '@/models/draft-course.model';

@Component({
    selector: 'app-emp-send-to-course',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        CardModule,
        TableModule,
        ButtonModule,
        Fluid,
        Toast,
        ConfirmDialogModule,
        InputTextModule,
        DatePickerModule,
        SelectModule,
        TooltipModule,
        IconFieldModule,
        InputIconModule
    ],
    providers: [MessageService],
    templateUrl: './emp-send-to-course.html',
    styleUrl: './emp-send-to-course.scss'
})
export class EmpSendToCourseComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    courseNo = '';
    draftDateFrom: Date | null = null;
    draftDateTo: Date | null = null;

    // ===== Pending-RFTS table (replaces the old autocomplete) =====
    /** All members pending RFTS returned by the server (IsRFTSComplted null/false). */
    list: EmployeeSearchInfoModel[] = [];
    loading = false;
    first = 0;
    rows = 20;
    /** Client-side quick search over the loaded list (Name / Service ID / RAB ID). */
    searchText = '';
    /** Collapsible filter panel — open by default. */
    filterOpen = true;

    // Filter options + selections (mirrors supernumerary-list).
    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgId: number | null = null;
    memberTypeOptions: { label: string; value: number }[] = [];
    selectedMemberTypeId: number | null = null;
    rankOptions: { label: string; value: number }[] = [];
    selectedRankId: number | null = null;
    tradeOptions: { label: string; value: number }[] = [];
    selectedTradeId: number | null = null;
    /** Sentinel value for the single collapsed "N/A" trade option. */
    readonly NA_TRADE = -1;
    /** All per-Corps trade code ids whose label is "N/A" — sent when N/A is picked. */
    private naTradeIds: number[] = [];
    joiningDateFrom: Date | null = null;
    joiningDateTo: Date | null = null;

    /** EmployeeIDs currently checked. */
    selectedIds = new Set<number>();
    /** Row data for checked employees, keyed by EmployeeID (survives filtering/paging). */
    private selectedRowMap = new Map<number, EmployeeSearchInfoModel>();

    isAddingToDraft = false;

    constructor(
        private courseInfoService: CourseInfoService,
        private draftCourseService: DraftCourseService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadOrgOptions();
        this.loadMemberTypeOptions();
        this.loadData();
    }

    // ---------- Filter option loading ----------
    private loadOrgOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => { this.orgOptions = orgs ?? []; },
            error: () => { this.orgOptions = []; }
        });
    }

    private loadMemberTypeOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('EmployeeType').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.memberTypeOptions = (codes ?? []).map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }));
            },
            error: () => { this.memberTypeOptions = []; }
        });
    }

    /** Rank + Trade depend on the selected Mother Org. */
    onOrgChange(): void {
        this.rankOptions = [];
        this.selectedRankId = null;
        this.tradeOptions = [];
        this.selectedTradeId = null;
        const orgId = this.selectedOrgId;
        if (orgId != null) {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                next: (codes: CommonCodeModel[]) => {
                    this.rankOptions = (codes ?? []).map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }));
                },
                error: () => { this.rankOptions = []; }
            });
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Trade').subscribe({
                next: (codes: CommonCodeModel[]) => {
                    const raw = codes ?? [];
                    // Each Corps carries its own "N/A" trade code, so the raw list has
                    // several identical "N/A" entries. Collapse them into one option
                    // (value = NA_TRADE sentinel); selecting it filters on all of them.
                    const isNA = (label: string) => {
                        const t = (label ?? '').trim().toUpperCase();
                        return t === 'N/A' || t === 'NA' || t === 'N\\A';
                    };
                    this.naTradeIds = raw.filter((c) => isNA(c.codeValueEN)).map((c) => c.codeId);
                    const opts = raw
                        .filter((c) => !isNA(c.codeValueEN))
                        .map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }));
                    if (this.naTradeIds.length > 0) opts.push({ label: 'N/A', value: this.NA_TRADE });
                    this.tradeOptions = opts;
                },
                error: () => { this.tradeOptions = []; this.naTradeIds = []; }
            });
        }
        this.first = 0;
        this.loadData();
    }

    onFilterChange(): void {
        this.first = 0;
        this.loadData();
    }

    onPage(event: { first: number; rows?: number }): void {
        this.first = event.first;
        if (event.rows != null) this.rows = event.rows;
    }

    get activeFilterCount(): number {
        let n = 0;
        if (this.selectedOrgId != null) n++;
        if (this.selectedMemberTypeId != null) n++;
        if (this.selectedRankId != null) n++;
        if (this.selectedTradeId != null) n++;
        if (this.joiningDateFrom != null) n++;
        if (this.joiningDateTo != null) n++;
        return n;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    clearFilters(): void {
        this.selectedOrgId = null;
        this.selectedMemberTypeId = null;
        this.rankOptions = [];
        this.selectedRankId = null;
        this.tradeOptions = [];
        this.selectedTradeId = null;
        this.joiningDateFrom = null;
        this.joiningDateTo = null;
        this.first = 0;
        this.loadData();
    }

    // ---------- Data ----------
    loadData(): void {
        this.loading = true;
        const isNaTrade = this.selectedTradeId === this.NA_TRADE;
        const filter: PendingRftsFilterParams = {
            orgId: this.selectedOrgId,
            memberTypeId: this.selectedMemberTypeId,
            rankId: this.selectedRankId,
            tradeId: isNaTrade ? null : this.selectedTradeId,
            tradeIds: isNaTrade ? this.naTradeIds : null,
            joiningDateFrom: this.toLocalDateStr(this.joiningDateFrom),
            joiningDateTo: this.toLocalDateStr(this.joiningDateTo)
        };
        this.courseInfoService.getEmployeesPendingRfts(filter).subscribe({
            next: (data) => {
                this.list = Array.isArray(data) ? data : [];
                this.loading = false;
            },
            error: (err) => {
                this.list = [];
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load members.' });
            }
        });
    }

    /** Client-side filtered list bound to the table (quick search). */
    get filteredList(): EmployeeSearchInfoModel[] {
        const q = this.searchText?.trim()?.toLowerCase() ?? '';
        if (q === '') return this.list;
        return this.list.filter((row) => {
            const name = (this.getVal(row, 'fullNameEN', 'FullNameEN') + ' ' + this.getVal(row, 'fullNameBN', 'FullNameBN')).toLowerCase();
            const svc = this.getVal(row, 'serviceId', 'ServiceId').toLowerCase();
            const rab = this.getVal(row, 'rabid', 'rabId', 'rabID', 'RABID').toLowerCase();
            return name.includes(q) || svc.includes(q) || rab.includes(q);
        });
    }

    onSearchChange(): void {
        this.first = 0;
    }

    // ---------- Selection ----------
    private idOf(row: EmployeeSearchInfoModel): number {
        return row.employeeID ?? row.EmployeeID ?? 0;
    }

    isRowSelected(row: EmployeeSearchInfoModel): boolean {
        return this.selectedIds.has(this.idOf(row));
    }

    onRowSelectionChange(row: EmployeeSearchInfoModel, checked: boolean): void {
        const id = this.idOf(row);
        if (id <= 0) return;
        if (checked) {
            this.selectedIds.add(id);
            this.selectedRowMap.set(id, row);
        } else {
            this.selectedIds.delete(id);
            this.selectedRowMap.delete(id);
        }
    }

    private getCurrentPageRows(): EmployeeSearchInfoModel[] {
        const list = this.filteredList ?? [];
        const start = this.first ?? 0;
        const end = start + (this.rows || list.length);
        return list.slice(start, end);
    }

    get isAllVisibleSelected(): boolean {
        const rows = this.getCurrentPageRows().filter((r) => this.idOf(r) > 0);
        if (rows.length === 0) return false;
        return rows.every((r) => this.selectedIds.has(this.idOf(r)));
    }

    get isVisibleIndeterminate(): boolean {
        const rows = this.getCurrentPageRows().filter((r) => this.idOf(r) > 0);
        if (rows.length === 0) return false;
        const picked = rows.filter((r) => this.selectedIds.has(this.idOf(r))).length;
        return picked > 0 && picked < rows.length;
    }

    toggleSelectAllVisible(checked: boolean): void {
        for (const r of this.getCurrentPageRows()) {
            const id = this.idOf(r);
            if (id <= 0) continue;
            if (checked) {
                this.selectedIds.add(id);
                this.selectedRowMap.set(id, r);
            } else {
                this.selectedIds.delete(id);
                this.selectedRowMap.delete(id);
            }
        }
    }

    get selectedCount(): number {
        return this.selectedIds.size;
    }

    clearSelection(): void {
        this.selectedIds.clear();
        this.selectedRowMap.clear();
    }

    // ---------- Save ----------
    private toMemberRow(row: EmployeeSearchInfoModel): DraftCourseMemberRow {
        const eid = this.idOf(row);
        return {
            employeeId: eid,
            serviceId: row.serviceId ?? row.ServiceId ?? null,
            rabId: (row as { rabid?: string; rabId?: string; rabID?: string; RABID?: string }).rabid
                ?? (row as { rabid?: string; rabId?: string; rabID?: string; RABID?: string }).rabId
                ?? row.rabID ?? row.RABID ?? null,
            fullNameEN: row.fullNameEN ?? row.FullNameEN ?? null,
            rankName: row.rank ?? row.Rank ?? null,
            corpsName: row.corps ?? row.Corps ?? null,
            tradeName: row.trade ?? row.Trade ?? null,
            motherUnitName: row.motherOrganization ?? row.MotherOrganization ?? null
        };
    }

    addToDraft(): void {
        // Guard against double submission while a save is already in flight.
        if (this.isAddingToDraft) return;
        if (!this.courseNo?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'CourseNo is required.' });
            return;
        }
        if (!this.draftDateFrom || !this.draftDateTo) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'From and To dates are required.' });
            return;
        }
        if (this.selectedIds.size === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select at least one member.' });
            return;
        }
        this.isAddingToDraft = true;
        const members = Array.from(this.selectedRowMap.values()).map((r) => this.toMemberRow(r));
        // Use local date components so the day the user picks is the day stored
        // (toISOString() would shift the calendar day across timezones).
        const dateFrom = this.toLocalDateStr(this.draftDateFrom);
        const dateTo = this.toLocalDateStr(this.draftDateTo);
        this.draftCourseService.addToDraftCourseList(this.courseNo.trim(), null, members, 'User', dateFrom, dateTo).subscribe({
            next: (res) => {
                if (res.statusCode === 200 && res.id) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: `Added ${members.length} member(s) to draft (${res.listNo}).`
                    });
                    this.clearSelection();
                    this.courseNo = '';
                    this.draftDateFrom = null;
                    this.draftDateTo = null;
                } else {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: res.description ?? 'Failed to add to draft.'
                    });
                }
                this.isAddingToDraft = false;
            },
            error: (err) => {
                const msg = err?.error?.description ?? err?.error?.message ?? 'Failed to add to draft.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
                this.isAddingToDraft = false;
            }
        });
    }

    private toLocalDateStr(d: Date | null): string | null {
        if (!d) return null;
        const x = new Date(d);
        if (isNaN(x.getTime())) return null;
        const yyyy = x.getFullYear();
        const mm = String(x.getMonth() + 1).padStart(2, '0');
        const dd = String(x.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '—';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return value;
        }
    }

    getVal(row: any, ...keys: string[]): string {
        for (const k of keys) {
            const v = row?.[k];
            if (v != null && v !== '') return String(v);
        }
        return '';
    }
}
