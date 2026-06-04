import { Component, OnInit, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { UserMenuService } from '@/services/user-menu.service';
import { PermanentPostingMORecordService, PermanentPostingMORecordModel } from '@/services/permanent-posting-mo-record.service';
import { ExportService, ReportConfig } from '@/services/export.service';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-posted-out-person-list',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, Toast, ConfirmDialog, DatePickerModule, InputTextModule, IconFieldModule, InputIconModule],
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
    totalRecords = 0;
    loading = false;
    rows = 10;
    first = 0;

    filterDateFrom: Date | null = null;
    filterDateTo: Date | null = null;
    searchText = '';
    private _searchTimer: any;

    exportDropdownOpen = false;
    exporting = false;

    constructor(
        private recordSvc: PermanentPostingMORecordService,
        private exportService: ExportService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        const perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canUpdate = perms.canUpdate;
        this.canDelete = perms.canDelete;
    }

    loadRecords(event?: TableLazyLoadEvent): void {
        this.loading = true;
        const page = event ? Math.floor((event.first ?? 0) / (event.rows ?? this.rows)) + 1 : 1;
        const rowPerPage = event?.rows ?? this.rows;
        if (event) {
            this.first = event.first ?? 0;
            this.rows = event.rows ?? this.rows;
        }

        const dateFrom = this.filterDateFrom ? this.formatDateParam(this.filterDateFrom) : undefined;
        const dateTo = this.filterDateTo ? this.formatDateParam(this.filterDateTo) : undefined;

        this.recordSvc.getAllPaginated(page, rowPerPage, this.searchText || undefined, dateFrom, dateTo).subscribe({
            next: (res) => {
                this.records = res.datalist ?? [];
                this.totalRecords = res.pages?.Rows ?? 0;
                this.loading = false;
            },
            error: () => { this.records = []; this.totalRecords = 0; this.loading = false; }
        });
    }

    onSearch(event: Event): void {
        this.searchText = (event.target as HTMLInputElement).value;
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
            this.first = 0;
            this.loadRecords();
        }, 400);
    }

    applyDateFilter(): void {
        this.first = 0;
        this.loadRecords();
    }

    clearDateFilter(): void {
        this.filterDateFrom = null;
        this.filterDateTo = null;
        this.first = 0;
        this.loadRecords();
    }

    onEdit(row: PermanentPostingMORecordModel): void {
        this._router.navigate(['/posting/permanent-posting-mo-record'], { queryParams: { id: row.id } });
    }

    onDelete(row: PermanentPostingMORecordModel): void {
        this.confirmationService.confirm({
            message: `Delete record #${row.id}? If a linked New Joining Person record exists, it will also be removed.`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.recordSvc.delete(row.id).subscribe({
                    next: (res: any) => {
                        if (res?.statusCode === 403) {
                            this.messageService.add({ severity: 'warn', summary: 'Cannot Delete', detail: res.description ?? 'This person is an Ex-Member. Ex-Member records cannot be removed.' });
                            return;
                        }
                        if (res?.statusCode !== 200) {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res?.description ?? 'Delete failed.' });
                            return;
                        }
                        this.messageService.add({ severity: 'success', summary: 'Deleted', detail: res.description ?? 'Record deleted.' });
                        this.loadRecords();
                    },
                    error: (err: any) => {
                        const body = err?.error;
                        if (body?.statusCode === 403) {
                            this.messageService.add({ severity: 'warn', summary: 'Cannot Delete', detail: body.description ?? 'This person is an Ex-Member. Ex-Member records cannot be removed.' });
                        } else {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: body?.description ?? 'Delete failed.' });
                        }
                    }
                });
            }
        });
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    @HostListener('document:click')
    closeExportDropdown(): void {
        this.exportDropdownOpen = false;
    }

    private buildExportData(allRecords: PermanentPostingMORecordModel[]): { columns: string[]; rows: string[][] } {
        const columns = [
            '#', 'Name', 'Service ID', 'RAB ID',
            'Posting Unit', 'Rank', 'Corps', 'Trade', 'Is Reliever Assigned?',
        ];
        const rows = allRecords.map((r, i) => [
            String(i + 1),
            r.postedOutName ?? '-',
            this.prefixServiceId(r),
            r.postedOutRabId ?? '-',
            r.postingUnitName ?? '-',
            r.postedOutRank ?? '-',
            r.postedOutCorps ?? '-',
            r.postedOutTrade ?? '-',
            this.yesNo(r.isReliever),
        ]);
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        this.exporting = true;
        try {
            const allRecords = await firstValueFrom(this.recordSvc.getAll());
            const { columns, rows } = this.buildExportData(allRecords);
            const now = new Date();
            const generated = now.toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: true, timeZoneName: 'short',
            });
            const config: ReportConfig = {
                title: 'Posted Out Person List',
                lang: 'en',
                columns,
                rows,
                showPageNumbers: true,
                filename: 'Posted_Out_Person_List',
                filterLines: [`Generated: ${generated}`],
            };
            if (type === 'pdf') {
                await this.exportService.generatePDF(config);
            } else if (type === 'print') {
                this.exportService.exportPDF(config);
            } else if (type === 'word') {
                await this.exportService.exportWord(config);
            } else {
                this.exportService.exportExcel(config);
            }
        } finally { this.exporting = false; }
    }

    prefixServiceId(r: PermanentPostingMORecordModel): string {
        return r.postedOutPrefix && r.serviceId ? `${r.postedOutPrefix}-${r.serviceId}` : r.serviceId ?? '-';
    }

    yesNo(v: boolean | null): string {
        return v === true ? 'Yes' : v === false ? 'No' : '-';
    }

    private formatDateParam(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
