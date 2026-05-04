import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '@/Core/Environments/environment';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationFilterParams } from '@/services/leave-application.service';
import { UserMenuService } from '@/services/user-menu.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CommonCodeService } from '@/services/common-code-service';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import type { TableLazyLoadEvent } from 'primeng/table';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

/**
 * Admin-only "Leave History" list — every leave application across the org, regardless of who
 * applied / approved / recommended. Shares the same column foundation as the pending-approval
 * list and adds Prepared By, Recommenders, Approver, and Present Status columns.
 */
@Component({
    selector: 'app-leave-history-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        DatePickerModule, FlexibleDateDirective,
        ToastModule,
        TooltipModule,
        RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-history-list.component.html',
    styleUrls: ['./leave-history-list.component.scss', '../../employee-reports/report-theme-common.scss']
})
export class LeaveHistoryListComponent implements OnInit {
    currentList: LeaveApplicationModel[] = [];
    pageNumber = 1;
    pageSize = 10;
    firstRow = 0;
    totalRecords = 0;
    loading = false;
    /** Set after the initial query-param sync so onLazyLoad can fire its first request. */
    private ready = false;

    // Status filter dropdown.
    statusFilter: 'all' | 'pending' | 'approved' | 'declined' = 'all';
    statusOptions = [
        { label: 'All', value: 'all' },
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Declined', value: 'declined' }
    ];

    // Filter form state.
    filterRabId = '';
    filterServiceId = '';
    filterLeaveTypeId: number | null = null;
    filterFromDate: Date | null = null;
    filterToDate: Date | null = null;
    filterOpen = true;

    // Lookups.
    employeeNameMap: Record<number, string> = {};
    employeeServiceIdMap: Record<number, string> = {};
    employeeUnitIdMap: Record<number, number> = {};
    employeeAppointmentIdMap: Record<number, number> = {};
    employeePrefixIdMap: Record<number, number> = {};
    employeeRankIdMap: Record<number, number> = {};
    employeeProfQualIdMap: Record<number, number> = {};
    unitNameMap: Record<number, string> = {};
    appointmentNameMap: Record<number, string> = {};
    prefixNameMap: Record<number, string> = {};
    rankNameMap: Record<number, string> = {};
    profQualNameMap: Record<number, string> = {};
    leaveTypeNameMap: Record<number, string> = {};
    leaveTypeOptions: { label: string; value: number }[] = [];

    constructor(
        private http: HttpClient,
        private router: Router,
        private route: ActivatedRoute,
        private leaveAppService: LeaveApplicationService,
        private masterBasicSetup: MasterBasicSetupService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        this.loadEmployeeNames();
        this.loadPersonalInfoMap();
        this.loadLeaveTypeNames();
        this.loadUnitNames();
        this.loadAppointmentNames();
        this.loadPrefixNames();
        this.loadRankNames();
        this.loadProfQualNames();
        this.ready = true;
        this.load();
    }

