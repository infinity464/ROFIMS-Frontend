import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { Table, TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { ServingMembersService, ServingMemberFilterRequest } from '@/services/serving-members.service';
import { EmployeeListService } from '@/services/employee-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { IsSendingNotesheetStatus } from '@/models/enums';
import { TagModule } from 'primeng/tag';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';

export interface FilterModel {
    rabId: string;
    serviceId: string;
    nidId: string;
    nameBangla: string;
    nameEnglish: string;
    motherOrg: number | null;
    rabUnit: number | null;
    rank: number | null;
    corps: number | null;
    trade: number | null;
    durationFrom: Date | null;
    durationTo: Date | null;
    wonHomeDistrict: number | null;
    spouseHomeDistrict: number | null;
    appointment: number | null;
}

/** Option carrying its owning Mother Organization, used to cascade rank/corps/trade. */
interface CascadeOption {
    label: string;
    value: number;
    orgId: number | null;
    /** For trades: the parent Corps CodeId (drives the Trade-by-Corps cascade). */
    parentCodeId: number | null;
}

@Component({
    selector: 'app-presently-serving-members',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, TableModule, ButtonModule, InputTextModule, SelectModule, DatePickerModule, FlexibleDateDirective, Toast, CheckboxModule, TagModule, IconField, InputIcon],
    providers: [MessageService],
    templateUrl: './presently-serving-members.html',
    styleUrls: ['../employee-reports/report-theme-common.scss', './presently-serving-members.scss'],
})
export class PresentlyServingMembers implements OnInit, OnDestroy {
    @ViewChild('dt') table?: Table;

    list: EmployeeServiceOverview[] = [];
    loading = false;
    totalRecords = 0;
    pageNumber = 1;
    pageSize = 10;

    filter: FilterModel = {
        rabId: '',
        serviceId: '',
        nidId: '',
        nameBangla: '',
        nameEnglish: '',
        motherOrg: null,
        rabUnit: null,
        rank: null,
        corps: null,
        trade: null,
        durationFrom: null,
        durationTo: null,
        wonHomeDistrict: null,
        spouseHomeDistrict: null,
        appointment: null
    };

    motherOrgOptions: { label: string; value: number }[] = [];
    rabUnitOptions: { label: string; value: number }[] = [];
    rankOptions: CascadeOption[] = [];
    corpsOptions: CascadeOption[] = [];
    tradeOptions: CascadeOption[] = [];
    districtOptions: { label: string; value: number }[] = [];
    appointmentOptions: { label: string; value: number }[] = [];

    /** Full (unfiltered) rank/corps/trade option lists; the visible *Options are derived by Mother Org. */
    private allRankOptions: CascadeOption[] = [];
    private allCorpsOptions: CascadeOption[] = [];
    private allTradeOptions: CascadeOption[] = [];

    /** Whether list is using filter (so pagination uses filtered API). */
    useFilter = false;

    /** Set when navigated from organogram (RAB HQ / Battalions). */
    organogramNodeCodeId: number | null = null;
    organogramFilterName: string | null = null;

    /** Collapsible filter panel closed by default. */
    filterOpen = false;

    /**
     * Selected rows for inter posting, keyed by employeeID.
     *
     * Selection is owned by this component rather than by p-table's [(selection)]:
     * the table is lazy, so its built-in header checkbox reasons about only the rows
     * it currently holds and cannot distinguish "this page" from "everything selected
     * so far". Keeping a map here makes both rules explicit — the header checkbox
     * touches only the current page, and picks made on other pages / other searches
     * survive because they are keyed by id, not by row object identity.
     */
    private selectedMap = new Map<number, EmployeeServiceOverview>();
    savingInterPosting = false;
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    /** True when this component is used for the inter-posting send flow. */
    interPostingMode = false;

    /** Per-row remarks entered by user before sending to inter posting. Keyed by employeeID. */
    interPostingRemarks: Record<number, string> = {};

