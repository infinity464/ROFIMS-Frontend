import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import { MovementInfoService, MovementInfoFilterRequest } from '@/services/movement-info.service';
import { MovementInfoModel } from '@/models/movement-info.model';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonCodeService } from '@/services/common-code-service';
import { CommonCodeModel } from '@/models/common-code-model';
import { MoveOrderType, MoveOrderTypeOptions, MovementType, MovementTypeOptions } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { LeaveListLookupsService } from '@/Components/Features/leave-application/shared/leave-list-lookups.service';

@Component({
    selector: 'app-movement-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        TableModule,
        TagModule,
        TooltipModule,
        DatePickerModule,
        SelectModule,
        IconFieldModule,
        InputIconModule,
        Toast,
        ConfirmDialog,
        FlexibleDateDirective
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './movement-list.html',
    styleUrl: './movement-list.scss'
})
export class MovementListComponent implements OnInit, OnDestroy {
    private router = inject(Router);
    private movementService = inject(MovementInfoService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private userMenuService = inject(UserMenuService);
    private commonCodeService = inject(CommonCodeService);
    /** Shared employee/prefix/rank cache; getApplicantName() composes the BJO-62827 WO Md Mehedi Hasan string. */
    private empLookups = inject(LeaveListLookupsService);

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    title = 'Movement List';

    loading = false;
    rows: MovementInfoModel[] = [];
    totalRecords = 0;

    /** Filters */
    searchText = '';
    filterDateFrom: Date | null = null;
    filterDateTo: Date | null = null;
    selectedMoveOrderType: number | null = null;
    readonly moveOrderTypeOptions = MoveOrderTypeOptions;

    /** Pagination */
    first = 0;
    pageSize = 10;
    pageNumber = 1;

    /** Maps for display */
    readonly moveOrderTypeMap = new Map<number, string>(MoveOrderTypeOptions.map((o) => [o.value, o.label]));
    readonly movementTypeMap = new Map<number, string>(MovementTypeOptions.map((o) => [o.value, o.label]));
    /** MovementReason CommonCode id → display label (Bangla preferred). */
    readonly movementReasonMap = new Map<number, string>();

    private searchSubject = new Subject<string>();
    private searchSub?: Subscription;
    /** Initial p-table lazy event fires on first load; suppress our manual call to avoid a duplicate request. */
    private firstLazyLoadHandled = false;

    ngOnInit(): void {
        const perms = this.userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = perms.canInsert;
        this.canUpdate = perms.canUpdate;
        this.canDelete = perms.canDelete;

        this.commonCodeService.getAllActiveCommonCodesType('MovementReason').subscribe({
            next: (rows: CommonCodeModel[]) => {
                this.movementReasonMap.clear();
                for (const r of rows || []) {
                    if (r.codeId == null) continue;
                    this.movementReasonMap.set(r.codeId, r.codeValueBN || r.codeValueEN || '');
                }
            }
        });

        this.searchSub = this.searchSubject.pipe(debounceTime(300)).subscribe(() => this.reload());

        // Warm the employee/prefix/rank lookup caches; idempotent across the app session.
        this.empLookups.loadAll();
    }

    /** Renders the JSON-array employeeIds as one "BJO-62827 WO Md Mehedi Hasan" line per employee. */
    getEmployeesDisplay(employeeIdsJson: string | null | undefined): string {
        if (!employeeIdsJson) return '—';
        let ids: number[];
        try {
            const parsed = JSON.parse(employeeIdsJson);
            ids = Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
        } catch {
            return '—';
        }
        if (ids.length === 0) return '—';
        return ids.map((id) => this.empLookups.getApplicantName(id)).join('\n');
    }

    ngOnDestroy(): void {
        this.searchSub?.unsubscribe();
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        const rows = event.rows ?? this.pageSize;
        const first = event.first ?? 0;
        this.pageSize = rows;
        this.first = first;
        this.pageNumber = Math.floor(first / rows) + 1;
        this.firstLazyLoadHandled = true;
        this.loadList();
    }

    private buildFilter(): MovementInfoFilterRequest {
        const toDateOnly = (d: Date | null): string | null =>
            d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null;
        return {
            searchText: this.searchText?.trim() || undefined,
            moveOrderType: this.selectedMoveOrderType ?? undefined,
            dateFrom: toDateOnly(this.filterDateFrom),
            dateTo: toDateOnly(this.filterDateTo)
        };
    }

    private loadList(): void {
        this.loading = true;
        this.movementService
            .getPaginatedFiltered({
                pagination: { page_no: this.pageNumber, row_per_page: this.pageSize },
                filter: this.buildFilter()
            })
            .subscribe({
                next: (res) => {
                    this.rows = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    console.error('Failed to load movements', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load movements'
                    });
                    this.rows = [];
                    this.totalRecords = 0;
                    this.loading = false;
                }
            });
    }

