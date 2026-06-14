import { Component, OnInit, inject, HostListener } from '@angular/core';
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
import { UserMenuService } from '@/services/user-menu.service';
import { PermanentPostingMORecordService, PermanentPostingMORecordModel } from '@/services/permanent-posting-mo-record.service';
import { ExportService, ReportConfig } from '@/services/export.service';

@Component({
    selector: 'app-posted-out-person-list',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, SelectModule, Toast, ConfirmDialog, DatePickerModule, InputTextModule, IconFieldModule, InputIconModule],
    providers: [MessageService, ConfirmationService],
    templateUrl: './posted-out-person-list.html',
    styleUrl: './posted-out-person-list.scss'
})
export class PostedOutPersonListComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canUpdate = true;
    canDelete = true;

    /** Full dataset loaded once; filtering + pagination happen client-side. */
    allRecords: PermanentPostingMORecordModel[] = [];
    loading = false;
    rows = 10;

    // ── Filters ──────────────────────────────────────────────────
    searchText = '';
    filterRank: string | null = null;
    filterCorps: string | null = null;
    filterTrade: string | null = null;
    filterPostingUnitId: number | null = null;
    filterIsReliever: boolean | null = null;
    releaseDateFrom: Date | null = null;
    releaseDateTo: Date | null = null;
    private _searchTimer: any;

    // Dropdown options (built from loaded data)
    rankOptions: { label: string; value: string }[] = [];
    corpsOptions: { label: string; value: string }[] = [];
    tradeOptions: { label: string; value: string }[] = [];
    postingUnitOptions: { label: string; value: number }[] = [];
    relieverOptions = [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
    ];

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
        this.loadRecords();
    }

    loadRecords(): void {
        this.loading = true;
        this.recordSvc.getAll().subscribe({
            next: (d) => {
                this.allRecords = d ?? [];
                this.buildFilterOptions();
                this.loading = false;
            },
            error: () => { this.allRecords = []; this.loading = false; }
        });
    }

    private buildFilterOptions(): void {
        const distinct = (vals: (string | null)[]) =>
            Array.from(new Set(vals.filter((v): v is string => !!v && v.trim() !== '')))
                .sort((a, b) => a.localeCompare(b))
                .map(v => ({ label: v, value: v }));

        this.rankOptions = distinct(this.allRecords.map(r => r.postedOutRank));
        this.corpsOptions = distinct(this.allRecords.map(r => r.postedOutCorps));
        this.tradeOptions = distinct(this.allRecords.map(r => r.postedOutTrade));

        const unitMap = new Map<number, string>();
        for (const r of this.allRecords) {
            if (r.postingUnitId != null && r.postingUnitName) unitMap.set(r.postingUnitId, r.postingUnitName);
        }
        this.postingUnitOptions = Array.from(unitMap, ([value, label]) => ({ label, value }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    /** Records after all active filters are applied. */
    get filteredRecords(): PermanentPostingMORecordModel[] {
        const term = this.searchText.trim().toLowerCase();
        const from = this.releaseDateFrom ? this.dateOnly(this.releaseDateFrom) : null;
        const to = this.releaseDateTo ? this.dateOnly(this.releaseDateTo) : null;

        return this.allRecords.filter(r => {
            if (this.filterRank && r.postedOutRank !== this.filterRank) return false;
            if (this.filterCorps && r.postedOutCorps !== this.filterCorps) return false;
            if (this.filterTrade && r.postedOutTrade !== this.filterTrade) return false;
            if (this.filterPostingUnitId != null && r.postingUnitId !== this.filterPostingUnitId) return false;
            if (this.filterIsReliever != null && r.isReliever !== this.filterIsReliever) return false;

            if (from || to) {
                if (!r.possibleReleaseDate) return false;
                const d = this.dateOnly(new Date(r.possibleReleaseDate));
                if (from && d < from) return false;
                if (to && d > to) return false;
            }

            if (term) {
                const hay = [
                    r.postedOutName, r.serviceId, r.postedOutRabId, r.postingUnitName,
                    r.postedOutRank, r.postedOutCorps, r.postedOutTrade, r.postedOutPrefix
                ].filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(term)) return false;
            }
            return true;
        });
    }

    onSearch(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => { this.searchText = value; }, 300);
    }

    clearFilters(): void {
        this.searchText = '';
        this.filterRank = null;
        this.filterCorps = null;
        this.filterTrade = null;
        this.filterPostingUnitId = null;
        this.filterIsReliever = null;
        this.releaseDateFrom = null;
        this.releaseDateTo = null;
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

    private buildExportData(records: PermanentPostingMORecordModel[]): { columns: string[]; rows: string[][] } {
        const columns = [
            '#', 'Service ID', 'Rank', 'Corps', 'Trade', 'Name',
            'RAB ID', 'Posting Unit', 'Is Reliever Assigned?',
        ];
        const rows = records.map((r, i) => [
            String(i + 1),
            this.prefixServiceId(r),
            r.postedOutRank ?? '-',
            r.postedOutCorps ?? '-',
            r.postedOutTrade ?? '-',
            r.postedOutName ?? '-',
            r.postedOutRabId ?? '-',
            r.postingUnitName ?? '-',
            this.yesNo(r.isReliever),
        ]);
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        this.exporting = true;
        try {
            const { columns, rows } = this.buildExportData(this.filteredRecords);
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

    private dateOnly(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
