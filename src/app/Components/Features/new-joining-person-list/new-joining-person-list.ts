import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Table } from 'primeng/table';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { UserMenuService } from '@/services/user-menu.service';
import { PermanentPostingJoineeDetailService, PermanentPostingJoineeDetailModel } from '@/services/permanent-posting-joinee-detail.service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

enum JoineeFilter { All = 'all', Added = 'added', NotAdded = 'notAdded' }

@Component({
    selector: 'app-new-joining-person-list',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, SelectModule, Toast, ConfirmDialog, DatePickerModule, InputTextModule, IconFieldModule, InputIconModule, FlexibleDateDirective],
    providers: [MessageService, ConfirmationService],
    templateUrl: './new-joining-person-list.html',
    styleUrl: './new-joining-person-list.scss'
})
export class NewJoiningPersonListComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canUpdate = true;
    canDelete = true;

    records: PermanentPostingJoineeDetailModel[] = [];
    loading = false;

    filterDateFrom: Date | null = null;
    filterDateTo: Date | null = null;
    private _allRecords: PermanentPostingJoineeDetailModel[] = [];

    readonly JoineeFilter = JoineeFilter;
    joineeFilter = JoineeFilter.All;
    joineeFilterOptions = [
        { label: 'All Records',       value: JoineeFilter.All },
        { label: 'Entry Completed',   value: JoineeFilter.Added },
        { label: 'Entry Pending',     value: JoineeFilter.NotAdded },
    ];

    get filteredRecords(): PermanentPostingJoineeDetailModel[] {
        if (this.joineeFilter === JoineeFilter.Added)    return this.records.filter(r => r.isAddedInNewJoineeDataEntry);
        if (this.joineeFilter === JoineeFilter.NotAdded) return this.records.filter(r => !r.isAddedInNewJoineeDataEntry);
        return this.records;
    }

    constructor(
        private detailSvc: PermanentPostingJoineeDetailService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        const perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canUpdate = perms.canUpdate;
        this.canDelete = perms.canDelete;
        this.loadList();
    }

    loadList(): void {
        this.loading = true;
        this.detailSvc.getAll().subscribe({
            next: (d) => { this._allRecords = d; this.applyDateFilter(); this.loading = false; },
            error: () => { this.loading = false; }
        });
    }

    applyDateFilter(): void {
        let list = [...this._allRecords];
        if (this.filterDateFrom) {
            const from = new Date(this.filterDateFrom); from.setHours(0, 0, 0, 0);
            list = list.filter(r => r.joiningOrderDate && new Date(r.joiningOrderDate) >= from);
        }
        if (this.filterDateTo) {
            const to = new Date(this.filterDateTo); to.setHours(23, 59, 59, 999);
            list = list.filter(r => r.joiningOrderDate && new Date(r.joiningOrderDate) <= to);
        }
        this.records = list;
    }

    clearDateFilter(): void {
        this.filterDateFrom = null;
        this.filterDateTo = null;
        this.records = [...this._allRecords];
    }

    onGlobalFilter(table: Table, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    onEdit(row: PermanentPostingJoineeDetailModel): void {
        this._router.navigate(['/posting/permanent-posting-mo-record'], { queryParams: { joineeId: row.id } });
    }

    onDelete(row: PermanentPostingJoineeDetailModel): void {
        this.confirmationService.confirm({
            message: `Delete joinee record #${row.id}?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.detailSvc.delete(row.id).subscribe({
                    next: () => { this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Joinee record deleted.' }); this.loadList(); },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed.' })
                });
            }
        });
    }

    exportExcel(): void {
        const rows = this.filteredRecords.map((r, i) => ({
            '#': i + 1,
            'Parent Record ID': r.permanentPostingMORecordId ?? 'Standalone',
            'Service ID': r.serviceId ?? '-',
            'Name (Bangla)': r.nameBangla ?? '-',
            'Joining Order No': r.joiningOrderNo ?? '-',
            'Joining Date': this.formatDisplay(r.joiningOrderDate),
            'Possible Joining Date': this.formatDisplay(r.possibleJoiningDate),
            'Entry Added': r.isAddedInNewJoineeDataEntry ? 'Yes' : 'Pending'
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'New_Joining_Person_List.xlsx');
    }

    formatDisplay(v: string | null | undefined): string {
        if (!v) return '-';
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
}
