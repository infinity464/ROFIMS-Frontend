import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
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
import { PermanentPostingMORecordService, PermanentPostingMORecordModel } from '@/services/permanent-posting-mo-record.service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

@Component({
    selector: 'app-posted-out-person-list',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, Toast, ConfirmDialog, DatePickerModule, InputTextModule, IconFieldModule, InputIconModule, FlexibleDateDirective],
    providers: [MessageService, ConfirmationService],
    templateUrl: './posted-out-person-list.html',
    styleUrl: './posted-out-person-list.scss'
})
export class PostedOutPersonListComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canUpdate = true;
    canDelete = true;

    records: PermanentPostingMORecordModel[] = [];
    loading = false;

    filterDateFrom: Date | null = null;
    filterDateTo: Date | null = null;
    private _allRecords: PermanentPostingMORecordModel[] = [];

    constructor(
        private recordSvc: PermanentPostingMORecordService,
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
        this.recordSvc.getAll().subscribe({
            next: (d) => { this._allRecords = d; this.applyDateFilter(); this.loading = false; },
            error: () => { this.loading = false; }
        });
    }

    applyDateFilter(): void {
        let list = [...this._allRecords];
        if (this.filterDateFrom) {
            const from = new Date(this.filterDateFrom); from.setHours(0, 0, 0, 0);
            list = list.filter(r => r.postingOrderDate && new Date(r.postingOrderDate) >= from);
        }
        if (this.filterDateTo) {
            const to = new Date(this.filterDateTo); to.setHours(23, 59, 59, 999);
            list = list.filter(r => r.postingOrderDate && new Date(r.postingOrderDate) <= to);
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

    onEdit(row: PermanentPostingMORecordModel): void {
        this._router.navigate(['/posting/permanent-posting-mo-record'], { queryParams: { id: row.id } });
    }

    onDelete(row: PermanentPostingMORecordModel): void {
        this.confirmationService.confirm({
            message: `Delete record #${row.id}?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.recordSvc.delete(row.id).subscribe({
                    next: () => { this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Record deleted.' }); this.loadList(); },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed.' })
                });
            }
        });
    }

    exportExcel(): void {
        const rows = this.records.map((r, i) => ({
            '#': i + 1,
            'Record No': r.id,
            'Posted Out Emp. ID': r.postedOutEmployeeId ?? '-',
            'Posting Order No': r.postingOrderNo ?? '-',
            'PO Date': this.formatDisplay(r.postingOrderDate),
            'Possible Release': this.formatDisplay(r.possibleReleaseDate),
            'Reliever': r.isReliever === true ? 'Yes' : r.isReliever === false ? 'No' : '-',
            'Service ID': r.serviceId ?? '-',
            'NS Clearance': r.noteSheetClearance === true ? 'Yes' : r.noteSheetClearance === false ? 'No' : '-',
            'Clearance Given': r.clearanceGiven === true ? 'Yes' : r.clearanceGiven === false ? 'No' : '-',
            'Status': r.status ?? '-'
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'Posted_Out_Person_List.xlsx');
    }

    formatDisplay(v: string | null | undefined): string {
        if (!v) return '-';
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
}
