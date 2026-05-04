import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Location } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '@/Core/Environments/environment';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationFilterParams } from '@/services/leave-application.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { UserMenuService } from '@/services/user-menu.service';
import { EmpService } from '@/services/emp-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { PaginatorModule } from 'primeng/paginator';
import type { PaginatorState } from 'primeng/types/paginator';
import { RouterModule } from '@angular/router';

export type LeaveApplicationSection = 'all' | 'approved' | 'declined';

/** UI type filter for the list. (Pending applications live on /leave-application/pending-approval.) */
export type LeaveApplicationTypeFilter = 'myApplication' | 'applyForOther' | 'actionTakenByMe';

@Component({
    selector: 'app-leave-application-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        DatePickerModule, FlexibleDateDirective,
        DialogModule,
        TextareaModule,
        ToastModule,
        PaginatorModule,
        RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-application-list.component.html',
    styleUrls: ['./leave-application-list.component.scss', '../../employee-reports/report-theme-common.scss']
})
export class LeaveApplicationListComponent implements OnInit {
    @Input() sectionInput: LeaveApplicationSection | null = null;
    section: LeaveApplicationSection = 'all';
    typeFilter: LeaveApplicationTypeFilter = 'myApplication';
    /** Dropdown options for the inline status filter (replaces the old Approved/Declined tabs). */
    sectionOptions: { label: string; value: LeaveApplicationSection }[] = [
        { label: 'All', value: 'all' },
        { label: 'Approved', value: 'approved' },
        { label: 'Declined', value: 'declined' }
    ];

    currentList: LeaveApplicationModel[] = [];
    pageNumber = 1;
    pageSize = 10;
    totalRecords = 0;
    loading = false;
    currentUserEmployeeId = 0;

    showRemarkDialog = false;
    remarkAction: 'approve' | 'decline' | null = null;
    remarkText = '';
    selectedRow: LeaveApplicationModel | null = null;

    showPreviewModal = false;
    previewRow: LeaveApplicationModel | null = null;
    previewRemarkText = '';


    employeeNameMap: Record<number, string> = {};
    employeeRabIdMap: Record<number, string> = {};
    employeeServiceIdMap: Record<number, string> = {};
    leaveTypeNameMap: Record<number, string> = {};
    leaveTypeOptions: { label: string; value: number }[] = [];

    filterRabId = '';
    filterServiceId = '';
    filterLeaveTypeId: number | null = null;
    filterFromDate: Date | null = null;
    filterToDate: Date | null = null;

    /** Collapsible search panel open by default (like Ex-Members List). */
    filterOpen = true;
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    private api = `${environment.apis.core}/LeaveApplication`;

    statusLabels: Record<number, string> = {
        1: 'Draft',
        2: 'Pending',
        3: 'Approved',
        4: 'Declined'
    };

