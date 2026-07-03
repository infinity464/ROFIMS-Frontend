import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Table, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { PostingService } from '@/services/posting.service';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { UserMenuService } from '@/services/user-menu.service';
import { PresentStatusInfoService } from '@/services/present-status-info.service';
import { CommonCodeService } from '@/services/common-code-service';
import { PendingPostingJoiningDto } from '@/models/posting.model';
import { MoveOrderType, PresentStatusType } from '@/models/enums';

/**
 * Transfer-unit replica of the "Pending List for Joining — Inter Posting" page.
 * Shown to the RECEIVING unit: a member becomes actionable only once a movement
 * order has been generated for them (row.movementId). Until then the action
 * column shows "Movement Order is not generated yet" and the row can't be selected.
 * Mirrors pending-joining-transfer-unit (the New Posting variant).
 */
@Component({
    selector: 'app-pending-inter-joining-transfer-unit',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        TooltipModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        SelectModule,
        Toast,
        DialogModule,
        DatePickerModule, FlexibleDateDirective,
        TextareaModule
    ],
    providers: [MessageService],
    templateUrl: './pending-inter-joining-transfer-unit.html',
    styleUrl: '../pending-posting-joining/pending-posting-joining.scss'
})
export class PendingInterJoiningTransferUnitComponent implements OnInit {
    allRows: PendingPostingJoiningDto[] = [];
    rows: PendingPostingJoiningDto[] = [];
    loading = false;

    // Filter options
    noteSheetOptions: { label: string; value: string | null }[] = [];
    motherOrgOptions: { label: string; value: string | null }[] = [];
    postingOrderOptions: { label: string; value: string | null }[] = [];
    transferUnitOptions: { label: string; value: string | null }[] = [];

    // Selected filters
    noteSheetFilter: string | null = null;
    motherOrgFilter: string | null = null;
    postingOrderFilter: string | null = null;
    transferUnitFilter: string | null = null;

    // Selection + receive dialog
    selectedRows: PendingPostingJoiningDto[] = [];
    showReceiveDialog = false;
    joiningDate: Date | null = null;
    remarks = '';
    saving = false;

    // Absent dialog — marks the member Absent (PresentStatusInfo) WITHOUT removing
    // them from this pending list. Receiving later deactivates it (+ BackFromAbsent).
    showAbsentDialog = false;
    absentTarget: PendingPostingJoiningDto | null = null;
    absentDate: Date | null = null;
    absentTypeId: number | null = null;
    absentReport = '';
    absentInquiryReport = '';
    absentSaving = false;
    absentTypeOptions: { label: string; value: number }[] = [];

    currentUser = '';
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    constructor(
        private postingService: PostingService,
        private router: Router,
        private messageService: MessageService,
        private sharedService: SharedService,
        private _userMenuService: UserMenuService,
        private presentStatusService: PresentStatusInfoService,
        private commonCodeService: CommonCodeService
    ) {}

    ngOnInit(): void {
        // Until the menu row is seeded and roles are granted, this route has no
        // permission row — fall back to the HQ inter pending page's permissions
        // (receiving is the same operation, just unit-side).
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        const _fallback = this._userMenuService.getPermissionsByRoute('/posting/pending-inter-posting-joining');
        this.canInsert = _perms.canInsert || _fallback.canInsert;
        this.canUpdate = _perms.canUpdate || _fallback.canUpdate;
        this.canDelete = _perms.canDelete || _fallback.canDelete;
        this.currentUser = this.sharedService.getCurrentUser();
        this.loadPending();
        this.loadAbsentTypes();
    }

