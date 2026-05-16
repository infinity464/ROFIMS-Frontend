import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { Router } from '@angular/router';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { BloodGroupReportRow } from '@/models/report.model';

@Component({
    selector: 'app-report-blood-group',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, Toast],
    providers: [MessageService],
    templateUrl: './report-blood-group.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-blood-group.component.scss'],
})
export class ReportBloodGroupComponent implements OnInit, OnChanges {
    L = REPORT_LABELS;
    @Input() lang: ReportLang = 'en';
    /** Selected blood group label from the parent dropdown (e.g. "A+"). Used directly as the API filter. */
    @Input() commonCodeLabel = '';
    @Input() reportTypeLabel = '';
    @Input() postingStatus: string = 'Servings';
    @Input() statusLabel = '';
    @Input() statusLabelBn = '';
    @Output() langToggle = new EventEmitter<void>();

    list: BloodGroupReportRow[] = [];
    loading = false;
    first = 0;
    rows = 20;
    totalRecords = 0;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    constructor(
        private reportService: ReportService,
        private messageService: MessageService,
        private exportService: ExportService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    get reportTitle(): string {
        const sLabel = this.lang === 'bn' ? this.statusLabelBn : this.statusLabel;
        const statusSuffix = sLabel ? ` (${sLabel})` : '';
        if (this.reportTypeLabel && this.commonCodeLabel) {
            const suffix = this.lang === 'bn' ? 'প্রতিবেদন' : 'Report';
            return `${this.reportTypeLabel}: ${this.commonCodeLabel} ${suffix}${statusSuffix}`;
        }
        return this.L[this.lang]['report.title.bloodGroup'] + statusSuffix;
    }

    get dateLine(): string {
        const now = new Date();
        if (this.lang === 'en') {
            return now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        return now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    buildFilterLines(): string[] {
        const L = this.L[this.lang];
        const lines: string[] = [];
        if (this.commonCodeLabel) {
            lines.push(`${L['report.search.bloodGroup']}: ${this.commonCodeLabel}`);
        }
        return lines;
    }

    getExportData(): { columns: string[]; rows: string[][] } {
        const L = this.L[this.lang];
        const columns = [
            L['report.table.ser'],
            L['report.table.orgName'],
            L['report.table.serviceId'],
            L['report.table.rank'],
            L['report.table.corps'],
            L['report.table.trade'],
            L['report.table.name'],
            L['report.table.presentUnit'],
            L['report.table.bloodGroup'],
            L['report.table.rmks'],
        ];
        const rows = this.list.map((row) => [
            this.displayNum(row.ser),
            this.codeValue(row.orgName, row.orgNameBN),
            this.displayNum(row.serviceId),
            this.codeValue(row.rank, row.rankBN),
            this.codeValue(row.corps, row.corpsBN),
            this.codeValue(row.trade, row.tradeBN),
            this.codeValue(row.name, row.nameBN),
            this.codeValue(row.presentUnit, row.presentUnitBN),
            row.bloodGroup ?? '—',
            row.rmks ?? '—',
        ]);
        return { columns, rows };
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        const { columns, rows } = this.getExportData();
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            filterLines: this.appliedFilterLines,
        };
        if (type === 'pdf') {
            this.exporting = true;
            try { await this.exportService.generatePDF(config); } finally { this.exporting = false; }
        } else if (type === 'print') {
            this.exportService.exportPDF(config);
        } else if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.load();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['commonCodeLabel'] && !changes['commonCodeLabel'].firstChange) {
            this.first = 0;
            this.load();
        } else if (changes['postingStatus'] && !changes['postingStatus'].firstChange) {
            this.first = 0;
            this.load();
        }
        if (changes['lang']) {
            this.appliedFilterLines = this.buildFilterLines();
        }
    }

    onPage(event: { first: number; rows: number }): void {
        this.first = event.first;
        this.rows = event.rows;
        this.load();
    }

    load(): void {
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const page_no = Math.floor(this.first / this.rows) + 1;
        this.reportService
            .getBloodGroupReport({
                bloodGroup: this.commonCodeLabel || undefined,
                postingStatus: this.postingStatus || undefined,
                pagination: { page_no, row_per_page: this.rows },
            })
            .subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    console.error(err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load report',
                    });
                    this.loading = false;
                },
            });
    }

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
    }
}
