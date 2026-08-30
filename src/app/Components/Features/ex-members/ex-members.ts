import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { ServingMembersService, ServingMemberFilterRequest } from '@/services/serving-members.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

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
    selector: 'app-ex-members',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, TableModule, ButtonModule, InputTextModule, SelectModule, DatePickerModule, FlexibleDateDirective, Toast],
    providers: [MessageService],
    templateUrl: './ex-members.html',
    styleUrls: ['../employee-reports/report-theme-common.scss', './ex-members.scss']
})
export class ExMembers implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    list: EmployeeServiceOverview[] = [];
    loading = false;
    totalRecords = 0;
    first = 0;
    rows = 10;
    /** Client-side search: filters current page by Service ID or RAB ID (partial, case-insensitive). */
    searchText = '';

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

    useFilter = false;

    /** Collapsible filter panel open by default. */
    filterOpen = true;

    constructor(
        private servingMembersService: ServingMembersService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadMotherOrgs();
        this.loadFilterOptions();
        this.onLazyLoad({ first: 0, rows: this.rows });
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
        const pageNo = event.first != null && event.rows != null ? Math.floor(event.first / event.rows) + 1 : 1;
        const rowPerPage = event.rows ?? this.rows;
        this.loadList(pageNo, rowPerPage);
        this.first = event.first ?? 0;
        this.rows = rowPerPage;
    }

    loadList(pageNo = 1, rowPerPage?: number): void {
        const rows = rowPerPage ?? this.rows;
        this.loading = true;
        if (this.useFilter) {
            const filterReq = this.buildFilterRequest();
            this.servingMembersService
                .getExMembersPaginatedFiltered({
                    pagination: { page_no: pageNo, row_per_page: rows },
                    filter: filterReq
                })
                .subscribe({
                    next: (res) => {
                        this.list = res.datalist ?? [];
                        this.totalRecords = res.pages?.rows ?? 0;
                        this.loading = false;
                    },
                    error: (err) => {
                        console.error('Failed to load ex-members', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.message || 'Failed to load list'
                        });
                        this.loading = false;
                    }
                });
        } else {
            this.servingMembersService.getExMembersPaginated(pageNo, rows).subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    console.error('Failed to load ex-members', err);
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
            appointmentId: this.filter.appointment ?? undefined
        };
    }

    search(): void {
        this.useFilter = true;
        this.first = 0;
        this.loadList(1, this.rows);
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
        this.useFilter = false;
        this.first = 0;
        this.loadList(1, this.rows);
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    /** Current page rows filtered by searchText (Service ID / RAB ID). */
    get filteredList(): EmployeeServiceOverview[] {
        const q = this.searchText?.trim()?.toLowerCase();
        if (!q) return this.list;
        return this.list.filter(
            (r) =>
                (r.serviceId ?? '').toLowerCase().includes(q) ||
                (r.rabID ?? '').toLowerCase().includes(q)
        );
    }

    onSearchChange(): void {}

    /** Number of filter criteria currently set (for badge). */
    get activeFilterCount(): number {
        const f = this.filter;
        let n = 0;
        if (f.rabId?.trim()) n++;
        if (f.serviceId?.trim()) n++;
        if (f.nidId?.trim()) n++;
        if (f.nameBangla?.trim()) n++;
        if (f.nameEnglish?.trim()) n++;
        if (f.rabUnit != null) n++;
        if (f.rank != null) n++;
        if (f.corps != null) n++;
        if (f.trade != null) n++;
        if (f.durationFrom != null) n++;
        if (f.durationTo != null) n++;
        if (f.wonHomeDistrict != null) n++;
        if (f.spouseHomeDistrict != null) n++;
        if (f.appointment != null) n++;
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
}