    /** Quick search box above the table: matches Service ID OR RAB ID, server-side. */
    quickSearch = '';
    private quickSearch$ = new Subject<string>();
    private quickSearchSub?: Subscription;

    constructor(
        private servingMembersService: ServingMembersService,
        private employeeListService: EmployeeListService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private _router: Router,
        private _route: ActivatedRoute,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        this.interPostingMode = this._route.snapshot.data['mode'] === 'interPosting';
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        const params = this._route.snapshot.queryParamMap;
        const organogramNodeId = +(params.get('organogramNodeCodeId') ?? 0);
        if (organogramNodeId > 0) {
            this.organogramNodeCodeId = organogramNodeId;
            this.organogramFilterName = params.get('name');
            this.useFilter = true;
        }

        this.quickSearchSub = this.quickSearch$
            .pipe(debounceTime(400), distinctUntilChanged())
            .subscribe(() => {
                // Quick search always goes through the filtered (server-side) endpoint.
                this.useFilter = true;
                this.resetToFirstPage();
                this.loadList(this.pageNumber, this.pageSize);
            });

        this.loadMotherOrgs();
        this.loadFilterOptions();
        this.loadList(this.pageNumber, this.pageSize);
    }

    ngOnDestroy(): void {
        this.quickSearchSub?.unsubscribe();
    }

    /** Debounced (400 ms) quick-search input handler. */
    onQuickSearchChange(): void {
        this.quickSearch$.next(this.quickSearch.trim());
    }

    clearQuickSearch(): void {
        if (!this.quickSearch) return;
        this.quickSearch = '';
        this.onQuickSearchChange();
    }

    get pageTitle(): string {
        if (this.organogramFilterName) return this.organogramFilterName;
        return this.interPostingMode ? 'Serving Members for Inter Posting' : 'Presently Serving Members List';
    }

    get tableColspan(): number {
        let cols = 12; // ser + 9 data cols + remarks + action
        if (this.canUpdate) cols += 1; // checkbox
        if (this.interPostingMode) cols += 2; // status + remark input
        return cols;
    }

