import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { encodeOrderId } from '@/shared/utils/order-id-codec';
import { Table, TableModule, TableLazyLoadEvent } from 'primeng/table';
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
import { PendingPostingJoiningDto } from '@/models/posting.model';
import { MoveOrderTypeOptions, MoveOrderType } from '@/models/enums';

@Component({
    selector: 'app-pending-inter-posting-joining',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, InputTextModule, IconFieldModule, InputIconModule, SelectModule, Toast, DialogModule, DatePickerModule, FlexibleDateDirective, TextareaModule],
    providers: [MessageService],
    templateUrl: './pending-inter-posting-joining.html',
    styleUrl: './pending-inter-posting-joining.scss'
})
export class PendingInterPostingJoiningComponent implements OnInit {
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

    // Movement dialog — pick an Order type, then redirect to the Movement form
    // carrying the selected employees (same flow as pending-posting-joining).
    showMovementDialog = false;
    // Article 47 (Takeover) is not a valid order type from this screen.
    moveOrderTypeOptions = MoveOrderTypeOptions.filter((o) => o.value !== MoveOrderType.Article47Takeover);
    movementOrderType: number | null = null;

    // Cancel joining dialog
    showCancelDialog = false;
    cancelTarget: PendingPostingJoiningDto | null = null;
    cancelRemarks = '';
    cancelling = false;

    // Cancelled-joinings list (collapsible section below the pending table).
    // Loaded on demand (Load button) with server-side pagination so it stays fast.
    cancelledRows: PendingPostingJoiningDto[] = [];
    cancelledLoading = false;
    cancelledLoaded = false;
    showCancelled = false;
    cancelledTotal = 0;
    cancelledFirst = 0;
    cancelledPageSize = 10;

    currentUser = '';
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    constructor(
        private postingService: PostingService,
        private router: Router,
        private messageService: MessageService,
        private sharedService: SharedService,
        private _userMenuService: UserMenuService
    ) {}

    /** True once a movement order has already been generated for the member.
     *  Such a member can still be *received*, but a second movement can't be
     *  generated — so only the Movement action is gated on this, not Receive. */
    hasMovement(row: PendingPostingJoiningDto): boolean {
        return row.movementId != null;
    }

    /** Selected rows still eligible for a movement order (none generated yet).
     *  The Movement button/dialog operate on this subset; Receive uses the full
     *  selection. */
    get movableRows(): PendingPostingJoiningDto[] {
        return this.selectedRows.filter((r) => !this.hasMovement(r));
    }

    onSelectionChange(rows: PendingPostingJoiningDto[]): void {
        this.selectedRows = rows ?? [];
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.currentUser = this.sharedService.getCurrentUser();
        this.loadPending();
    }

