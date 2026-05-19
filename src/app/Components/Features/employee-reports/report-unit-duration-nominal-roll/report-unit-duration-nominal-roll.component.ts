import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { CommonCodeModel } from '@/models/common-code-model';
import type {
    UnitDurationNominalRollReportParams,
    UnitDurationNominalRollReportRow,
} from '@/models/report.model';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-report-unit-duration-nominal-roll',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, DatePickerModule, Toast],
    providers: [MessageService],
    templateUrl: './report-unit-duration-nominal-roll.component.html',
    styleUrls: [
        '../report-theme.scss',
        '../report-card-mtr.scss',
        '../report-pending-inter-posting/report-pending-inter-posting.component.scss',
        './report-unit-duration-nominal-roll.component.scss',
    ],
})
export class ReportUnitDurationNominalRollComponent implements OnInit {
    lang: Lang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    list: UnitDurationNominalRollReportRow[] = [];
    loading = false;
    searched = false;

    rabUnitOptions: { label: string; value: number }[] = [];
    selectedRabUnitId: number | null = null;

    fromDate: Date | null = null;
    toDate: Date | null = null;

    totalRecords = 0;
    pageNo = 1;
    rows = 20;
    rowsPerPageOptions = [20, 50, 100];

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    filterOpen = true;

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        const now = new Date();
        this.fromDate = new Date(now.getFullYear(), 0, 1);
        this.toDate = new Date(now.getFullYear(), 11, 31);

        this.loadRabUnits();
    }

    private loadRabUnits(): void {
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.rabUnitOptions = (codes || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }));
            },
            error: () => (this.rabUnitOptions = []),
        });
    }

    get reportTitle(): string {
        return this.lang === 'en'
            ? 'Unit & Specific Duration wise Nominal Roll'
            : 'ইউনিট এবং র‍্যাবে নির্দিষ্ট অবস্থান ভিত্তিক নামীয় তালিকা';
    }

    get dateLine(): string {
        const now = new Date();
        return this.lang === 'en'
            ? now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
            : now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    private fmtDate(d: Date | null | undefined): string | null {
        if (!d) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    private buildFilterLines(): string[] {
        const lines: string[] = [];
        if (this.selectedRabUnitId != null) {
            const opt = this.rabUnitOptions.find((o) => o.value === this.selectedRabUnitId);
            const lbl = this.lang === 'en' ? 'RAB Unit' : 'র‍্যাব ইউনিট';
            if (opt) lines.push(`${lbl}: ${opt.label}`);
        }
        if (this.fromDate || this.toDate) {
            const fromLbl = this.lang === 'en' ? 'From' : 'হইতে';
            const toLbl = this.lang === 'en' ? 'To' : 'পর্যন্ত';
            const f = this.fromDate ? this.formatDateLabel(this.fmtDate(this.fromDate)!) : '—';
            const t = this.toDate ? this.formatDateLabel(this.fmtDate(this.toDate)!) : '—';
            lines.push(`${fromLbl}: ${f}    ${toLbl}: ${t}`);
        }
        return lines;
    }

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedRabUnitId != null) c++;
        if (this.fromDate) c++;
        if (this.toDate) c++;
        return c;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    filterSubtitle(): string {
        if (this.activeFilterCount === 0) {
            return this.lang === 'en' ? 'Select fields to search on' : 'খোঁজার জন্য ক্ষেত্র নির্বাচন করুন';
        }
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return this.lang === 'en' ? `${n} filters applied` : `${n} ফিল্টার প্রয়োগকৃত`;
    }

    clearFilters(): void {
        this.selectedRabUnitId = null;
        this.fromDate = null;
        this.toDate = null;
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    search(): void {
        if (this.selectedRabUnitId == null) {
            this.messageService.add({
                severity: 'warn',
                summary: this.lang === 'en' ? 'RAB Unit required' : 'র‍্যাব ইউনিট প্রয়োজন',
                detail: this.lang === 'en'
                    ? 'Please select a RAB Unit to generate this nominal roll.'
                    : 'নামীয় তালিকা তৈরি করতে একটি র‍্যাব ইউনিট নির্বাচন করুন।',
            });
            return;
        }
        this.pageNo = 1;
        this.searched = true;
        this.loadPage();
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        if (!this.searched) return;
        const first = event?.first ?? 0;
        const take = event?.rows ?? this.rows;
        this.rows = take;
        this.pageNo = Math.floor(first / take) + 1;
        this.loadPage();
    }

    private loadPage(): void {
        this.appliedFilterLines = this.buildFilterLines();
        this.loading = true;
        const params: UnitDurationNominalRollReportParams = {
            rabUnitId: this.selectedRabUnitId,
            durationFrom: this.fmtDate(this.fromDate),
            durationTo: this.fmtDate(this.toDate),
            postingStatus: 'Servings',
            pagination: { page_no: this.pageNo, row_per_page: this.rows },
        };
        this.reportService.getUnitDurationNominalRollReport(params).subscribe({
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
                    detail: err?.error?.message || 'Failed to load nominal roll.',
                });
                this.loading = false;
            },
        });
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    getExportData(): { columns: string[]; rows: string[][] } {
        const columns = this.lang === 'en'
            ? ['Ser', 'Org Name', 'Service ID', 'Rank', 'Corps', 'Trade', 'Name', 'Present Unit', 'RAB Service From', 'RAB Service To', 'Rmks']
            : ['ক্রমিক', 'বাহিনীর নাম', 'ব্যক্তিগত নম্বর', 'পদবি', 'কোর', 'ট্রেড', 'নাম', 'বর্তমান ইউনিট', 'র‍্যাব স্থিতিকাল হইতে', 'র‍্যাব স্থিতিকাল পর্যন্ত', 'মন্তব্য'];
        const rows = this.list.map((row, i) => [
            this.displayNum(i + 1),
            this.codeValue(row.orgName, row.orgNameBN),
            this.displayNum(row.serviceId),
            this.codeValue(row.rank, row.rankBN),
            this.codeValue(row.corps, row.corpsBN),
            this.codeValue(row.trade, row.tradeBN),
            this.codeValue(row.name, row.nameBN),
            this.codeValue(row.presentUnit, row.presentUnitBN),
            this.formatDateLabel(row.rabServiceFrom),
            this.formatDateLabel(row.rabServiceTo),
            row.rmks ?? '',
        ]);
        return { columns, rows };
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
            landscape: true,
            filename: 'unit-duration-nominal-roll',
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

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
    }

    formatDateLabel(v: string | null | undefined): string {
        if (v == null || v === '') return '—';
        try {
            const d = new Date(v);
            if (isNaN(d.getTime())) return v;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = String(d.getFullYear());
            const s = `${day}-${month}-${year}`;
            return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
        } catch {
            return v;
        }
    }
}