    constructor(
        private http: HttpClient,
        private sharedService: SharedService,
        private leaveAppService: LeaveApplicationService,
        private identityMappingService: IdentityUserMappingService,
        private empService: EmpService,
        private masterBasicSetup: MasterBasicSetupService,
        private messageService: MessageService,
        private router: Router,
        private route: ActivatedRoute,
        private location: Location,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadEmployeeNames();
        this.loadLeaveTypeNames();
        const userId = this.sharedService.getCurrentUserId?.();
        this.route.queryParams.subscribe((params) => {
            this.applySectionFromParams(params);
            this.loadSection();
        });
        if (userId) {
            this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
                next: (empId) => {
                    if (empId) this.currentUserEmployeeId = empId;
                    this.loadSection();
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
                arr.forEach((e: any) => {
                    const id = e.employeeID ?? e.EmployeeID;
                    const name = e.fullNameEN ?? e.FullNameEN ?? e.rabid ?? e.Rabid ?? String(id);
                    const rabId = e.rabid ?? e.rabId ?? e.rabID ?? e.RABID ?? null;
                    const serviceId = e.serviceId ?? e.ServiceId ?? null;
                    if (id != null) {
                        this.employeeNameMap[id] = name;
                        if (rabId != null && rabId !== '') this.employeeRabIdMap[id] = String(rabId);
                        if (serviceId != null && serviceId !== '') this.employeeServiceIdMap[id] = String(serviceId);
                    }
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

    buildFilterParams(): LeaveApplicationFilterParams | undefined {
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
        this.loadSection();
    }

    clearFilter(): void {
        this.filterRabId = '';
        this.filterServiceId = '';
        this.filterLeaveTypeId = null;
        this.filterFromDate = null;
        this.filterToDate = null;
        this.pageNumber = 1;
        this.loadSection();
    }

    getApplicantName(empId: number | null | undefined): string {
        if (empId == null) return '-';
        return this.employeeNameMap[empId] ?? String(empId);
    }

    getApplicantRabId(empId: number | null | undefined): string {
        if (empId == null) return '-';
        return this.employeeRabIdMap[empId] ?? '-';
    }

    getApplicantServiceId(empId: number | null | undefined): string {
        if (empId == null) return '-';
        return this.employeeServiceIdMap[empId] ?? '-';
    }

    getLeaveTypeName(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '-';
        return this.leaveTypeNameMap[leaveTypeId] ?? String(leaveTypeId);
    }

    openPreview(row: LeaveApplicationModel): void {
        this.previewRow = row;
        this.previewRemarkText = row.remarks ?? row.remark ?? '';
        this.showPreviewModal = true;
    }

    closePreview(): void {
        this.showPreviewModal = false;
        this.previewRow = null;
        this.previewRemarkText = '';
    }

    approveFromPreview(): void {
        if (!this.previewRow) return;
        const row = this.previewRow;
        this.leaveAppService.approve(row.leaveApplicationId, this.currentUserEmployeeId, this.previewRemarkText).subscribe({
            next: (res) => {
                const code = res.statusCode ?? res.StatusCode ?? 0;
                const msg = res.description ?? res.Description ?? '';
                if (code === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Action completed.' });
                    this.closePreview();
                    this.loadSection();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Notice', detail: msg || 'Action failed.' });
                }
            },
            error: (err) => {
                const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Request failed.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            }
        });
    }

    rejectFromPreview(): void {
        if (!this.previewRow) return;
        const row = this.previewRow;
        this.leaveAppService.decline(row.leaveApplicationId, this.currentUserEmployeeId, this.previewRemarkText).subscribe({
            next: (res) => {
                const code = res.statusCode ?? res.StatusCode ?? 0;
                const msg = res.description ?? res.Description ?? '';
                if (code === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Action completed.' });
                    this.closePreview();
                    this.loadSection();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Notice', detail: msg || 'Action failed.' });
                }
            },
            error: (err) => {
                const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Request failed.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            }
        });
    }

    private applySectionFromParams(params: Record<string, string | string[] | undefined>): void {
        const raw = params['section'] as string | undefined;
        // Legacy ?section=pending links route to the dedicated pending-approval page; map them away.
        if (raw === 'pending') {
            this.router.navigate(['/leave-application/pending-approval']);
            return;
        }
        // The Approval Status dropdown is a client-side filter and always defaults to 'all'.
        // We deliberately ignore any ?section= value carried over from an old URL so the page
        // always opens on All; the user can still narrow with the dropdown.
        if (this.sectionInput) this.section = this.sectionInput;
        const t = params['type'] as string | undefined;
        if (t === 'myApplication' || t === 'applyForOther' || t === 'actionTakenByMe') this.typeFilter = t;
    }

    loadSection(): void {
        if (this.currentUserEmployeeId <= 0) {
            this.loading = false;
            return;
        }
        this.loading = true;
        const onError = () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load list.' });
            this.loading = false;
        };
        // For Action-Taken-by-Me, the Approval Status dropdown filters by the user's *own* decision
        // (Approved/Declined as recommender or final approver) rather than by the application's
        // overall status. We pass that intent via myDecisionFilter and skip the status-id filter so
        // still-Pending applications that the user has already acted on still show up.
        let statusId: number | null;
        let additionalStatusIds: number[] | undefined;
        let myDecisionFilter: 'approved' | 'declined' | null = null;
        if (this.typeFilter === 'actionTakenByMe') {
            statusId = null;
            additionalStatusIds = undefined;
            if (this.section === 'approved') myDecisionFilter = 'approved';
            else if (this.section === 'declined') myDecisionFilter = 'declined';
        } else {
            // myApplication / applyForOther — dropdown filters by overall app status as before.
            statusId = this.section === 'all' ? null : (this.section === 'approved' ? 3 : 4);
            additionalStatusIds = this.section === 'all' ? [3, 4] : undefined;
        }
        const filter = this.buildFilterParams();
        const apiTypeFilter = this.typeFilter;
        this.leaveAppService.getByStatusForUserPaginated(statusId, this.currentUserEmployeeId, apiTypeFilter, this.pageNumber, this.pageSize, filter, additionalStatusIds, myDecisionFilter).subscribe({
            next: (res) => {
                this.currentList = res.datalist ?? [];
                this.totalRecords = res.pages?.rows ?? 0;
                this.loading = false;
            },
            error: (err: any) => {
                this.currentList = [];
                this.totalRecords = 0;
                onError();
            }
        });
    }

    statusLabel(row: LeaveApplicationModel): string {
        return this.statusLabels[row.leaveApplicationStatusId] ?? '-';
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
            const diffMs = to.getTime() - from.getTime();
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
            return String(days);
        } catch {
            return '-';
        }
    }

    /** Overall application status as a UI label. 1=Draft, 2=Pending, 3=Approved, 4=Declined. */
    getOverallStatus(row: LeaveApplicationModel): string {
        switch (row.leaveApplicationStatusId) {
            case 1: return 'Draft';
            case 2: return 'Pending';
            case 3: return 'Approved';
            case 4: return 'Declined';
            default: return '-';
        }
    }

    /** CSS class hint for the overall-status pill. */
    getOverallStatusClass(row: LeaveApplicationModel): string {
        switch (row.leaveApplicationStatusId) {
            case 2: return 'is-pending';
            case 3: return 'is-approved';
            case 4: return 'is-declined';
            default: return '';
        }
    }

    /**
     * Returns what the *current user* did on this application (independent of the overall status).
     * Looks at: final-approver columns, then the user's own recommender row attached by the backend.
     * Recommender status: 1=Pending, 2=Approved (=Recommended), 3=Declined.
     */
    getMyDecision(row: LeaveApplicationModel): { label: string; cssClass: string } {
        if (row.approvedByEmployeeId === this.currentUserEmployeeId) {
            return { label: 'Approved', cssClass: 'is-approved' };
        }
        if (row.declinedByEmployeeId === this.currentUserEmployeeId) {
            return { label: 'Declined', cssClass: 'is-declined' };
        }
        const myRec = (row.recommenders ?? []).find((r) => r.employeeId === this.currentUserEmployeeId);
        if (myRec) {
            if (myRec.status === 2) return { label: 'Recommended', cssClass: 'is-approved' };
            if (myRec.status === 3) return { label: 'Declined', cssClass: 'is-declined' };
            return { label: 'Pending', cssClass: 'is-pending' };
        }
        return { label: '-', cssClass: '' };
    }

    /** Fired when the user picks an Approval Status from the dropdown. Client-side filter — no URL state. */
    onSectionChange(): void {
        this.pageNumber = 1;
        this.loadSection();
    }

    goToSection(s: LeaveApplicationSection): void {
        this.section = s;
        this.pageNumber = 1;
        const tree = this.router.createUrlTree([], {
            relativeTo: this.route,
            queryParams: { section: s },
            queryParamsHandling: 'merge'
        });
        this.location.replaceState(this.router.serializeUrl(tree));
        this.loadSection();
    }

    onPageChange(event: PaginatorState): void {
        this.pageNumber = (event.page ?? 0) + 1;
        this.pageSize = event.rows ?? 10;
        this.loadSection();
    }

    openRemarkDialog(row: LeaveApplicationModel, action: 'approve' | 'decline'): void {
        this.selectedRow = row;
        this.remarkAction = action;
        this.remarkText = '';
        this.showRemarkDialog = true;
    }

    submitRemark(): void {
        if (!this.selectedRow || !this.remarkAction) return;
        const obs =
            this.remarkAction === 'approve'
                ? this.leaveAppService.approve(this.selectedRow.leaveApplicationId, this.currentUserEmployeeId, this.remarkText)
                : this.leaveAppService.decline(this.selectedRow.leaveApplicationId, this.currentUserEmployeeId, this.remarkText);
        obs.subscribe({
            next: (res) => {
                const code = res.statusCode ?? res.StatusCode ?? 0;
                const msg = res.description ?? res.Description ?? '';
                if (code === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Action completed.' });
                    this.showRemarkDialog = false;
                    this.selectedRow = null;
                    this.remarkAction = null;
                    this.loadSection();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Notice', detail: msg || 'Action failed.' });
                }
            },
            error: (err) => {
                const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Request failed.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            }
        });
    }

    /** Only the final approver can approve or decline. */
    isPendingForMe(row: LeaveApplicationModel): boolean {
        return row.leaveApplicationStatusId === 2 && row.finalApproverId === this.currentUserEmployeeId;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    /** Number of filter criteria currently set (for badge). */
    get activeFilterCount(): number {
        let n = 0;
        if ((this.filterRabId || '').trim()) n++;
        if ((this.filterServiceId || '').trim()) n++;
        if (this.filterLeaveTypeId != null) n++;
        if (this.filterFromDate != null) n++;
        if (this.filterToDate != null) n++;
        return n;
    }

    setTypeFilter(filter: LeaveApplicationTypeFilter): void {
        this.typeFilter = filter;
        this.pageNumber = 1;
        // Update URL without navigating so the page does not scroll to top
        const tree = this.router.createUrlTree([], {
            relativeTo: this.route,
            queryParams: { type: filter },
            queryParamsHandling: 'merge'
        });
        this.location.replaceState(this.router.serializeUrl(tree));
        this.loadSection();
    }
}