    loadPending(): void {
        this.loading = true;
        this.selectedRows = [];
        // HQ pending page: show a member only when their "From" unit (current active
        // placement) is in the caller's scope — i.e. members leaving their unit.
        this.postingService.getPendingPostingJoining('InterPosting', false, 'Source').subscribe({
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

    /** Reveal the cancelled-joinings section. The lazy table then fires onLazyLoad
     *  to fetch the first page from the server. */
    loadCancelled(): void {
        this.showCancelled = true;
        this.cancelledLoaded = true;
    }

    /** Server-side page fetch for the cancelled-joinings table (PrimeNG lazy load). */
    loadCancelledLazy(event: TableLazyLoadEvent): void {
        const size = event.rows ?? this.cancelledPageSize;
        const first = event.first ?? 0;
        this.cancelledPageSize = size;
        this.cancelledFirst = first;
        const pageNo = Math.floor(first / size) + 1;

        this.cancelledLoading = true;
        this.postingService.getCancelledPostingJoiningPaged('InterPosting', pageNo, size).subscribe({
            next: (res) => {
                this.cancelledRows = res?.datalist ?? [];
                this.cancelledTotal = res?.pages?.Rows ?? 0;
                this.cancelledLoading = false;
            },
            error: () => {
                this.cancelledLoading = false;
            }
        });
    }

    /** Re-fetch the current cancelled page (e.g. after a new cancellation). */
    reloadCancelled(): void {
        if (!this.cancelledLoaded) return;
        this.loadCancelledLazy({ first: this.cancelledFirst, rows: this.cancelledPageSize } as TableLazyLoadEvent);
    }

    /** Expand/collapse the cancelled-joinings section. */
    toggleCancelled(): void {
        this.showCancelled = !this.showCancelled;
    }

    private buildFilterOptions(): void {
        const unique = (arr: (string | null | undefined)[]) => [...new Set(arr.filter((v): v is string => !!v))].sort();

        this.noteSheetOptions = [{ label: 'All NoteSheets', value: null }, ...unique(this.allRows.map((r) => r.noteSheetNo)).map((v) => ({ label: v, value: v }))];
        this.motherOrgOptions = [{ label: 'All Mother Organizations', value: null }, ...unique(this.allRows.map((r) => r.motherOrganization)).map((v) => ({ label: v, value: v }))];
        this.postingOrderOptions = [{ label: 'All Posting Orders', value: null }, ...unique(this.allRows.map((r) => r.postingOrderNo)).map((v) => ({ label: v, value: v }))];
        this.transferUnitOptions = [{ label: 'All Transfer Units', value: null }, ...unique(this.allRows.map((r) => r.transferRabUnitName)).map((v) => ({ label: v, value: v }))];
    }

    applyFilters(): void {
        this.rows = this.allRows.filter((r) => {
            if (this.noteSheetFilter && r.noteSheetNo !== this.noteSheetFilter) return false;
            if (this.motherOrgFilter && r.motherOrganization !== this.motherOrgFilter) return false;
            if (this.postingOrderFilter && r.postingOrderNo !== this.postingOrderFilter) return false;
            if (this.transferUnitFilter && r.transferRabUnitName !== this.transferUnitFilter) return false;
            return true;
        });
        // Drop selections that are no longer visible after filter change.
        const visibleIds = new Set(this.rows.map((r) => r.postingReceiveId));
        this.selectedRows = this.selectedRows.filter((r) => visibleIds.has(r.postingReceiveId));
    }

    clearFilters(): void {
        this.noteSheetFilter = null;
        this.motherOrgFilter = null;
        this.postingOrderFilter = null;
        this.transferUnitFilter = null;
        this.applyFilters();
    }

    /** Open the receive dialog to mark selected rows as received. */
    openReceiveDialog(): void {
        if (!this.selectedRows.length) {
            this.messageService.add({
                severity: 'warn',
                summary: 'No selection',
                detail: 'Please select at least one row to receive.'
            });
            return;
        }
        this.joiningDate = new Date();
        this.remarks = '';
        this.showReceiveDialog = true;
    }

    closeReceiveDialog(): void {
        this.showReceiveDialog = false;
    }

    confirmReceive(): void {
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
        const items = this.selectedRows.map((r) => ({
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

    /** Open the movement dialog to choose an Order type for the selected members.
     *  Only members without an existing movement order are eligible. */
    openMovementDialog(): void {
        if (!this.movableRows.length) {
            this.messageService.add({
                severity: 'warn',
                summary: 'No eligible selection',
                detail: 'Please select at least one member without an existing movement order.'
            });
            return;
        }
        this.movementOrderType = null;
        this.showMovementDialog = true;
    }

    closeMovementDialog(): void {
        this.showMovementDialog = false;
    }

    /** Redirect to the Movement form with the chosen Order type and the
     *  selected employees pre-loaded (same handover as pending-posting-joining). */
    confirmMovement(): void {
        if (!this.movementOrderType) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Order type required',
                detail: 'Please select an order type.'
            });
            return;
        }
        // Operate only on members without an existing movement order.
        const movable = this.movableRows;
        // CC is a single combined record covering everyone, so all selected members
        // must share the same Transfer To unit, Posting Order and NoteSheet — the
        // movement stores ONE NoteSheetId / OfficeOrderId for the whole CC.
        if (this.movementOrderType === MoveOrderType.CC) {
            // Members may point at different SUB-units (wing/branch/…) of the same
            // RAB unit — that still qualifies for one CC, so compare the top-level
            // unit (what the Transfer To column shows), not the exact node id.
            const units = new Set(movable.map((r) => r.transferRabUnitName ?? r.transferRabUnitId));
            if (units.size > 1) {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Different Transfer To',
                    detail: 'For a CC order, all selected members must have the same Transfer To unit.'
                });
                return;
            }
            const orders = new Set(movable.map((r) => r.postingOrderMasterId));
            if (orders.size > 1) {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Different Posting Order',
                    detail: 'For a CC order, all selected members must belong to the same Posting Order.'
                });
                return;
            }
            const noteSheets = new Set(movable.map((r) => r.noteSheetId));
            if (noteSheets.size > 1) {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Different NoteSheet',
                    detail: 'For a CC order, all selected members must belong to the same NoteSheet.'
                });
                return;
            }
        }

        const rows = movable.filter((r) => r.employeeId != null);
        const employeeIds = rows.map((r) => r.employeeId as number);

        // Per-member destined unit + source references (current RAB unit,
        // notesheet id, posting order id) — stamped onto each movement record.
        const unitMap: Record<number, number> = {};
        // Per-member TOP-LEVEL unit name for display on the Movement form — the
        // ids in unitMap can be different sub-units of the same RAB unit.
        const unitNames: Record<number, string> = {};
        const postingContext: Record<number, { f: number | null; n: number | null; o: number | null }> = {};
        for (const r of rows) {
            const empId = r.employeeId as number;
            if (r.transferRabUnitId != null) unitMap[empId] = r.transferRabUnitId;
            if (r.transferRabUnitName) unitNames[empId] = r.transferRabUnitName;
            postingContext[empId] = {
                f: r.fromRabUnitId ?? null,
                n: r.noteSheetId ?? null,
                o: r.postingOrderMasterId ?? null
            };
        }

        this.showMovementDialog = false;
        this.router.navigate(['/movement-info'], {
            queryParams: {
                moveOrderType: this.movementOrderType,
                employeeIds: JSON.stringify(employeeIds),
                unitMap: JSON.stringify(unitMap),
                unitNames: JSON.stringify(unitNames),
                postingContext: JSON.stringify(postingContext)
            }
        });
    }

    /** Toast shown when a user without delete permission clicks the (disabled) Cancel button. */
    notifyNoCancelPermission(): void {
        this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You did not have cancel permission' });
    }

    openCancelDialog(row: PendingPostingJoiningDto): void {
        if (!this.canDelete) {
            this.notifyNoCancelPermission();
            return;
        }
        this.cancelTarget = row;
        this.cancelRemarks = '';
        this.showCancelDialog = true;
    }

    closeCancelDialog(): void {
        if (this.cancelling) return;
        this.showCancelDialog = false;
        this.cancelTarget = null;
    }

    /** Cancel the member's joining. Sets JoinStatus = Cancel (member stays in the
     *  inter-posting notesheet AND the inter-posting order); employee status is reset
     *  to presently serving and IsSendingNotesheetStatus is cleared (handled server-side). */
    confirmCancel(): void {
        if (this.cancelling || !this.cancelTarget) return;
        // Re-check here too — the stored permissions live in local storage and the
        // dialog could be reached with a tampered flag.
        if (!this.canDelete) {
            this.notifyNoCancelPermission();
            return;
        }

        this.cancelling = true;
        this.postingService.cancelPostingJoining(this.cancelTarget.postingOrderMasterId, this.cancelTarget.employeeId, this.currentUser, this.cancelRemarks || null).subscribe({
            next: (res) => {
                this.cancelling = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: res.description });
                    this.showCancelDialog = false;
                    this.cancelTarget = null;
                    this.loadPending();
                    // Only refresh the cancelled list if the user has already loaded it.
                    if (this.cancelledLoaded) this.reloadCancelled();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description });
                }
            },
            error: (err: any) => {
                this.cancelling = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to cancel joining.' });
            }
        });
    }

    private formatDateForApi(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    openPostingOrder(row: PendingPostingJoiningDto): void {
        if (row.postingOrderMasterId) {
            this.router.navigate(['/posting/posting-order-preview'], {
                queryParams: { id: encodeOrderId(row.postingOrderMasterId) }
            });
        }
    }

    openProfile(row: PendingPostingJoiningDto): void {
        if (row.employeeId) {
            window.open(`/members/profile/${row.employeeId}`, '_blank');
        }
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        const d = new Date(value);
        return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    onGlobalFilter(table: Table, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }
}
