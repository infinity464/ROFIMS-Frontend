import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '@/Core/Environments/environment';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationFilterParams } from '@/services/leave-application.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
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
import type { TableLazyLoadEvent } from 'primeng/table';

/**
 * Dedicated list of leave applications **pending the current user's action**.
 * Backed by GET /LeaveApplication/GetByStatusForUserPaginated with statusId=2 and typeFilter=actionRequiredByMe,
 * which surfaces applications where the current user is the lowest-sequence pending recommender or
 * the final approver (when no recommender is still pending).
 */
@Component({
    selector: 'app-leave-pending-approval-list',
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
        RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-pending-approval-list.component.html',
    styleUrls: ['./leave-pending-approval-list.component.scss', '../../employee-reports/report-theme-common.scss']
})
export class LeavePendingApprovalListComponent implements OnInit {
    currentList: LeaveApplicationModel[] = [];
    pageNumber = 1;
    pageSize = 10;
    /** First-row index for the table (0-based). Two-way bound so the paginator can drive it AND filter actions can reset it. */
    firstRow = 0;
    totalRecords = 0;
    loading = false;
    currentUserEmployeeId = 0;

    employeeNameMap: Record<number, string> = {};
    employeeRabIdMap: Record<number, string> = {};
    employeeServiceIdMap: Record<number, string> = {};
    /** EmployeeId → motherOrganization (OrgId, foreign key). Resolved to a name via unitNameMap. */
    employeeUnitIdMap: Record<number, number> = {};
    /** EmployeeId → appointment (CodeId, foreign key). Resolved to a name via appointmentNameMap. */
    employeeAppointmentIdMap: Record<number, number> = {};
    /** EmployeeId → prefix (CodeId, foreign key). Resolved via prefixNameMap. */
    employeePrefixIdMap: Record<number, number> = {};
    /** EmployeeId → rank (CodeId, foreign key). Resolved via rankNameMap. */
    employeeRankIdMap: Record<number, number> = {};
    /** EmployeeId → professionalQualification (CodeId, foreign key, sourced from PersonalInfo). Resolved via profQualNameMap. */
    employeeProfQualIdMap: Record<number, number> = {};

    /** OrgId → unit name. Loaded from /MotherOrg/GetAllActiveMotherOrgs. */
    unitNameMap: Record<number, string> = {};
    /** CodeId → appointment name. Loaded from /CommonCode/GetActiveCommonCodeByTypeName/AppointmentCategory. */
    appointmentNameMap: Record<number, string> = {};
    /** CodeId → prefix label (e.g. "BA"). Loaded via MasterBasicSetupService('Prefix'). */
    prefixNameMap: Record<number, string> = {};
    /** CodeId → rank label (e.g. "Lt Col"). Loaded via MasterBasicSetupService('MotherOrgRank'). */
    rankNameMap: Record<number, string> = {};
    /** CodeId → professional qualification label (e.g. "psc"). Loaded via MasterBasicSetupService('ProfessionalQualification'). */
    profQualNameMap: Record<number, string> = {};
    leaveTypeNameMap: Record<number, string> = {};
    leaveTypeOptions: { label: string; value: number }[] = [];

    filterRabId = '';
    filterServiceId = '';
    filterLeaveTypeId: number | null = null;
    filterFromDate: Date | null = null;
    filterToDate: Date | null = null;

    filterOpen = true;
    canUpdate = true;