    private loadAbsentTypes(): void {
        this.commonCodeService.getAllActiveCommonCodesType('AbsentType').subscribe({
            next: (data: any[]) =>
                (this.absentTypeOptions = (data || []).map(d => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err: any) => console.error('Failed to load absent types', err)
        });
    }

    loadPending(): void {
        this.loading = true;
        this.selectedRows = [];
        this.postingService.getPendingPostingJoining('InterPosting').subscribe({
            next: (data) => {
                this.allRows = data ?? [];
                this.buildFilterOptions();
                this.applyFilters();
                this.loading = false;
            },
            error: (err: any) => {
                this.loading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load pending inter-posting joining list.'
                });
            }
        });
    }

    /** True once a movement order has been generated for the member. */
    hasMovement(row: PendingPostingJoiningDto): boolean {
        return row.movementId != null;
    }

    /** Keep only movement-generated rows in the selection — the header
     *  checkbox sweeps in disabled rows too. */
    onSelectionChange(rows: PendingPostingJoiningDto[]): void {
        this.selectedRows = (rows ?? []).filter(r => this.hasMovement(r));
    }

    private buildFilterOptions(): void {
        const unique = (arr: (string | null | undefined)[]) =>
            [...new Set(arr.filter((v): v is string => !!v))].sort();

        this.noteSheetOptions = [
            { label: 'All NoteSheets', value: null },
            ...unique(this.allRows.map(r => r.noteSheetNo)).map(v => ({ label: v, value: v }))
        ];
        this.motherOrgOptions = [
            { label: 'All Mother Organizations', value: null },
            ...unique(this.allRows.map(r => r.motherOrganization)).map(v => ({ label: v, value: v }))
        ];
        this.postingOrderOptions = [
            { label: 'All Posting Orders', value: null },
            ...unique(this.allRows.map(r => r.postingOrderNo)).map(v => ({ label: v, value: v }))
        ];
        this.transferUnitOptions = [
            { label: 'All Transfer Units', value: null },
            ...unique(this.allRows.map(r => r.transferRabUnitName)).map(v => ({ label: v, value: v }))
        ];
    }

    applyFilters(): void {
        this.rows = this.allRows.filter(r => {
            if (this.noteSheetFilter && r.noteSheetNo !== this.noteSheetFilter) return false;
            if (this.motherOrgFilter && r.motherOrganization !== this.motherOrgFilter) return false;
            if (this.postingOrderFilter && r.postingOrderNo !== this.postingOrderFilter) return false;
            if (this.transferUnitFilter && r.transferRabUnitName !== this.transferUnitFilter) return false;
            return true;
        });
        // Drop selections that are no longer visible after filter change.
        const visibleIds = new Set(this.rows.map(r => r.postingReceiveId));
        this.selectedRows = this.selectedRows.filter(r => visibleIds.has(r.postingReceiveId));
    }

    clearFilters(): void {
        this.noteSheetFilter = null;
        this.motherOrgFilter = null;
        this.postingOrderFilter = null;
        this.transferUnitFilter = null;
        this.applyFilters();
    }

    /** Open the receive dialog for the checked rows (movement-generated only). */
    openReceiveDialog(): void {
        // Header checkbox can sweep in rows without a movement — drop them.
        this.selectedRows = this.selectedRows.filter(r => this.hasMovement(r));
        if (!this.selectedRows.length) {
            this.messageService.add({
                severity: 'warn',
                summary: 'No selection',
                detail: 'Please select at least one row (with a generated movement order) to receive.'
            });
            return;
        }
        this.joiningDate = new Date();
        this.remarks = '';
        this.showReceiveDialog = true;
    }

    /** Per-row receive — behaves like Receive Posting Order for that single member. */
    openReceiveDialogFor(row: PendingPostingJoiningDto): void {
        if (!this.hasMovement(row)) return;
        this.selectedRows = [row];
        this.openReceiveDialog();
    }

    closeReceiveDialog(): void {
        this.showReceiveDialog = false;
    }

    confirmReceive(): void {
        if (this.saving) return;
        if (!this.canUpdate) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (!this.selectedRows.length) return;
        if (!this.joiningDate) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Missing date',
                detail: 'Please select a joining date.'
            });
            return;
        }

        this.saving = true;
        const joiningDateStr = this.formatDateForApi(this.joiningDate);
        const items = this.selectedRows.map(r => ({
            postingReceiveId: r.postingReceiveId,
            joiningDate: joiningDateStr,
            remarks: this.remarks || null
        }));

        this.postingService.receivePostingMembers(items, this.currentUser).subscribe({
            next: (res) => {
                this.saving = false;
                if (res.statusCode === 200) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: res.description
                    });
                    this.showReceiveDialog = false;
                    this.loadPending();
                } else {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: res.description
                    });
                }
            },
            error: (err: any) => {
                this.saving = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to receive members.'
                });
            }
        });
    }

    // ── Absent ────────────────────────────────────────────────────────────

    /** Open the Absent form for one member (like emp-present-status's Absent
     *  option, minus Profile Shift — always false here). */
    openAbsentDialog(row: PendingPostingJoiningDto): void {
        if (row.hasActiveAbsent) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Already Absent',
                detail: 'This member already has an active Absent status.'
            });
            return;
        }
        this.absentTarget = row;
        this.absentDate = new Date();
        this.absentTypeId = null;
        this.absentReport = '';
        this.absentInquiryReport = '';
        this.showAbsentDialog = true;
    }

    closeAbsentDialog(): void {
        if (this.absentSaving) return;
        this.showAbsentDialog = false;
        this.absentTarget = null;
    }

    confirmAbsent(): void {
        if (this.absentSaving || !this.absentTarget) return;
        if (!this.absentDate || !this.absentTypeId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: 'Absent date and absent type are required.'
            });
            return;
        }

        const now = new Date().toISOString();
        const payload: any = {
            EmployeeID: this.absentTarget.employeeId,
            PresentStatusType: PresentStatusType.Absent,
            Dated: this.formatDateForApi(this.absentDate),
            ProfileShift: false, // hidden on this page — never shifts the profile
            TransferredUnitID: null,
            MotherOrgTransferredUnitID: null,
            DateOfRelease: null,
            ReduceFromRABStrength: null,
            RTUCause: null,
            AbsentTypeID: this.absentTypeId,
            AbsentReport: this.absentReport || null,
            InquiryReport: this.absentInquiryReport || null,
            IncidentDetails: null,
            DeceasedPlace: null,
            DeceasedReason: null,
            ArrestedPresentStatusID: null,
            BackFromArrestedReason: null,
            BackFromArrestedDate: null,
            CourtOrderReference: null,
            AbsentPresentStatusID: null,
            BackFromAbsentReason: null,
            BackFromAbsentDate: null,
            SupportingDocFilesReferences: null,
            IsActive: true,
            CreatedBy: this.currentUser,
            CreatedDate: now,
            LastUpdatedBy: this.currentUser,
            Lastupdate: now
        };

        this.absentSaving = true;
        this.presentStatusService.save(payload).subscribe({
            next: () => {
                this.absentSaving = false;
                this.showAbsentDialog = false;
                this.absentTarget = null;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Member marked as Absent. They remain on the pending list until received.'
                });
                this.loadPending();
            },
            error: (err: any) => {
                this.absentSaving = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || err?.error?.Description || 'Failed to save Absent status.'
                });
            }
        });
    }

    private formatDateForApi(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /** Open the preview of the posting order the row belongs to. */
    openPostingOrder(row: PendingPostingJoiningDto): void {
        if (row.postingOrderMasterId) {
            this.router.navigate(['/posting/posting-order-preview'], {
                queryParams: { id: row.postingOrderMasterId }
            });
        }
    }

    /** Open the generated movement order's preview (route depends on order type). */
    openMovement(row: PendingPostingJoiningDto): void {
        if (row.movementId == null) return;
        switch (row.moveOrderType) {
            case MoveOrderType.CC:
                this.router.navigate(['/movement-preview/cc'], { queryParams: { id: row.movementId } });
                return;
            case MoveOrderType.MO:
                this.router.navigate(['/movement-preview/mo'], { queryParams: { id: row.movementId } });
                return;
            case MoveOrderType.Article47Handover:
                this.router.navigate(['/movement-preview/article-47-handover'], { queryParams: { id: row.movementId } });
                return;
            case MoveOrderType.Article47Takeover:
                this.router.navigate(['/movement-preview/article-47-takeover'], { queryParams: { id: row.movementId } });
                return;
            default:
                this.router.navigate(['/movement-info'], { queryParams: { id: row.movementId, mode: 'view' } });
                return;
        }
    }

    /** Open employee profile in a new tab. */
    openProfile(row: PendingPostingJoiningDto): void {
        if (row.employeeId) {
            window.open(`/members/profile/${row.employeeId}`, '_blank');
        }
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

    onGlobalFilter(table: Table, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }
}
