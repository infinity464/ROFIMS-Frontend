import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageService } from 'primeng/api';

import { CourseInfoService, PendingRftsFilterParams } from '@/services/course-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeModel } from '@/models/common-code-model';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { RftsCourseRefService } from '@/services/rfts-course-ref.service';
import { RftsCourseRefMember, RftsCourseRefPayload } from '@/models/rfts-course-ref.model';

/**
 * RFTS Course / Reference entry form.
 *
 * Same shell and member-selection flow as /emp-send-to-course, but the header
 * is Course No / Reference No + a single Date (no from/to range).
 *
 * Saved courses are browsed on /emp-rfts-course-list, which links back here
 * with ?id=<n> to edit one.
 */
@Component({
    selector: 'app-emp-rfts-course-ref',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterLink,
        CardModule,
        TableModule,
        ButtonModule,
        Fluid,
        Toast,
        InputTextModule,
        TextareaModule,
        DatePickerModule,
        SelectModule,
        TooltipModule,
        IconFieldModule,
        InputIconModule
    ],
    providers: [MessageService],
    templateUrl: './emp-rfts-course-ref.html',
    styleUrl: './emp-rfts-course-ref.scss'
})
export class EmpRftsCourseRefComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    // ===== Course header form =====
    /** Id of the course being edited; null while adding a new one. */
    editingId: number | null = null;
    courseRefNo = '';
    courseDate: Date | null = null;
    remarks = '';
    status = true;
    isSubmitting = false;

    readonly statusOptions = [
        { label: 'Active', value: true },
        { label: 'Inactive', value: false }
    ];

    // ===== Member selection (mirrors /emp-send-to-course) =====
    /** All members pending RFTS returned by the server (IsRFTSComplted null/false). */
    list: EmployeeSearchInfoModel[] = [];
    membersLoading = false;
    memberFirst = 0;
    memberRows = 20;
    /** Client-side quick search over the loaded list (Name / Service ID / RAB ID). */
    memberSearchText = '';
    /** Collapsible filter panel — open by default. */
    filterOpen = true;

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
    private selectedRowMap = new Map<number, RftsCourseRefMember>();

    constructor(
        private service: RftsCourseRefService,
        private courseInfoService: CourseInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private route: ActivatedRoute
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadOrgOptions();
        this.loadMemberTypeOptions();

        // /emp-rfts-course-list links here with ?id=<n> to edit an existing course.
        // The eligible list depends on editingId (the edited course is exempt from
        // the "already booked elsewhere" filter), so when editing it is loaded only
        // after the course comes back — otherwise the first fetch would wrongly
        // exclude this course's own members.
        const id = Number(this.route.snapshot.queryParamMap.get('id'));
        if (Number.isFinite(id) && id > 0) this.loadForEdit(id);
        else this.loadMembers();
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
        this.memberFirst = 0;
        this.loadMembers();
    }

    onFilterChange(): void {
        this.memberFirst = 0;
        this.loadMembers();
    }

    onMemberPage(event: { first?: number; rows?: number }): void {
        if (event.first != null) this.memberFirst = event.first;
        if (event.rows != null) this.memberRows = event.rows;
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
        this.memberFirst = 0;
        this.loadMembers();
    }

    // ---------- Eligible members ----------
    loadMembers(): void {
        this.membersLoading = true;
        const isNaTrade = this.selectedTradeId === this.NA_TRADE;
        const filter: PendingRftsFilterParams = {
            orgId: this.selectedOrgId,
            memberTypeId: this.selectedMemberTypeId,
            rankId: this.selectedRankId,
            tradeId: isNaTrade ? null : this.selectedTradeId,
            tradeIds: isNaTrade ? this.naTradeIds : null,
            joiningDateFrom: this.toLocalDateStr(this.joiningDateFrom),
            joiningDateTo: this.toLocalDateStr(this.joiningDateTo),
            // One employee belongs to one course — hide anyone already booked
            // onto another. The course being edited is exempt, so its own
            // members can still be unchecked and re-checked here.
            excludeCourseRefMembers: true,
            currentCourseRefId: this.editingId
        };
        this.courseInfoService.getEmployeesPendingRfts(filter).subscribe({
            next: (data) => {
                this.list = Array.isArray(data) ? data : [];
                this.membersLoading = false;
            },
            error: (err) => {
                this.list = [];
                this.membersLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load members.' });
            }
        });
    }

    /** Client-side filtered list bound to the table (quick search). */
    get filteredList(): EmployeeSearchInfoModel[] {
        const q = this.memberSearchText?.trim()?.toLowerCase() ?? '';
        if (q === '') return this.list;
        return this.list.filter((row) => {
            const name = (this.getVal(row, 'fullNameEN', 'FullNameEN') + ' ' + this.getVal(row, 'fullNameBN', 'FullNameBN')).toLowerCase();
            const svc = this.getVal(row, 'serviceId', 'ServiceId').toLowerCase();
            const rab = this.getVal(row, 'rabid', 'rabId', 'rabID', 'RABID').toLowerCase();
            return name.includes(q) || svc.includes(q) || rab.includes(q);
        });
    }

    onMemberSearchChange(): void {
        this.memberFirst = 0;
    }

    // ---------- Selection ----------
    private idOf(row: EmployeeSearchInfoModel): number {
        return row.employeeID ?? row.EmployeeID ?? 0;
    }

    isRowSelected(row: EmployeeSearchInfoModel): boolean {
        return this.selectedIds.has(this.idOf(row));
    }

    /**
     * A member with no RAB ID cannot go onto a course — the ID has not been
     * generated for them yet.
     */
    isSelectable(row: EmployeeSearchInfoModel): boolean {
        return this.getVal(row, 'rabid', 'rabId', 'rabID', 'RABID').trim() !== '';
    }

    selectTooltip(row: EmployeeSearchInfoModel): string {
        return this.isSelectable(row) ? '' : 'RAB ID not generated yet';
    }

    /**
     * The checkbox is left enabled rather than given the `disabled` attribute:
     * a disabled input fires no events, so there would be no click to explain
     * why the row cannot be picked. It is styled as unavailable, and the
     * selection is refused here with a message instead.
     */
    onRowSelectionChange(row: EmployeeSearchInfoModel, checked: boolean, cb?: HTMLInputElement): void {
        const id = this.idOf(row);
        if (id <= 0) return;

        if (checked && !this.isSelectable(row)) {
            if (cb) cb.checked = false;
            const who = this.getVal(row, 'fullNameEN', 'FullNameEN') || 'This member';
            this.messageService.add({
                severity: 'warn',
                summary: 'Cannot select',
                detail: `RAB ID not generated yet for ${who}.`
            });
            return;
        }

        if (checked) {
            this.selectedIds.add(id);
            this.selectedRowMap.set(id, this.toMemberRow(row));
        } else {
            this.selectedIds.delete(id);
            this.selectedRowMap.delete(id);
        }
    }

    private getCurrentPageRows(): EmployeeSearchInfoModel[] {
        const list = this.filteredList ?? [];
        const start = this.memberFirst ?? 0;
        const end = start + (this.memberRows || list.length);
        return list.slice(start, end);
    }

    /**
     * Rows on this page that can actually be picked. Select-all and the header
     * checkbox state both work off this, so rows without a RAB ID never make the
     * header look half-selected or block it from ever reading "all".
     */
    private getSelectablePageRows(): EmployeeSearchInfoModel[] {
        return this.getCurrentPageRows().filter((r) => this.idOf(r) > 0 && this.isSelectable(r));
    }

    get isAllVisibleSelected(): boolean {
        const rows = this.getSelectablePageRows();
        if (rows.length === 0) return false;
        return rows.every((r) => this.selectedIds.has(this.idOf(r)));
    }

    get isVisibleIndeterminate(): boolean {
        const rows = this.getSelectablePageRows();
        if (rows.length === 0) return false;
        const picked = rows.filter((r) => this.selectedIds.has(this.idOf(r))).length;
        return picked > 0 && picked < rows.length;
    }

    /** True when nothing on the current page has a RAB ID yet. */
    get hasNoSelectableRows(): boolean {
        return this.getSelectablePageRows().length === 0;
    }

    toggleSelectAllVisible(checked: boolean, cb?: HTMLInputElement): void {
        const rows = this.getSelectablePageRows();

        if (checked && rows.length === 0) {
            // The binding alone would not clear it — isAllVisibleSelected is
            // already false, so Angular sees no change to re-apply.
            if (cb) cb.checked = false;
            this.messageService.add({
                severity: 'warn',
                summary: 'Cannot select',
                detail: 'RAB ID not generated yet for any member on this page.'
            });
            return;
        }

        for (const r of rows) {
            const id = this.idOf(r);
            if (checked) {
                this.selectedIds.add(id);
                this.selectedRowMap.set(id, this.toMemberRow(r));
            } else {
                this.selectedIds.delete(id);
                this.selectedRowMap.delete(id);
            }
        }
    }

    get selectedCount(): number {
        return this.selectedIds.size;
    }

    /**
     * Members currently on the course. Rendered as its own table so members
     * carried over from a saved course stay visible even when they fall outside
     * the pending-RFTS list the filters return.
     */
    get selectedMembers(): RftsCourseRefMember[] {
        return Array.from(this.selectedRowMap.values());
    }

    removeSelectedMember(employeeId: number): void {
        this.selectedIds.delete(employeeId);
        this.selectedRowMap.delete(employeeId);
    }

    clearSelection(): void {
        this.selectedIds.clear();
        this.selectedRowMap.clear();
    }

    private toMemberRow(row: EmployeeSearchInfoModel): RftsCourseRefMember {
        return {
            employeeId: this.idOf(row),
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

    // ---------- Create / Update ----------
    get isFormValid(): boolean {
        return !!this.courseRefNo?.trim() && !!this.courseDate && this.selectedCount > 0;
    }

    save(): void {
        // Guard against double submission while a save is already in flight.
        if (this.isSubmitting) return;

        if (!this.courseRefNo?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Course No / Reference No is required.' });
            return;
        }
        if (!this.courseDate) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Date is required.' });
            return;
        }
        if (this.selectedCount === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select at least one member.' });
            return;
        }

        const isEdit = this.editingId != null;
        this.isSubmitting = true;

        const payload: RftsCourseRefPayload = {
            id: this.editingId ?? 0,
            courseRefNo: this.courseRefNo.trim(),
            // Local date components, so the day the user picks is the day stored
            // (toISOString() would shift the calendar day across timezones).
            courseDate: this.toLocalDateStr(this.courseDate)!,
            remarks: this.remarks?.trim() ? this.remarks.trim() : null,
            status: this.status,
            members: this.selectedMembers
        };

        const call = isEdit ? this.service.update(payload) : this.service.create(payload);
        call.subscribe({
            next: (res) => {
                this.isSubmitting = false;
                if (res && typeof res.statusCode === 'number' && res.statusCode !== 200) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Warning',
                        detail: res.description || 'Operation failed.'
                    });
                    return;
                }
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: isEdit
                        ? `Course / Reference updated with ${payload.members?.length ?? 0} member(s).`
                        : `Course / Reference created with ${payload.members?.length ?? 0} member(s).`
                });
                this.resetForm();
                if (isEdit) {
                    // An edit was reached from the list page — go back to it so the
                    // change is visible instead of leaving an empty form behind.
                    this._router.navigate(['/emp-rfts-course-list']);
                } else {
                    // The saved members are now booked onto a course, which the
                    // server excludes — refetch so they disappear now rather than
                    // on the next page load.
                    this.memberFirst = 0;
                    this.loadMembers();
                }
            },
            error: (err) => {
                this.isSubmitting = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description || err?.error?.message || 'Operation failed.'
                });
            }
        });
    }

    /** Loads an existing course into the form (arrived here via ?id=<n>). */
    private loadForEdit(id: number): void {
        this.service.getById(id).subscribe({
            next: (course) => {
                if (!course || !course.id) {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Course / Reference not found.' });
                    return;
                }
                this.editingId = course.id;
                this.courseRefNo = course.courseRefNo ?? '';
                this.courseDate = this.parseDate(course.courseDate);
                this.remarks = course.remarks ?? '';
                this.status = !!course.status;

                this.selectedIds.clear();
                this.selectedRowMap.clear();
                for (const m of course.members ?? []) {
                    if (m.employeeId > 0) {
                        this.selectedIds.add(m.employeeId);
                        this.selectedRowMap.set(m.employeeId, m);
                    }
                }
                // editingId is set now, so the eligible list can exempt this course.
                this.loadMembers();
            },
            error: (err) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description || err?.error?.message || 'Failed to load the course.'
                });
                // Still show a list — an unloadable course shouldn't leave a blank page.
                this.loadMembers();
            }
        });
    }

    /** Leave edit mode and go back to the list. */
    cancelEdit(): void {
        this.resetForm();
        this._router.navigate(['/emp-rfts-course-list']);
    }

    resetForm(): void {
        this.isSubmitting = false;
        this.editingId = null;
        this.courseRefNo = '';
        this.courseDate = null;
        this.remarks = '';
        this.status = true;
        this.clearSelection();
    }

    // ---------- Helpers ----------
    private toLocalDateStr(d: Date | null): string | null {
        if (!d) return null;
        const x = new Date(d);
        if (isNaN(x.getTime())) return null;
        const yyyy = x.getFullYear();
        const mm = String(x.getMonth() + 1).padStart(2, '0');
        const dd = String(x.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    /**
     * The API returns a plain yyyy-MM-dd (DateOnly). Building it from parts
     * keeps it a local date — `new Date('2026-01-12')` parses as UTC midnight
     * and can render as the previous day west of Greenwich.
     */
    private parseDate(value: string | null | undefined): Date | null {
        if (!value) return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    formatDate(value: string | null | undefined): string {
        const d = this.parseDate(value);
        if (!d) return '—';
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    getVal(row: any, ...keys: string[]): string {
        for (const k of keys) {
            const v = row?.[k];
            if (v != null && v !== '') return String(v);
        }
        return '';
    }
}
