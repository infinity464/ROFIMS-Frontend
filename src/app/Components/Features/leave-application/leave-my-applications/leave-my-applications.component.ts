import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationFilterParams } from '@/services/leave-application.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { LeaveListLookupsService } from '../shared/leave-list-lookups.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import type { TableLazyLoadEvent } from 'primeng/table';

type Section = 'all' | 'draft' | 'pending' | 'approved' | 'declined' | 'returned';

/**
 * Standalone "My Application Status" view — applications I am the applicant for or have any
 * role on. typeFilter is fixed to 'myApplication'. Dropdown narrows by overall status.
 */
@Component({
    selector: 'app-leave-my-applications',
    standalone: true,
    imports: [
        CommonModule, FormsModule, TableModule, ButtonModule, InputTextModule,
        SelectModule, DatePickerModule, FlexibleDateDirective, ToastModule,
        ConfirmDialogModule, RouterModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './leave-my-applications.component.html',
    // Order matters: report-theme provides the base, local SCSS overrides it to mirror the
    // leave-application/apply page's tokens (surface-card / surface-border / #10b981 accent,
    // 0.75rem radius, apply-form typography). Local must come LAST to win the cascade.
    styleUrls: ['../../employee-reports/report-theme-common.scss', './leave-my-applications.component.scss']
})
export class LeaveMyApplicationsComponent implements OnInit {
    readonly TYPE_FILTER = 'myApplication';

    section: Section = 'all';
    sectionOptions: { label: string; value: Section }[] = [
        { label: 'All', value: 'all' },
        { label: 'Draft', value: 'draft' },
        { label: 'Pending', value: 'pending' },
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
        private confirmationService: ConfirmationService,
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

    load(): void {
        if (this.currentUserEmployeeId <= 0) { this.loading = false; return; }
        this.loading = true;
        let statusId: number | null = null;
        let additionalStatusIds: number[] | undefined;
        let includeReturned = false;
        let onlyReturned = false;
        switch (this.section) {
            case 'draft': statusId = 1; break;
            case 'pending': statusId = 2; break;
            case 'approved': statusId = 3; break;
            case 'declined': statusId = 4; break;
            case 'returned': onlyReturned = true; break;
            case 'all':
            default:
                // No status narrowing — backend returns Draft, Pending, Approved, Declined.
                // Returned is status=1 with a non-empty return history, so it's already included.
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

    /**
     * PrimeNG Table fires this on initial render and every paginator interaction. We translate
     * `first` (offset) + `rows` (page size) into our 1-based pageNumber and reload server-side.
     */
    onLazyLoad(event: TableLazyLoadEvent): void {
        const rows = event.rows ?? this.pageSize;
        const first = event.first ?? 0;
        const newPage = Math.floor(first / rows) + 1;
        const sizeChanged = rows !== this.pageSize;
        const pageChanged = newPage !== this.pageNumber;
        if (!sizeChanged && !pageChanged) return;
        this.pageSize = rows;
        this.pageNumber = newPage;
        this.load();
    }

    /** Continuous serial number across pages: e.g. page 2 with size 10 starts at 11. */
    serialNumber(rowIndexOnPage: number): number {
        return (this.pageNumber - 1) * this.pageSize + rowIndexOnPage + 1;
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

    /**
     * Edit/Delete is allowed while the chain hasn't moved: Draft (status=1) or Pending (status=2)
     * where no recommender has acted (every row still status=1) and no final approver has stamped
     * a decision. Approved (3) / Declined (4) / Pending with any chain action are locked. Returned
     * applications are already status=1 so they fit naturally.
     */
    canEditOrDelete(row: LeaveApplicationModel): boolean {
        const s = row.leaveApplicationStatusId;
        if (s !== 1 && s !== 2) return false;
        const recs = row.recommenders ?? [];
        if (recs.some((r) => (r.status ?? 1) !== 1)) return false;
        if (row.approvedByEmployeeId || row.declinedByEmployeeId) return false;
        return true;
    }

    /**
     * Click handler for the row's Edit button. When the row is no longer editable (chain has
     * moved), surface a toast on this page instead of navigating to the apply form just to be
     * rejected there. Only navigates when the row is genuinely still editable.
     */
    tryEdit(row: LeaveApplicationModel): void {
        if (!this.canEditOrDelete(row)) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Cannot edit',
                detail: 'Edit disabled — this application is under processing.'
            });
            return;
        }
        this.router.navigate(['/leave-application/apply'], { queryParams: { id: row.leaveApplicationId } });
    }

    /** Confirms then deletes the application; refreshes the list on success. */
    deleteRow(row: LeaveApplicationModel): void {
        if (!this.canEditOrDelete(row)) return;
        this.confirmationService.confirm({
            header: 'Delete Application',
            message: 'Are you sure you want to delete this leave application? This action cannot be undone.',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Delete',
            rejectLabel: 'Cancel',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.leaveAppService.delete(row.leaveApplicationId).subscribe({
                    next: (res) => {
                        const code = res.statusCode ?? res.StatusCode ?? 0;
                        const msg = res.description ?? res.Description ?? '';
                        if (code === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Application deleted.' });
                            this.load();
                        } else {
                            this.messageService.add({ severity: 'warn', summary: 'Notice', detail: msg || 'Delete failed.' });
                        }
                    },
                    error: (err: any) => {
                        const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to delete.';
                        this.messageService.add({ severity: 'error', summary: 'Error', detail });
                    }
                });
            }
        });
    }
}
