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

type Section = 'all' | 'approved' | 'declined' | 'returned';

/**
 * Standalone "Apply for Other" view — applications where the current user submitted on behalf
 * of someone else (appliedByEmployeeId = me, applicantEmployeeId != me). typeFilter is fixed
 * to 'applyForOther'.
 */
@Component({
    selector: 'app-leave-apply-for-other',
    standalone: true,
    imports: [
        CommonModule, FormsModule, TableModule, ButtonModule, InputTextModule,
        SelectModule, DatePickerModule, FlexibleDateDirective, ToastModule, PaginatorModule, RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-apply-for-other.component.html',
    // Order matters: report-theme-common is the base, leave-my-applications is the shared
    // "leave list" re-skin, local scss can add component-specific tweaks last.
    styleUrls: ['../../employee-reports/report-theme-common.scss', '../leave-my-applications/leave-my-applications.component.scss', './leave-apply-for-other.component.scss']
})
export class LeaveApplyForOtherComponent implements OnInit {
    readonly TYPE_FILTER = 'applyForOther';

    section: Section = 'all';
    sectionOptions: { label: string; value: Section }[] = [
        { label: 'All', value: 'all' },
        { label: 'Approved', value: 'approved' },
        { label: 'Declined', value: 'declined' },
        { label: 'Returned', value: 'returned' }
    ];

    currentList: LeaveApplicationModel[] = [];
    pageNumber = 1;
    pageSize = 10;
    totalRecords = 0;
    loading = false;
    currentUserEmployeeId = 0;

    filterRabId = '';
    filterServiceId = '';
    filterFromDate: Date | null = null;
    filterToDate: Date | null = null;
    filterOpen = true;

    canInsert = true;
    canUpdate = true;

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
        const hasFrom = !!this.filterFromDate;
        const hasTo = !!this.filterToDate;
        if (!hasRab && !hasSvc && !hasFrom && !hasTo) return undefined;
        const toDateStr = (d: Date | null) => d ? new Date(d).toISOString().slice(0, 10) : undefined;
        return {
            rabId: hasRab ? this.filterRabId.trim() : undefined,
            serviceId: hasSvc ? this.filterServiceId.trim() : undefined,
            fromDate: toDateStr(this.filterFromDate),
            toDate: toDateStr(this.filterToDate)
        };
    }

    search(): void { this.pageNumber = 1; this.load(); }
    clearFilter(): void {
        this.filterRabId = '';
        this.filterServiceId = '';
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
        if (this.filterFromDate != null) n++;
        if (this.filterToDate != null) n++;
        return n;
    }

    /** Continuous serial number across pages: e.g. page 2 with size 10 starts at 11. */
    serialNumber(rowIndexOnPage: number): number {
        return (this.pageNumber - 1) * this.pageSize + rowIndexOnPage + 1;
    }

    load(): void {
        if (this.currentUserEmployeeId <= 0) { this.loading = false; return; }
        this.loading = true;
        let statusId: number | null = null;
        let additionalStatusIds: number[] | undefined;
        let includeReturned = false;
        let onlyReturned = false;
        switch (this.section) {
            case 'approved': statusId = 3; break;
            case 'declined': statusId = 4; break;
            case 'returned': onlyReturned = true; break;
            case 'all':
            default:
                additionalStatusIds = [3, 4];
                includeReturned = true;
                break;
        }
        const filter = this.buildFilterParams();
        this.leaveAppService.getByStatusForUserPaginated(
            statusId, this.currentUserEmployeeId, this.TYPE_FILTER,
            this.pageNumber, this.pageSize, filter, additionalStatusIds, null, includeReturned, onlyReturned
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

    isReturnedRow(row: LeaveApplicationModel): boolean {
        return row.leaveApplicationStatusId === 1 && (row.returnHistory?.length ?? 0) > 0;
    }

    getOverallStatus(row: LeaveApplicationModel): string {
        if (this.isReturnedRow(row)) return 'Returned';
        switch (row.leaveApplicationStatusId) {
            case 1: return 'Draft';
            case 2: return 'Pending';
            case 3: return 'Approved';
            case 4: return 'Declined';
            default: return '-';
        }
    }

    getOverallStatusClass(row: LeaveApplicationModel): string {
        if (this.isReturnedRow(row)) return 'is-returned';
        switch (row.leaveApplicationStatusId) {
            case 2: return 'is-pending';
            case 3: return 'is-approved';
            case 4: return 'is-declined';
            default: return '';
        }
    }

    formatDate(d: string | null | undefined): string {
        if (!d) return '-';
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
}