    constructor(
        private http: HttpClient,
        private sharedService: SharedService,
        private leaveAppService: LeaveApplicationService,
        private identityMappingService: IdentityUserMappingService,
        private masterBasicSetup: MasterBasicSetupService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private router: Router,
        private route: ActivatedRoute,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canUpdate = _perms.canUpdate;
        this.loadEmployeeNames();
        this.loadPersonalInfoMap();
        this.loadLeaveTypeNames();
        this.loadUnitNames();
        this.loadAppointmentNames();
        this.loadPrefixNames();
        this.loadRankNames();
        this.loadProfQualNames();
        const userId = this.sharedService.getCurrentUserId?.();
        if (userId) {
            this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
                next: (empId) => {
                    if (empId) this.currentUserEmployeeId = empId;
                    this.load();
                }
            });
        }
    }

    loadEmployeeNames(): void {
        this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.employeeNameMap = {};
                this.employeeRabIdMap = {};
                this.employeeServiceIdMap = {};
                this.employeeUnitIdMap = {};
                this.employeeAppointmentIdMap = {};
                this.employeePrefixIdMap = {};
                this.employeeRankIdMap = {};
                arr.forEach((e: any) => {
                    const id = e.employeeID ?? e.EmployeeID;
                    const name = e.fullNameEN ?? e.FullNameEN ?? e.rabid ?? e.Rabid ?? String(id);
                    const rabId = e.rabid ?? e.rabId ?? e.rabID ?? e.RABID ?? null;
                    const serviceId = e.serviceId ?? e.ServiceId ?? null;
                    // FK CodeIds on the employee record — resolved to display labels via the maps loaded below.
                    const unitId = e.motherOrganization ?? e.MotherOrganization ?? null;
                    const appointmentId = e.appointment ?? e.Appointment ?? null;
                    const prefixId = e.prefix ?? e.Prefix ?? null;
                    const rankId = e.rank ?? e.Rank ?? null;
                    if (id != null) {
                        this.employeeNameMap[id] = name;
                        if (rabId != null && rabId !== '') this.employeeRabIdMap[id] = String(rabId);
                        if (serviceId != null && serviceId !== '') this.employeeServiceIdMap[id] = String(serviceId);
                        if (unitId != null && unitId !== '') this.employeeUnitIdMap[id] = Number(unitId);
                        if (appointmentId != null && appointmentId !== '') this.employeeAppointmentIdMap[id] = Number(appointmentId);
                        if (prefixId != null && prefixId !== '') this.employeePrefixIdMap[id] = Number(prefixId);
                        if (rankId != null && rankId !== '') this.employeeRankIdMap[id] = Number(rankId);
                    }
                });
            }
        });
    }

    /** Loads PersonalInfo for all employees so we can attach professionalQualification (which lives on PersonalInfo, not EmployeeInfo). */
    loadPersonalInfoMap(): void {
        this.http.get<any[]>(`${environment.apis.core}/PersonalInfo/GetAll`).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.employeeProfQualIdMap = {};
                arr.forEach((p: any) => {
                    const empId = p.employeeID ?? p.EmployeeID;
                    const profQualId = p.professionalQualification ?? p.ProfessionalQualification ?? null;
                    if (empId != null && profQualId != null && profQualId !== '') {
                        this.employeeProfQualIdMap[empId] = Number(profQualId);
                    }
                });
            },
            error: () => { /* PersonalInfo is best-effort — applicant name still renders without profQual */ }
        });
    }

    loadPrefixNames(): void {
        this.masterBasicSetup.getAllByType('Prefix').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.prefixNameMap = {};
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    const name = c.codeValueEN ?? c.CodeValueEN ?? null;
                    if (id != null && name != null) this.prefixNameMap[id] = name;
                });
            }
        });
    }

    loadRankNames(): void {
        this.masterBasicSetup.getAllByType('MotherOrgRank').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.rankNameMap = {};
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    const name = c.codeValueEN ?? c.CodeValueEN ?? null;
                    if (id != null && name != null) this.rankNameMap[id] = name;
                });
            }
        });
    }

    loadProfQualNames(): void {
        this.commonCodeService.getAllActiveCommonCodesType('ProfessionalQualification').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.profQualNameMap = {};
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    const name = c.codeValueEN ?? c.CodeValueEN ?? null;
                    if (id != null && name != null) this.profQualNameMap[id] = name;
                });
            }
        });
    }

    loadUnitNames(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.unitNameMap = {};
                arr.forEach((o: any) => {
                    const id = o.orgId ?? o.OrgId;
                    const name = o.orgNameEN ?? o.OrgNameEN ?? String(id);
                    if (id != null) this.unitNameMap[id] = name;
                });
            }
        });
    }

    loadAppointmentNames(): void {
        this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.appointmentNameMap = {};
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    const name = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                    if (id != null) this.appointmentNameMap[id] = name;
                });
            }
        });
    }

    loadLeaveTypeNames(): void {
        this.masterBasicSetup.getAllByType('LeaveType').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.leaveTypeNameMap = {};
                this.leaveTypeOptions = [];
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    const name = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                    if (id != null) {
                        this.leaveTypeNameMap[id] = name;
                        this.leaveTypeOptions.push({ label: name, value: id });
                    }
                });
            }
        });
    }

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

    search(): void {
        this.pageNumber = 1;
        this.firstRow = 0;
        this.load();
    }

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

    load(): void {
        if (this.currentUserEmployeeId <= 0) {
            this.loading = false;
            return;
        }
        this.loading = true;
        const filter = this.buildFilterParams();
        this.leaveAppService
            .getByStatusForUserPaginated(2, this.currentUserEmployeeId, 'actionRequiredByMe', this.pageNumber, this.pageSize, filter)
            .subscribe({
                next: (res) => {
                    this.currentList = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: () => {
                    this.currentList = [];
                    this.totalRecords = 0;
                    this.loading = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load list.' });
                }
            });
    }

    /**
     * Server-side (lazy) pagination handler from <p-table [lazy]="true">. Fires when the user
     * changes page or rows-per-page. Skipped before the user is resolved — the initial load is
     * kicked off from the identity callback in ngOnInit so we don't issue a request before we
     * know who the current user is.
     */
    onLazyLoad(event: TableLazyLoadEvent): void {
        if (this.currentUserEmployeeId <= 0) return;
        const first = event.first ?? 0;
        const rows = event.rows ?? this.pageSize;
        // Skip no-op echoes (e.g. when load() reassigns currentList and the table re-fires lazy with the same paging).
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
        return n;
    }

    /**
     * Returns the formatted applicant display: `${prefix}-${serviceId} ${rank} ${name}, ${profQual}`
     * e.g. "BA-1234 Lt Col Md Akbar Ali, psc". Each component is included only when available so
     * partial data (e.g. missing rank or profQual) still renders cleanly.
     */
    getApplicantName(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const name = this.employeeNameMap[empId];
        if (name == null) return String(empId);
        const prefixId = this.employeePrefixIdMap[empId];
        const rankId = this.employeeRankIdMap[empId];
        const profQualId = this.employeeProfQualIdMap[empId];
        const serviceId = this.employeeServiceIdMap[empId];
        const prefix = prefixId != null ? this.prefixNameMap[prefixId] : null;
        const rank = rankId != null ? this.rankNameMap[rankId] : null;
        const profQual = profQualId != null ? this.profQualNameMap[profQualId] : null;

        const idPart = prefix && serviceId ? `${prefix}-${serviceId}` : (serviceId ?? '');
        const left = [idPart, rank, name].filter((p) => !!p).join(' ');
        return profQual ? `${left}, ${profQual}` : left;
    }

    getApplicantRabId(empId: number | null | undefined): string {
        if (empId == null) return '-';
        return this.employeeRabIdMap[empId] ?? '-';
    }
    getApplicantServiceId(empId: number | null | undefined): string {
        if (empId == null) return '-';
        return this.employeeServiceIdMap[empId] ?? '-';
    }
    getApplicantUnit(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const orgId = this.employeeUnitIdMap[empId];
        if (orgId == null) return '-';
        return this.unitNameMap[orgId] ?? String(orgId);
    }
    getApplicantAppointment(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const codeId = this.employeeAppointmentIdMap[empId];
        if (codeId == null) return '-';
        return this.appointmentNameMap[codeId] ?? String(codeId);
    }
    getLeaveTypeName(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '-';
        return this.leaveTypeNameMap[leaveTypeId] ?? String(leaveTypeId);
    }

    formatDate(d: string | null | undefined): string {
        if (!d) return '-';
        try {
            const dt = new Date(d);
            return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return d;
        }
    }

    getTotalDays(fromDate: string | null | undefined, toDate: string | null | undefined): string {
        if (!fromDate || !toDate) return '-';
        try {
            const from = new Date(fromDate);
            const to = new Date(toDate);
            if (isNaN(from.getTime()) || isNaN(to.getTime())) return '-';
            return String(Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        } catch {
            return '-';
        }
    }
}
