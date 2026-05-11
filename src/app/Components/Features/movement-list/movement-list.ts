import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import { MovementInfoService } from '@/services/movement-info.service';
import { MovementInfoModel } from '@/models/movement-info.model';
import { UserMenuService } from '@/services/user-menu.service';
import { MoveOrderType, MoveOrderTypeOptions, MovementType, MovementTypeOptions } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

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
export class MovementListComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private movementService = inject(MovementInfoService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private userMenuService = inject(UserMenuService);

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    /** Optional filter from route data: when set, only rows with this MoveOrderType are shown. */
    moveOrderTypeFilter: MoveOrderType | null = null;
    title = 'Movement List';

    loading = false;
    private _fullList: MovementInfoModel[] = [];
    rows: MovementInfoModel[] = [];

    /** Filters */
    searchText = '';
    filterDateFrom: Date | null = null;
    filterDateTo: Date | null = null;

    /** Pagination */
    first = 0;
    pageSize = 10;

    /** Maps for display */
    readonly moveOrderTypeMap = new Map<number, string>(MoveOrderTypeOptions.map((o) => [o.value, o.label]));
    readonly movementTypeMap = new Map<number, string>(MovementTypeOptions.map((o) => [o.value, o.label]));

    ngOnInit(): void {
        const perms = this.userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = perms.canInsert;
        this.canUpdate = perms.canUpdate;
        this.canDelete = perms.canDelete;

        // Read route data — undefined = no filter (full list)
        const data = this.route.snapshot.data ?? {};
        this.moveOrderTypeFilter = (data['moveOrderType'] as MoveOrderType | undefined) ?? null;
        const titleSuffix =
            this.moveOrderTypeFilter != null ? this.moveOrderTypeMap.get(this.moveOrderTypeFilter) : null;
        this.title = titleSuffix ? `Movement List — ${titleSuffix}` : 'Movement List';

        this.loadList();
    }

    loadList() {
        this.loading = true;
        this.movementService.getAll().subscribe({
            next: (data) => {
                const all = Array.isArray(data) ? data : [];
                this._fullList = this.moveOrderTypeFilter != null
                    ? all.filter((r) => r.moveOrderType === this.moveOrderTypeFilter)
                    : all;
                this.applyFilters();
                this.loading = false;
            },
            error: (err) => {
                console.error('Failed to load movements', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load movements'
                });
                this._fullList = [];
                this.rows = [];
                this.loading = false;
            }
        });
    }

    applyFilters() {
        const term = (this.searchText || '').toLowerCase().trim();
        const from = this.filterDateFrom ? this.toIsoDate(this.filterDateFrom) : null;
        const to = this.filterDateTo ? this.toIsoDate(this.filterDateTo) : null;

        this.rows = this._fullList.filter((r) => {
            // Text search: Letter No, Move Order Type label, Movement Type label
            if (term) {
                const haystack = [
                    r.letterNo ?? '',
                    this.moveOrderTypeMap.get(r.moveOrderType as number) ?? '',
                    this.movementTypeMap.get(r.movementType as number) ?? ''
                ].join(' ').toLowerCase();
                if (!haystack.includes(term)) return false;
            }
            // Date range — match against letterDate, fallback to createdDate
            const rowDateStr = (r.letterDate ?? r.createdDate ?? '').slice(0, 10);
            if (from && rowDateStr && rowDateStr < from) return false;
            if (to && rowDateStr && rowDateStr > to) return false;
            return true;
        });
        this.first = 0;
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchText = target.value || '';
        this.applyFilters();
    }

    onDateFilterChange() {
        this.applyFilters();
    }

    clearFilters() {
        this.searchText = '';
        this.filterDateFrom = null;
        this.filterDateTo = null;
        this.applyFilters();
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

    onCreate() {
        this.router.navigate(['/movement-info']);
    }

    onView(row: MovementInfoModel) {
        this.router.navigate(['/movement-info'], { queryParams: { id: row.movementId, mode: 'view' } });
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
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.message || 'Failed to delete movement'
                        });
                    }
                });
            }
        });
    }

    private toIsoDate(d: Date): string {
        const yyyy = d.getFullYear();
        const mm = `${d.getMonth() + 1}`.padStart(2, '0');
        const dd = `${d.getDate()}`.padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
}
