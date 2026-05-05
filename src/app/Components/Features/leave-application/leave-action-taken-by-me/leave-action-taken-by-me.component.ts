import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationFilterParams } from '@/services/leave-application.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { LeaveListLookupsService } from '../shared/leave-list-lookups.service';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { PaginatorModule } from 'primeng/paginator';
import type { PaginatorState } from 'primeng/types/paginator';

type DecisionSection = 'all' | 'approved' | 'declined';

/**
 * Standalone "Action Taken by Me" view — applications where the current user has acted as a
 * recommender (approved or declined) or as the final approver. The Approval Status dropdown
 * filters by the user's *own* decision, not the application's overall status, via
 * myDecisionFilter on the backend. typeFilter is fixed to 'actionTakenByMe'.
 */
@Component({
    selector: 'app-leave-action-taken-by-me',
    standalone: true,
    imports: [
        CommonModule, FormsModule, TableModule, ButtonModule, InputTextModule,
        SelectModule, DatePickerModule, FlexibleDateDirective, ToastModule, PaginatorModule, RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-action-taken-by-me.component.html',
    styleUrls: ['./leave-action-taken-by-me.component.scss', '../leave-my-applications/leave-my-applications.component.scss', '../../employee-reports/report-theme-common.scss']
})
export class LeaveActionTakenByMeComponent implements OnInit {
    readonly TYPE_FILTER = 'actionTakenByMe';

    section: DecisionSection = 'all';
    sectionOptions: { label: string; value: DecisionSection }[] = [
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

    filterRabId = '';
    filterServiceId = '';
    filterLeaveTypeId: number | null = null;
    filterFromDate: Date | null = null;
    filterToDate: Date | null = null;
    filterOpen = true;

    constructor(
        private sharedService: SharedService,
        private leaveAppService: LeaveApplicationService,
        private identityMappingService: IdentityUserMappingService,
        private messageService: MessageService,
        private router: Router,
        private route: ActivatedRoute,
        public lookups: LeaveListLookupsService
    ) {}

    ngOnInit(): void {
        this.lookups.loadAll();
        const userId = this.sharedService.getCurrentUserId?.();
        if (userId) {
            this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
                next: (empId) => { if (empId) { this.currentUserEmployeeId = empId; this.load(); } }
            });
        }
    }

    private buildFilterParams(): LeaveApplicationFilterParams | undefined {
        const hasRab = (this.filterRabId || '').trim();
        const hasSvc = (this.filterServiceId || '').trim();
        const hasLt = this.filterLeaveTypeId != null && this.filterLeaveTypeId > 0;
        const hasFrom = !!this.filterFromDate;
        const hasTo = !!this.filterToDate;
        if (!hasRab && !hasSvc && !hasLt && !hasFrom && !hasTo) return undefined;
        const toDateStr = (d: Date | null) => d ? new Date(d).toISOString().slice(0, 10) : undefined;
        return {
            rabId: hasRab ? this.filterRabId.trim() : undefined,
            serviceId: hasSvc ? this.filterServiceId.trim() : undefined,
            leaveTypeId: hasLt ? this.filterLeaveTypeId! : undefined,
            fromDate: toDateStr(this.filterFromDate),
            toDate: toDateStr(this.filterToDate)
        };
    }

    search(): void { this.pageNumber = 1; this.load(); }
    clearFilter(): void {
        this.filterRabId = '';
        this.filterServiceId = '';
        this.filterLeaveTypeId = null;
        this.filterFromDate = null;
        this.filterToDate = null;
        this.pageNumber = 1;
        this.load();
    }
    onSectionChange(): void { this.pageNumber = 1; this.load(); }
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

    load(): void {
        if (this.currentUserEmployeeId <= 0) { this.loading = false; return; }
        this.loading = true;
        // For actionTakenByMe, the dropdown filters by the user's own decision rather than the
        // application's overall status. The backend handles this via myDecisionFilter.
        let myDecisionFilter: 'approved' | 'declined' | null = null;
        if (this.section === 'approved') myDecisionFilter = 'approved';
        else if (this.section === 'declined') myDecisionFilter = 'declined';

        const filter = this.buildFilterParams();
        this.leaveAppService.getByStatusForUserPaginated(
            null, this.currentUserEmployeeId, this.TYPE_FILTER,
            this.pageNumber, this.pageSize, filter, undefined, myDecisionFilter
        ).subscribe({
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

    onPageChange(event: PaginatorState): void {
        this.pageNumber = (event.page ?? 0) + 1;
        this.pageSize = event.rows ?? 10;
        this.load();
    }

    /** Overall app status (Pending/Approved/Declined). */
    getOverallStatus(row: LeaveApplicationModel): string {
        switch (row.leaveApplicationStatusId) {
            case 1: return 'Draft';
            case 2: return 'Pending';
            case 3: return 'Approved';
            case 4: return 'Declined';
            default: return '-';
        }
    }

    getOverallStatusClass(row: LeaveApplicationModel): string {
        switch (row.leaveApplicationStatusId) {
            case 2: return 'is-pending';
            case 3: return 'is-approved';
            case 4: return 'is-declined';
            default: return '';
        }
    }

    /**
     * What I personally did on this application — Recommended / Approved (final) / Declined.
     * Reads the row's recommender entries (backend attaches the current user's row) plus the
     * approve/decline columns.
     */
    getMyDecision(row: LeaveApplicationModel): { label: string; cssClass: string } {
        if (row.approvedByEmployeeId === this.currentUserEmployeeId) return { label: 'Approved', cssClass: 'is-approved' };
        if (row.declinedByEmployeeId === this.currentUserEmployeeId) return { label: 'Declined', cssClass: 'is-declined' };
        const myRec = (row.recommenders ?? []).find((r) => r.employeeId === this.currentUserEmployeeId);
        if (myRec) {
            if (myRec.status === 2) return { label: 'Recommended', cssClass: 'is-approved' };
            if (myRec.status === 3) return { label: 'Declined', cssClass: 'is-declined' };
            return { label: 'Pending', cssClass: 'is-pending' };
        }
        return { label: '-', cssClass: '' };
    }

    formatDate(d: string | null | undefined): string {
        if (!d) return '-';
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
}
