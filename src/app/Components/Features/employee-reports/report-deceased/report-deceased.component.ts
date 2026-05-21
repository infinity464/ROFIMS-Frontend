import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    DeceasedReportParams,
    DeceasedReportRow,
} from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-report-deceased',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, DatePickerModule, SelectModule, Toast],
    providers: [MessageService],
    templateUrl: './report-deceased.component.html',
    styleUrls: [
        '../report-theme.scss',
        '../report-card-mtr.scss',
        '../report-pending-inter-posting/report-pending-inter-posting.component.scss',
        './report-deceased.component.scss',
    ],
})
export class ReportDeceasedComponent implements OnInit {
    lang: Lang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    list: DeceasedReportRow[] = [];
    loading = false;
    searched = false;

    fromDate: Date | null = null;
    toDate: Date | null = null;

    orgOptions: { label: string; labelBn: string; value: number }[] = [];
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedOrgId: number | null = null;
    selectedRankId: number | null = null;

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

        this.loadMotherOrgs();
        // Auto-run with no filters so the user lands on a populated list.
        this.search();
    }

    private loadMotherOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs: MotherOrganizationModel[]) => {
                this.orgOptions = (orgs || []).map((o) => ({
                    label: o.orgNameEN || String(o.orgId),
                    labelBn: o.orgNameBN || o.orgNameEN || String(o.orgId),
                    value: o.orgId,
                }));
            },
            error: () => (this.orgOptions = []),
        });
    }

    /** Ranks are scoped per Mother Org (Army ranks differ from Navy ranks). */
    onOrgChange(): void {
        this.selectedRankId = null;
        this.rankOptions = [];
        if (this.selectedOrgId == null) return;
        this.commonCodeService
            .getAllActiveCommonCodesByOrgIdAndType(this.selectedOrgId, 'MotherOrgRank')
            .subscribe({
                next: (codes: CommonCodeModel[]) => {
                    this.rankOptions = (codes || []).map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                        value: c.codeId,
                    }));
                },
                error: () => (this.rankOptions = []),
            });
    }

    get reportTitle(): string {
        return this.lang === 'en'
            ? 'List of Death Members Serving in RAB'
            : 'র‍্যাবে কর্মরত মৃত সদস্যদের তালিকা';
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
        if (this.fromDate || this.toDate) {
            const fromLbl = this.lang === 'en' ? 'Date of Death From' : 'মৃত্যু তারিখ হইতে';
            const toLbl = this.lang === 'en' ? 'To' : 'পর্যন্ত';
            const f = this.fromDate ? this.formatDateLabel(this.fmtDate(this.fromDate)!) : '—';
            const t = this.toDate ? this.formatDateLabel(this.fmtDate(this.toDate)!) : '—';
            lines.push(`${fromLbl}: ${f}    ${toLbl}: ${t}`);
        }
        if (this.selectedOrgId != null) {
            const opt = this.orgOptions.find((o) => o.value === this.selectedOrgId);
            const lbl = this.lang === 'en' ? 'Mother Org' : 'মাতৃ সংস্থা';
            if (opt) lines.push(`${lbl}: ${this.lang === 'bn' ? opt.labelBn : opt.label}`);
        }
        if (this.selectedRankId != null) {
            const opt = this.rankOptions.find((o) => o.value === this.selectedRankId);
            const lbl = this.lang === 'en' ? 'Rank' : 'পদবী';
            if (opt) lines.push(`${lbl}: ${this.lang === 'bn' ? opt.labelBn : opt.label}`);
        }
        return lines;
    }

    get activeFilterCount(): number {
        let c = 0;
        if (this.fromDate) c++;
        if (this.toDate) c++;
        if (this.selectedOrgId != null) c++;
        if (this.selectedRankId != null) c++;
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
        this.fromDate = null;
        this.toDate = null;
        this.selectedOrgId = null;
        this.selectedRankId = null;
        this.rankOptions = [];
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    search(): void {
        this.pageNo = 1;
        this.searched = true;
        this.appliedFilterLines = this.buildFilterLines();
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
        this.loading = true;
        const params: DeceasedReportParams = {
            dateFrom: this.fmtDate(this.fromDate),
            dateTo: this.fmtDate(this.toDate),
            orgId: this.selectedOrgId,
            rankId: this.selectedRankId,
            pagination: { page_no: this.pageNo, row_per_page: this.rows },
        };
        this.reportService.getDeceasedReport(params).subscribe({
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
                    detail: err?.error?.message || 'Failed to load deceased members list.',
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
            ? ['Ser', 'Service ID', 'Rank', 'Corps', 'Trade', 'Name',
               'Date of Joining in RAB', 'Last Bn/Wg', 'Date of Death', 'Death Reason', 'Rmks']
            : ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', 'কোর', 'ট্রেড', 'নাম',
               'র‍্যাবে যোগদানের তারিখ', 'সর্বশেষ ইউনিট', 'মৃত্যুবরনের তারিখ', 'মৃত্যুর কারন', 'মন্তব্য'];
        const rows = this.list.map((row, i) => [
            this.displayNum(i + 1),
            this.displayNum(row.serviceId),
            this.codeValue(row.rank, row.rankBN),
            this.codeValue(row.corps, row.corpsBN),
            this.codeValue(row.trade, row.tradeBN),
            this.codeValue(row.name, row.nameBN),
            this.formatDateLabel(row.joiningInRab),
            this.codeValue(row.lastUnit, row.lastUnitBN),
            this.formatDateLabel(row.dateOfDeath),
            row.deceasedReason ?? '',
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
            filename: 'deceased-members',
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