    /** Reset to first page and reload — called when any filter changes. */
    private reload(): void {
        this.pageNumber = 1;
        this.first = 0;
        // If the table hasn't fired its initial lazy load yet, skip — it'll trigger the first request.
        if (!this.firstLazyLoadHandled) return;
        this.loadList();
    }

    onSearch(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.searchText = target.value || '';
        this.searchSubject.next(this.searchText);
    }

    onFilterChange(): void {
        this.reload();
    }

    clearFilters(): void {
        this.searchText = '';
        this.filterDateFrom = null;
        this.filterDateTo = null;
        this.selectedMoveOrderType = null;
        this.reload();
    }

    employeeCount(row: MovementInfoModel): number {
        if (!row.employeeIds) return 0;
        try {
            const arr = JSON.parse(row.employeeIds);
            return Array.isArray(arr) ? arr.length : 0;
        } catch {
            return 0;
        }
    }

    moveOrderTypeLabel(v: number | undefined | null): string {
        return v == null ? '-' : this.moveOrderTypeMap.get(v) ?? '-';
    }

    movementTypeLabel(v: number | undefined | null): string {
        return v == null ? '-' : this.movementTypeMap.get(v) ?? '-';
    }

    movementReasonLabel(v: number | null | undefined): string {
        return v == null ? '-' : this.movementReasonMap.get(v) ?? '-';
    }

    onCreate() {
        this.router.navigate(['/movement-info']);
    }

    onView(row: MovementInfoModel) {
        switch (row.moveOrderType) {
            case MoveOrderType.Article47Handover:
                this.router.navigate(['/movement-preview/article-47-handover'], { queryParams: { id: row.movementId } });
                return;
            case MoveOrderType.Article47Takeover:
                this.router.navigate(['/movement-preview/article-47-takeover'], { queryParams: { id: row.movementId } });
                return;
            case MoveOrderType.MO:
                this.router.navigate(['/movement-preview/mo'], { queryParams: { id: row.movementId } });
                return;
            case MoveOrderType.CC:
                this.router.navigate(['/movement-preview/cc'], { queryParams: { id: row.movementId } });
                return;
            default:
                this.router.navigate(['/movement-info'], { queryParams: { id: row.movementId, mode: 'view' } });
                return;
        }
    }

    onEdit(row: MovementInfoModel) {
        this.router.navigate(['/movement-info'], { queryParams: { id: row.movementId } });
    }

    onDelete(row: MovementInfoModel, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: `Delete movement #${row.movementId}${row.letterNo ? ` (${row.letterNo})` : ''}?`,
            header: 'Delete confirmation',
            icon: 'pi pi-info-circle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.movementService.delete(row.movementId).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Deleted',
                            detail: 'Movement deleted successfully'
                        });
                        this.loadList();
                    },
                    error: (err) => {
                        console.error('Delete failed', err);
                        // 409 = blocked because a return movement still references this one.
                        const blocked = err?.status === 409;
                        this.messageService.add({
                            severity: blocked ? 'warn' : 'error',
                            summary: blocked ? 'Cannot delete' : 'Error',
                            detail: err?.error?.description || err?.error?.message || 'Failed to delete movement'
                        });
                    }
                });
            }
        });
    }
}
