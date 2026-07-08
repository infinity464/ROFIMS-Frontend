import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ServingMembersService, ServingMemberFilterRequest } from '@/services/serving-members.service';
import { EmployeeListService } from '@/services/employee-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { EmployeeList } from '@/models/employee-list.model';

type NodeType = 'org' | 'supernumerary' | 'pending';

/** Dropdown option. orgId/parentCodeId drive the Mother Org → Rank/Corps/Trade cascade. */
interface FilterOption {
    label: string;
    value: number;
    orgId: number | null;
    parentCodeId: number | null;
}

interface FilterModel {
    motherOrg: number | null;
    rabId: string;
    serviceId: string;
    nidId: string;
    nameBangla: string;
    nameEnglish: string;
    rank: number | null;
    corps: number | null;
    trade: number | null;
    wonHomeDistrict: number | null;
    spouseHomeDistrict: number | null;
}

@Component({
    selector: 'app-rab-organogram-members',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, TableModule, ButtonModule, InputTextModule, SelectModule, ToastModule],
    providers: [MessageService],
    templateUrl: './rab-organogram-members.html',
    styleUrls: ['./rab-organogram-members.scss', '../../../employee-reports/report-theme.scss']
})
export class RabOrganogramMembersComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    private route = inject(ActivatedRoute);
    private servingMembersService = inject(ServingMembersService);
    private employeeListService = inject(EmployeeListService);
    private commonCodeService = inject(CommonCodeService);
    private messageService = inject(MessageService);

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    nodeId: number = 0;
    nodeName: string = '';
    nodeType: NodeType = 'org';

    list: EmployeeServiceOverview[] = [];
    loading = false;
    totalRecords = 0;
    first = 0;
    rows = 10;

    searchText = '';
    filterOpen = true;

    filter: FilterModel = {
        motherOrg: null,
        rabId: '',
        serviceId: '',
        nidId: '',
        nameBangla: '',
        nameEnglish: '',
        rank: null,
        corps: null,
        trade: null,
        wonHomeDistrict: null,
        spouseHomeDistrict: null
    };

    motherOrgOptions: { label: string; value: number }[] = [];
    rankOptions: FilterOption[] = [];
    allRankOptions: FilterOption[] = [];
    corpsOptions: FilterOption[] = [];
    allCorpsOptions: FilterOption[] = [];
    tradeOptions: FilterOption[] = [];
    allTradeOptions: FilterOption[] = [];
    districtOptions: FilterOption[] = [];


    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        const params = this.route.snapshot.queryParamMap;
        this.nodeId = +(params.get('nodeId') ?? 0);
        this.nodeName = params.get('name') ?? '';
        this.nodeType = (params.get('type') as NodeType) ?? 'org';

        this.loadFilterOptions();
    }

    private loadFilterOptions(): void {
        this.servingMembersService.getServingMemberFilterOptions().subscribe({
            next: (res) => {
                const raw = res as unknown as Record<string, unknown>;
                const toOptions = (arr: unknown[]): FilterOption[] =>
                    (arr ?? []).map((x: unknown) => {
                        const o = x as Record<string, unknown>;
                        return {
                            label: String(o?.['codeValueEN'] ?? o?.['CodeValueEN'] ?? ''),
                            value: Number(o?.['codeId'] ?? o?.['CodeId'] ?? 0),
                            orgId: Number(o?.['orgId'] ?? o?.['OrgId'] ?? 0) || null,
                            parentCodeId: Number(o?.['parentCodeId'] ?? o?.['ParentCodeId'] ?? 0) || null
                        };
                    });
                this.allRankOptions = toOptions(((raw['ranks'] ?? raw['Ranks']) as unknown[]) ?? []);
                this.rankOptions = [...this.allRankOptions];
                this.allCorpsOptions = toOptions(((raw['corps'] ?? raw['Corps']) as unknown[]) ?? []);
                this.corpsOptions = [...this.allCorpsOptions];
                this.allTradeOptions = toOptions(((raw['trades'] ?? raw['Trades']) as unknown[]) ?? []);
                this.tradeOptions = [...this.allTradeOptions];
                this.districtOptions = toOptions(((raw['districts'] ?? raw['Districts']) as unknown[]) ?? []);
            }
        });

        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => {
                this.motherOrgOptions = orgs.map(o => ({
                    label: o.orgNameEN ?? '',
                    value: o.orgId ?? 0
                }));
            }
        });
    }

    /** When Mother Org changes, scope Rank, Corps and Trade options to that org. */
    onMotherOrgChange(): void {
        this.filter.rank = null;
        this.filter.corps = null;
        this.filter.trade = null;
        const orgId = this.filter.motherOrg;
        if (orgId != null) {
            this.rankOptions = this.allRankOptions.filter(o => o.orgId === orgId);
            this.corpsOptions = this.allCorpsOptions.filter(o => o.orgId === orgId);
            this.tradeOptions = this.allTradeOptions.filter(o => o.orgId === orgId);
        } else {
            this.rankOptions = [...this.allRankOptions];
            this.corpsOptions = [...this.allCorpsOptions];
            this.tradeOptions = [...this.allTradeOptions];
        }
    }

    /** When Corps changes, narrow Trade options to that corps (within the selected org). */
    onCorpsChange(): void {
        this.filter.trade = null;
        const corpsId = this.filter.corps;
        const orgId = this.filter.motherOrg;
        let trades = this.allTradeOptions;
        if (orgId != null) trades = trades.filter(o => o.orgId === orgId);
        if (corpsId != null) trades = trades.filter(o => o.parentCodeId === corpsId);
        this.tradeOptions = [...trades];
    }

    get filteredList(): EmployeeServiceOverview[] {
        const q = this.searchText?.trim()?.toLowerCase();
        if (!q) return this.list;
        return this.list.filter(
            (r) =>
                (r.serviceId ?? '').toLowerCase().includes(q) ||
                (r.rabID ?? r.rabId ?? '').toLowerCase().includes(q)
        );
    }

    get activeFilterCount(): number {
        const f = this.filter;
        let n = 0;
        if (f.motherOrg != null) n++;
        if (f.rabId?.trim()) n++;
        if (f.serviceId?.trim()) n++;
        if (f.nidId?.trim()) n++;
        if (f.nameBangla?.trim()) n++;
        if (f.nameEnglish?.trim()) n++;
        if (f.rank != null) n++;
        if (f.corps != null) n++;
        if (f.trade != null) n++;
        if (f.wonHomeDistrict != null) n++;
        if (f.spouseHomeDistrict != null) n++;
        return n;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    search(): void {
        this.first = 0;
        this.loadPage(1, this.rows);
    }

    clearFilter(): void {
        this.filter = {
            motherOrg: null,
            rabId: '', serviceId: '', nidId: '',
            nameBangla: '', nameEnglish: '',
            rank: null, corps: null, trade: null,
            wonHomeDistrict: null, spouseHomeDistrict: null
        };
        this.rankOptions = [...this.allRankOptions];
        this.corpsOptions = [...this.allCorpsOptions];
        this.tradeOptions = [...this.allTradeOptions];
        this.first = 0;
        this.loadPage(1, this.rows);
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        const pageNo = event.first != null && event.rows != null ? Math.floor(event.first / event.rows) + 1 : 1;
        const rowPerPage = event.rows ?? this.rows;
        this.first = event.first ?? 0;
        this.rows = rowPerPage;
        this.loadPage(pageNo, rowPerPage);
    }

    private loadPage(pageNo: number, rowPerPage: number): void {
        this.loading = true;

        switch (this.nodeType) {
            case 'supernumerary':
                this.loadSupernumerary(pageNo, rowPerPage);
                break;
            case 'pending':
                this.loadPending(pageNo, rowPerPage);
                break;
            default:
                this.loadOrg(pageNo, rowPerPage);
                break;
        }
    }

    private loadOrg(pageNo: number, rowPerPage: number): void {
        const filterReq: ServingMemberFilterRequest = {
            organogramNodeCodeId: this.nodeId || undefined,
            motherOrganizationId: this.filter.motherOrg ?? undefined,
            rabId: this.filter.rabId?.trim() || undefined,
            serviceId: this.filter.serviceId?.trim() || undefined,
            nidId: this.filter.nidId?.trim() || undefined,
            nameBangla: this.filter.nameBangla?.trim() || undefined,
            nameEnglish: this.filter.nameEnglish?.trim() || undefined,
            rankId: this.filter.rank ?? undefined,
            corpsId: this.filter.corps ?? undefined,
            tradeId: this.filter.trade ?? undefined,
            permanentDistrictType: this.filter.wonHomeDistrict ?? undefined,
            wifePermanentDistrictType: this.filter.spouseHomeDistrict ?? undefined
        };

        this.servingMembersService
            .getPresentlyServingMembersPaginatedFiltered({
                pagination: { page_no: pageNo, row_per_page: rowPerPage },
                filter: filterReq
            })
            .subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    this.loading = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load members' });
                }
            });
    }

    private loadSupernumerary(pageNo: number, rowPerPage: number): void {
        this.employeeListService
            .getSupernumeraryListPaginated({
                pagination: { page_no: pageNo, row_per_page: rowPerPage },
                orgIds: this.filter.motherOrg != null ? [this.filter.motherOrg] : undefined,
                memberTypeId: this.nodeId > 0 ? this.nodeId : null,
                rankId: this.filter.rank ?? undefined,
                tradeId: this.filter.trade ?? undefined,
                serviceId: this.filter.serviceId?.trim() || undefined,
                rabId: this.filter.rabId?.trim() || undefined,
                nameEnglish: this.filter.nameEnglish?.trim() || undefined,
                corpsId: this.filter.corps ?? undefined,
                permanentDistrictType: this.filter.wonHomeDistrict ?? undefined,
                wifePermanentDistrictType: this.filter.spouseHomeDistrict ?? undefined
            })
            .subscribe({
                next: (res) => {
                    this.list = (res.datalist ?? []).map(emp => this.mapEmployeeList(emp));
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    this.loading = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load supernumerary list' });
                }
            });
    }

    private loadPending(pageNo: number, rowPerPage: number): void {
        this.employeeListService
            .getEmployeesByPostingStatusPaginated({
                postingStatus: 'PendingForJoining',
                pagination: { page_no: pageNo, row_per_page: rowPerPage },
                orgIds: this.filter.motherOrg != null ? [this.filter.motherOrg] : undefined,
                memberTypeId: this.nodeId > 0 ? this.nodeId : null,
                rankId: this.filter.rank ?? undefined,
                tradeId: this.filter.trade ?? undefined,
                serviceId: this.filter.serviceId?.trim() || undefined,
                rabId: this.filter.rabId?.trim() || undefined,
                nameEnglish: this.filter.nameEnglish?.trim() || undefined,
                corpsId: this.filter.corps ?? undefined,
                permanentDistrictType: this.filter.wonHomeDistrict ?? undefined,
                wifePermanentDistrictType: this.filter.spouseHomeDistrict ?? undefined
            })
            .subscribe({
                next: (res) => {
                    this.list = (res.datalist ?? []).map(emp => this.mapEmployeeList(emp));
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    this.loading = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load pending list' });
                }
            });
    }

    private mapEmployeeList(emp: EmployeeList): EmployeeServiceOverview {
        return {
            employeeID: emp.employeeID,
            serviceId: emp.serviceId,
            rabID: emp.RABID ?? emp.rabID ?? emp.rabid ?? null,
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
            permanentDistrictTypeName: null,
            postingStatus: null,
            isSendingNotesheetStatus: emp.isSendingNotesheetStatus ?? null
        };
    }

    formatDate(value: string | null): string {
        if (value == null || value === '') return '—';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return value;
        }
    }
}