    // ── Lookup loaders ────────────────────────────────────────────────────────────
    private loadEmployeeNames(): void {
        this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((e: any) => {
                    const id = e.employeeID ?? e.EmployeeID;
                    if (id == null) return;
                    this.employeeNameMap[id] = e.fullNameEN ?? e.FullNameEN ?? String(id);
                    const serviceId = e.serviceId ?? e.ServiceId ?? null;
                    if (serviceId) this.employeeServiceIdMap[id] = String(serviceId);
                    const unitId = e.motherOrganization ?? e.MotherOrganization ?? null;
                    if (unitId != null) this.employeeUnitIdMap[id] = Number(unitId);
                    const apptId = e.appointment ?? e.Appointment ?? null;
                    if (apptId != null) this.employeeAppointmentIdMap[id] = Number(apptId);
                    const prefixId = e.prefix ?? e.Prefix ?? null;
                    if (prefixId != null) this.employeePrefixIdMap[id] = Number(prefixId);
                    const rankId = e.rank ?? e.Rank ?? null;
                    if (rankId != null) this.employeeRankIdMap[id] = Number(rankId);
                });
            }
        });
    }
    private loadPersonalInfoMap(): void {
        this.http.get<any[]>(`${environment.apis.core}/PersonalInfo/GetAll`).subscribe({
            next: (list) => {
                (Array.isArray(list) ? list : []).forEach((p: any) => {
                    const empId = p.employeeID ?? p.EmployeeID;
                    const profQualId = p.professionalQualification ?? p.ProfessionalQualification ?? null;
                    if (empId != null && profQualId != null) this.employeeProfQualIdMap[empId] = Number(profQualId);
                });
            },
            error: () => {}
        });
    }
    private loadLeaveTypeNames(): void {
        this.masterBasicSetup.getAllByType('LeaveType').subscribe({
            next: (list) => {
                (Array.isArray(list) ? list : []).forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    if (id == null) return;
                    const name = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                    this.leaveTypeNameMap[id] = name;
                    this.leaveTypeOptions.push({ label: name, value: id });
                });
            }
        });
    }
    private loadUnitNames(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((o: any) => {
                const id = o.orgId ?? o.OrgId;
                if (id != null) this.unitNameMap[id] = o.orgNameEN ?? o.OrgNameEN ?? String(id);
            })
        });
    }
    private loadAppointmentNames(): void {
        this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.appointmentNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }
    private loadPrefixNames(): void {
        this.masterBasicSetup.getAllByType('Prefix').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.prefixNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }
    private loadRankNames(): void {
        this.masterBasicSetup.getAllByType('MotherOrgRank').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.rankNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }
    private loadProfQualNames(): void {
        this.commonCodeService.getAllActiveCommonCodesType('ProfessionalQualification').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.profQualNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    // ── Filter / load ─────────────────────────────────────────────────────────────
    private buildFilterParams(): LeaveApplicationFilterParams | undefined {
        const hasRab = (this.filterRabId || '').trim();
        const hasSvc = (this.filterServiceId || '').trim();
        const hasLt = this.filterLeaveTypeId != null && this.filterLeaveTypeId > 0;
        const hasFrom = !!this.filterFromDate;
        const hasTo = !!this.filterToDate;
        if (!hasRab && !hasSvc && !hasLt && !hasFrom && !hasTo) return undefined;
        const toDateStr = (d: Date | null): string | undefined => {
            if (!d) return undefined;
            const x = new Date(d);
            return isNaN(x.getTime()) ? undefined : x.toISOString().slice(0, 10);
        };
        return {
            rabId: hasRab ? this.filterRabId.trim() : undefined,
            serviceId: hasSvc ? this.filterServiceId.trim() : undefined,
            leaveTypeId: hasLt ? this.filterLeaveTypeId! : undefined,
            fromDate: toDateStr(this.filterFromDate),
            toDate: toDateStr(this.filterToDate)
        };
    }

    private buildStatusIds(): number[] | undefined {
        switch (this.statusFilter) {
            case 'pending': return [2];
            case 'approved': return [3];
            case 'declined': return [4];
            default: return undefined; // 'all'
        }
    }

    search(): void { this.pageNumber = 1; this.firstRow = 0; this.load(); }

    clearFilter(): void {
        this.filterRabId = '';
        this.filterServiceId = '';
        this.filterLeaveTypeId = null;
        this.filterFromDate = null;
        this.filterToDate = null;
        this.pageNumber = 1;
        this.firstRow = 0;
        this.load();
    }

    onStatusFilterChange(): void { this.pageNumber = 1; this.firstRow = 0; this.load(); }

    load(): void {
        if (!this.ready) return;
        this.loading = true;
        const filter = this.buildFilterParams();
        const statusIds = this.buildStatusIds();
        this.leaveAppService.getAllPaginated(this.pageNumber, this.pageSize, filter, statusIds).subscribe({
            next: (res) => {
                this.currentList = res.datalist ?? [];
                this.totalRecords = res.pages?.rows ?? 0;
                this.loading = false;
            },
            error: () => {
                this.currentList = [];
                this.totalRecords = 0;
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load history.' });
            }
        });
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        if (!this.ready) return;
        const first = event.first ?? 0;
        const rows = event.rows ?? this.pageSize;
        if (first === this.firstRow && rows === this.pageSize && this.currentList.length > 0) return;
        this.firstRow = first;
        this.pageSize = rows;
        this.pageNumber = Math.floor(first / rows) + 1;
        this.load();
    }

    toggleFilter(): void { this.filterOpen = !this.filterOpen; }

    get activeFilterCount(): number {
        let n = 0;
        if ((this.filterRabId || '').trim()) n++;
        if ((this.filterServiceId || '').trim()) n++;
        if (this.filterLeaveTypeId != null) n++;
        if (this.filterFromDate != null) n++;
        if (this.filterToDate != null) n++;
        if (this.statusFilter !== 'all') n++;
        return n;
    }

    // ── Display helpers (mirrors the pending-approval list) ──────────────────────
    getApplicantName(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const name = this.employeeNameMap[empId];
        if (name == null) return String(empId);
        const prefix = this.prefixNameMap[this.employeePrefixIdMap[empId]];
        const rank = this.rankNameMap[this.employeeRankIdMap[empId]];
        const profQual = this.profQualNameMap[this.employeeProfQualIdMap[empId]];
        const serviceId = this.employeeServiceIdMap[empId];
        const idPart = prefix && serviceId ? `${prefix}-${serviceId}` : (serviceId ?? '');
        const left = [idPart, rank, name].filter((p) => !!p).join(' ');
        return profQual ? `${left}, ${profQual}` : left;
    }

    getApplicantUnit(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const orgId = this.employeeUnitIdMap[empId];
        return orgId == null ? '-' : (this.unitNameMap[orgId] ?? String(orgId));
    }

    getApplicantAppointment(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const codeId = this.employeeAppointmentIdMap[empId];
        return codeId == null ? '-' : (this.appointmentNameMap[codeId] ?? String(codeId));
    }

    getLeaveTypeName(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '-';
        return this.leaveTypeNameMap[leaveTypeId] ?? String(leaveTypeId);
    }

    formatDate(d: string | null | undefined): string {
        if (!d) return '-';
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    getTotalDays(fromDate: string | null | undefined, toDate: string | null | undefined): string {
        if (!fromDate || !toDate) return '-';
        const from = new Date(fromDate);
        const to = new Date(toDate);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) return '-';
        return String(Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }

    /** Comma-separated list of recommender names in sequence order (or '-' when none configured). */
    getRecommenderNames(row: LeaveApplicationModel): string {
        const list = (row.recommenders ?? []).slice().sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));
        if (list.length === 0) return '-';
        return list.map((r) => this.getApplicantName(r.employeeId)).join('; ');
    }

    /**
     * Present Status summarises where the application is *right now*:
     *   1 → Draft, 3 → Approved by …, 4 → Declined by …,
     *   2 → "Pending — Recommender N" or "Pending — Final Approver" depending on chain progress.
     */
    getPresentStatus(row: LeaveApplicationModel): { label: string; cssClass: string } {
        switch (row.leaveApplicationStatusId) {
            case 1: return { label: 'Draft', cssClass: 'is-draft' };
            case 3: return { label: 'Approved', cssClass: 'is-approved' };
            case 4: return { label: 'Declined', cssClass: 'is-declined' };
            case 2: {
                const pending = (row.recommenders ?? []).filter((r) => r.status === 1).sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));
                if (pending.length > 0) return { label: `Pending — Recommender ${pending[0].sequenceNo}`, cssClass: 'is-pending' };
                if (row.finalApproverId) return { label: 'Pending — Final Approver', cssClass: 'is-pending' };
                return { label: 'Pending', cssClass: 'is-pending' };
            }
            default: return { label: '-', cssClass: '' };
        }
    }
}