    loadFilterOptions(): void {
        this.servingMembersService.getServingMemberFilterOptions().subscribe({
            next: (res) => {
                const raw = res as unknown as Record<string, unknown>;
                const toOptions = (arr: unknown[]): { label: string; value: number }[] =>
                    (arr ?? []).map((x: unknown) => {
                        const o = x as Record<string, unknown>;
                        return {
                            label: String(o?.['codeValueEN'] ?? o?.['CodeValueEN'] ?? ''),
                            value: Number(o?.['codeId'] ?? o?.['CodeId'] ?? 0)
                        };
                    });
                const toCascadeOptions = (arr: unknown[]): CascadeOption[] =>
                    (arr ?? []).map((x: unknown) => {
                        const o = x as Record<string, unknown>;
                        const org = o?.['orgId'] ?? o?.['OrgId'];
                        const parent = o?.['parentCodeId'] ?? o?.['ParentCodeId'];
                        return {
                            label: String(o?.['codeValueEN'] ?? o?.['CodeValueEN'] ?? ''),
                            value: Number(o?.['codeId'] ?? o?.['CodeId'] ?? 0),
                            orgId: org == null ? null : Number(org),
                            parentCodeId: parent == null ? null : Number(parent)
                        };
                    });
                this.rabUnitOptions = toOptions(((raw['rabUnits'] ?? raw['RabUnits']) as unknown[]) ?? []);
                this.allRankOptions = toCascadeOptions(((raw['ranks'] ?? raw['Ranks']) as unknown[]) ?? []);
                this.allCorpsOptions = toCascadeOptions(((raw['corps'] ?? raw['Corps']) as unknown[]) ?? []);
                this.allTradeOptions = toCascadeOptions(((raw['trades'] ?? raw['Trades']) as unknown[]) ?? []);
                this.districtOptions = toOptions(((raw['districts'] ?? raw['Districts']) as unknown[]) ?? []);
                this.appointmentOptions = toOptions(((raw['appointments'] ?? raw['Appointments']) as unknown[]) ?? []);
                this.applyMotherOrgCascade();
            },
            error: (err) => {
                console.error('Failed to load filter options', err);
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Filter options',
                    detail: err?.error?.message || 'Could not load filter dropdowns'
                });
            }
        });
    }

    /** Load Mother Organizations (same source as emp-basic-info). */
    loadMotherOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (res) => {
                this.motherOrgOptions = (res ?? []).map((o) => ({ label: o.orgNameEN ?? '', value: o.orgId }));
            },
            error: (err) => {
                console.error('Failed to load mother organizations', err);
            }
        });
    }

    /** When the Mother Organization changes, rebuild the rank/corps/trade options scoped to it. */
    onMotherOrgChange(): void {
        this.applyMotherOrgCascade();
    }

    /** When the Corps changes, rebuild the trade options scoped to it. */
    onCorpsChange(): void {
        this.applyCorpsCascade();
    }

    /** Restrict rank/corps dropdowns to the selected Mother Organization (or all when none). */
    private applyMotherOrgCascade(): void {
        const orgId = this.filter.motherOrg;
        const scope = (all: CascadeOption[]): CascadeOption[] =>
            orgId == null ? all : all.filter((o) => o.orgId === orgId);
        this.rankOptions = scope(this.allRankOptions);
        this.corpsOptions = scope(this.allCorpsOptions);
        // Drop any selection that is no longer valid under the new scope.
        if (this.filter.rank != null && !this.rankOptions.some((o) => o.value === this.filter.rank)) this.filter.rank = null;
        if (this.filter.corps != null && !this.corpsOptions.some((o) => o.value === this.filter.corps)) this.filter.corps = null;
        // Trade depends on both Mother Org and Corps.
        this.applyCorpsCascade();
    }

    /** Restrict the Trade dropdown to the selected Mother Organization and Corps (parent). */
    private applyCorpsCascade(): void {
        const orgId = this.filter.motherOrg;
        const corps = this.filter.corps;
        this.tradeOptions = this.allTradeOptions.filter(
            (o) => (orgId == null || o.orgId === orgId) && (corps == null || o.parentCodeId === corps)
        );
        if (this.filter.trade != null && !this.tradeOptions.some((o) => o.value === this.filter.trade)) this.filter.trade = null;
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        const rows = event.rows ?? this.pageSize;
        const first = event.first ?? 0;
        const newPage = Math.floor(first / rows) + 1;
        const sizeChanged = rows !== this.pageSize;
        const pageChanged = newPage !== this.pageNumber;
        if (!sizeChanged && !pageChanged) return;
        this.pageSize = rows;
        this.pageNumber = newPage;
        this.loadList(this.pageNumber, this.pageSize);
    }

    serialNumber(rowIndex: number): number {
        return rowIndex + 1;
    }

    private prefillRemarks(): void {
        if (!this.interPostingMode) return;
        for (const row of this.list) {
            if (row.interPostingRemark && !this.interPostingRemarks[row.employeeID]) {
                this.interPostingRemarks[row.employeeID] = row.interPostingRemark;
            }
        }
    }

    loadList(pageNo = 1, rowPerPage?: number): void {
        const rows = rowPerPage ?? this.pageSize;
        this.loading = true;
        if (this.useFilter) {
            const filterReq = this.buildFilterRequest();
            this.servingMembersService
                .getPresentlyServingMembersPaginatedFiltered({
                    pagination: { page_no: pageNo, row_per_page: rows },
                    filter: filterReq
                })
                .subscribe({
                    next: (res) => {
                        this.list = res.datalist ?? [];
                        this.totalRecords = res.pages?.rows ?? 0;
                        this.prefillRemarks();
                        this.loading = false;
                    },
                    error: (err) => {
                        console.error('Failed to load presently serving members', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.message || 'Failed to load list'
                        });
                        this.loading = false;
                    }
                });
        } else {
            this.servingMembersService.getPresentlyServingMembersPaginated(pageNo, rows).subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.prefillRemarks();
                    this.loading = false;
                },
                error: (err) => {
                    console.error('Failed to load presently serving members', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load list'
                    });
                    this.loading = false;
                }
            });
        }
    }

    buildFilterRequest(): ServingMemberFilterRequest {
        const toDateOnly = (d: Date | null): string | null => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null);
        return {
            rabId: this.filter.rabId?.trim() || undefined,
            serviceId: this.filter.serviceId?.trim() || undefined,
            nidId: this.filter.nidId?.trim() || undefined,
            nameBangla: this.filter.nameBangla?.trim() || undefined,
            nameEnglish: this.filter.nameEnglish?.trim() || undefined,
            motherOrganizationId: this.filter.motherOrg ?? undefined,
            rabUnitId: this.filter.rabUnit ?? undefined,
            rankId: this.filter.rank ?? undefined,
            corpsId: this.filter.corps ?? undefined,
            tradeId: this.filter.trade ?? undefined,
            joiningDateFrom: toDateOnly(this.filter.durationFrom),
            joiningDateTo: toDateOnly(this.filter.durationTo),
            permanentDistrictType: this.filter.wonHomeDistrict ?? undefined,
            wifePermanentDistrictType: this.filter.spouseHomeDistrict ?? undefined,
            appointmentId: this.filter.appointment ?? undefined,
            organogramNodeCodeId: this.organogramNodeCodeId ?? undefined,
            quickSearch: this.quickSearch?.trim() || undefined
        };
    }

    search(): void {
        this.useFilter = true;
        this.resetToFirstPage();
        this.loadList(this.pageNumber, this.pageSize);
    }

    clearFilter(): void {
        this.filter = {
            rabId: '',
            serviceId: '',
            nidId: '',
            nameBangla: '',
            nameEnglish: '',
            motherOrg: null,
            rabUnit: null,
            rank: null,
            corps: null,
            trade: null,
            durationFrom: null,
            durationTo: null,
            wonHomeDistrict: null,
            spouseHomeDistrict: null,
            appointment: null
        };
        this.applyMotherOrgCascade();
        this.quickSearch = '';
        this.organogramNodeCodeId = null;
        this.organogramFilterName = null;
        this.useFilter = false;
        this.resetToFirstPage();
        this._router.navigate([], { relativeTo: this._route, queryParams: {}, replaceUrl: true });
        this.loadList(this.pageNumber, this.pageSize);
    }

    refresh(): void {
        this.resetToFirstPage();
        this.loadList(this.pageNumber, this.pageSize);
    }

    private resetToFirstPage(): void {
        this.pageNumber = 1;
        if (this.table) this.table.first = 0;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    /** Number of filter criteria currently set (for badge). */
    get activeFilterCount(): number {
        const f = this.filter;
        let n = 0;
        if (f.rabId?.trim()) n++;
        if (f.serviceId?.trim()) n++;
        if (f.nidId?.trim()) n++;
        if (f.nameBangla?.trim()) n++;
        if (f.nameEnglish?.trim()) n++;
        if (f.motherOrg != null) n++;
        if (f.rabUnit != null) n++;
        if (f.rank != null) n++;
        if (f.corps != null) n++;
        if (f.trade != null) n++;
        if (f.durationFrom != null) n++;
        if (f.durationTo != null) n++;
        if (f.wonHomeDistrict != null) n++;
        if (f.spouseHomeDistrict != null) n++;
        if (f.appointment != null) n++;
        if (this.organogramNodeCodeId != null) n++;
        return n;
    }

    formatDate(value: string | null): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return value;
        }
    }

    /** Whether an employee is already in inter-posting process (cannot be re-selected). */
    isInPostingProcess(row: EmployeeServiceOverview): boolean {
        return row.isSendingNotesheetStatus === IsSendingNotesheetStatus.DraftInterPosting;
    }

    /** Total selected across every page and search performed so far. */
    get selectedCount(): number {
        return this.selectedMap.size;
    }

    isRowSelected(row: EmployeeServiceOverview): boolean {
        return this.selectedMap.has(row.employeeID);
    }

    toggleRow(row: EmployeeServiceOverview, checked: boolean): void {
        if (this.isInPostingProcess(row)) return;
        if (checked) this.selectedMap.set(row.employeeID, row);
        else this.selectedMap.delete(row.employeeID);
    }

    /** Rows of the current page that may still be selected (not already in an inter posting). */
    get selectablePageRows(): EmployeeServiceOverview[] {
        return this.list.filter((r) => !this.isInPostingProcess(r));
    }

    /** Header checkbox state: ticked only when every selectable row of THIS page is selected. */
    get allPageSelected(): boolean {
        const rows = this.selectablePageRows;
        return rows.length > 0 && rows.every((r) => this.selectedMap.has(r.employeeID));
    }

    /** Header checkbox shows the dash when this page is only partly selected. */
    get pagePartiallySelected(): boolean {
        const rows = this.selectablePageRows;
        const picked = rows.filter((r) => this.selectedMap.has(r.employeeID)).length;
        return picked > 0 && picked < rows.length;
    }

    /** Select/clear only the rows of the current page; selections on other pages are untouched. */
    toggleCurrentPage(checked: boolean): void {
        for (const row of this.selectablePageRows) {
            if (checked) this.selectedMap.set(row.employeeID, row);
            else this.selectedMap.delete(row.employeeID);
        }
    }

    /** Drop every selection, on this page and any other. */
    clearSelection(): void {
        this.selectedMap.clear();
    }

    /** Maps IsSendingNotesheetStatus to a display label. */
    getStatusLabel(status: string | null): string {
        if (!status) return '';
        // On the inter-posting page only an in-progress INTER posting is relevant —
        // show "Inter Posting in Process" for that and nothing for the other states.
        if (this.interPostingMode) {
            return status === IsSendingNotesheetStatus.DraftInterPosting ? 'Inter Posting in Process' : '';
        }
        switch (status) {
            case IsSendingNotesheetStatus.Draft: return 'New Posting (Draft)';
            case IsSendingNotesheetStatus.DraftPosting: return 'New Posting in Process';
            case IsSendingNotesheetStatus.DraftNotesheet: return 'Notesheet in Process';
            case IsSendingNotesheetStatus.DraftInterPosting: return 'Inter Posting in Process';
            default: return status;
        }
    }

    /** Send button label, carrying the selected-row count once more than one row is picked. */
    get interPostingButtonLabel(): string {
        const n = this.selectedCount;
        return n > 1 ? `Send Inter Posting (${n})` : 'Send Inter Posting';
    }

    sendInterPosting(): void {
        if (!this.canUpdate) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (!this.selectedCount) {
            this.messageService.add({ severity: 'warn', summary: 'Selection Required', detail: 'Please select at least one member.' });
            return;
        }
        this.savingInterPosting = true;
        const employees = Array.from(this.selectedMap.values()).map(r => ({
            employeeId: r.employeeID,
            interPostingRemark: this.interPostingRemarks[r.employeeID] || null
        }));
        this.employeeListService.setBulkIsSendingNotesheetStatus(employees, IsSendingNotesheetStatus.DraftInterPosting).subscribe({
            next: (res) => {
                this.savingInterPosting = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: res.description || 'Employees marked for inter posting.' });
                    this.selectedMap.clear();
                    this.interPostingRemarks = {};
                    this.loadList(1, this.pageSize);
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description || 'Failed to update status.' });
                }
            },
            error: (err) => {
                this.savingInterPosting = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || 'Failed to mark for inter posting.' });
            }
        });
    }
}
