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
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

export interface FilterModel {
    rabId: string;
    serviceId: string;
    nidId: string;
    nameBangla: string;
    nameEnglish: string;
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

    rabUnitOptions: { label: string; value: number }[] = [];
    rankOptions: { label: string; value: number }[] = [];
    corpsOptions: { label: string; value: number }[] = [];
    tradeOptions: { label: string; value: number }[] = [];
    districtOptions: { label: string; value: number }[] = [];
    appointmentOptions: { label: string; value: number }[] = [];

    useFilter = false;

    /** Collapsible filter panel open by default. */
    filterOpen = true;

    constructor(
        private servingMembersService: ServingMembersService,
        private messageService: MessageService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

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
                this.rabUnitOptions = toOptions(((raw['rabUnits'] ?? raw['RabUnits']) as unknown[]) ?? []);
                this.rankOptions = toOptions(((raw['ranks'] ?? raw['Ranks']) as unknown[]) ?? []);
                this.corpsOptions = toOptions(((raw['corps'] ?? raw['Corps']) as unknown[]) ?? []);
                this.tradeOptions = toOptions(((raw['trades'] ?? raw['Trades']) as unknown[]) ?? []);
                this.districtOptions = toOptions(((raw['districts'] ?? raw['Districts']) as unknown[]) ?? []);
                this.appointmentOptions = toOptions(((raw['appointments'] ?? raw['Appointments']) as unknown[]) ?? []);
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
            rabUnitId: this.filter.rabUnit ?? undefined,
            rankId: this.filter.rank ?? undefined,
            corpsId: this.filter.corps ?? undefined,
            tradeId: this.filter.trade ?? undefined,
            joiningDateFrom: toDateOnly(this.filter.durationFrom),
            joiningDateTo: toDateOnly(this.filter.durationTo),
            permanentDistrictType: this.filter.wonHomeDistrict ?? undefined,
            spousePermanentDistrictType: this.filter.spouseHomeDistrict ?? undefined,
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
