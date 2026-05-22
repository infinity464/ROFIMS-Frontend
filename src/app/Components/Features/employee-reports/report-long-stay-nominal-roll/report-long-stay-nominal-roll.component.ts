import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    LongStayNominalRollReportParams,
    LongStayNominalRollReportRow,
    ReportAccessibleScope,
} from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import { unitScopeLine, memberTypeScopeLine, buildScopeExportLines } from '../report-scope.helper';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-report-long-stay-nominal-roll',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, InputNumberModule, SelectModule, Toast],
    providers: [MessageService],
    templateUrl: './report-long-stay-nominal-roll.component.html',
    styleUrls: [
        '../report-theme.scss',
        '../report-card-mtr.scss',
        '../report-pending-inter-posting/report-pending-inter-posting.component.scss',
        './report-long-stay-nominal-roll.component.scss',
    ],
})
export class ReportLongStayNominalRollComponent implements OnInit {
    lang: Lang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    list: LongStayNominalRollReportRow[] = [];
    loading = false;
    searched = false;

    minDuration = 2;
    unit: 'Years' | 'Months' = 'Years';
    unitOptions: { label: string; value: 'Years' | 'Months' }[] = [
        { label: 'Years', value: 'Years' },
        { label: 'Months', value: 'Months' },
    ];

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

    /** Caller's access-scope snapshot. Unit chip above the date, member-type below. */
    accessibleScope: ReportAccessibleScope | null = null;
    get unitScopeLine(): string | null { return unitScopeLine(this.accessibleScope, this.lang); }
    get memberTypeScopeLine(): string | null { return memberTypeScopeLine(this.accessibleScope, this.lang); }

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

        // Fetch scope eagerly so the chip shows under the title before any search.
        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => { this.accessibleScope = scope ?? null; },
            error: () => { /* silent — chip stays hidden on failure */ },
        });

        this.loadMotherOrgs();
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
        const n = this.minDuration;
        if (this.lang === 'en') {
            const noun = this.unit === 'Years'
                ? (n === 1 ? 'Year' : 'Years')
                : (n === 1 ? 'Month' : 'Months');
            return `Nominal Roll of Stay in RAB Above ${n} ${noun}`;
        }
        const bnNoun = this.unit === 'Years' ? 'বছর' : 'মাস';
        return `র‍্যাবে ${BanglaNumerals.toBangla(String(n))} ${bnNoun}ের অধিক অবস্থানরত সদস্যের নামীয় তালিকা`;
    }

    get dateLine(): string {
        const now = new Date();
        return this.lang === 'en'
            ? now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
            : now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    private buildFilterLines(): string[] {
        const lines: string[] = [];
        const lbl = this.lang === 'en' ? 'Minimum Stay' : 'সর্বনিম্ন অবস্থান';
        const n = this.minDuration;
        let value: string;
        if (this.lang === 'en') {
            const noun = this.unit === 'Years'
                ? (n === 1 ? 'year' : 'years')
                : (n === 1 ? 'month' : 'months');
            value = `${n} ${noun}`;
        } else {
            const bnNoun = this.unit === 'Years' ? 'বছর' : 'মাস';
            value = `${BanglaNumerals.toBangla(String(n))} ${bnNoun}`;
        }
        lines.push(`${lbl}: ${value}`);
        if (this.selectedOrgId != null) {
            const opt = this.orgOptions.find((o) => o.value === this.selectedOrgId);
            const orgLbl = this.lang === 'en' ? 'Mother Org' : 'মাতৃ সংস্থা';
            if (opt) lines.push(`${orgLbl}: ${this.lang === 'bn' ? opt.labelBn : opt.label}`);
        }
        if (this.selectedRankId != null) {
            const opt = this.rankOptions.find((o) => o.value === this.selectedRankId);
            const rkLbl = this.lang === 'en' ? 'Rank' : 'পদবী';
            if (opt) lines.push(`${rkLbl}: ${this.lang === 'bn' ? opt.labelBn : opt.label}`);
        }
        return lines;
    }

    get activeFilterCount(): number {
        let c = this.minDuration && this.minDuration > 0 ? 1 : 0;
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
        return this.lang === 'en' ? `${n} filter applied` : `${n} ফিল্টার প্রয়োগকৃত`;
    }

    clearFilters(): void {
        this.minDuration = 2;
        this.unit = 'Years';
        this.selectedOrgId = null;
        this.selectedRankId = null;
        this.rankOptions = [];
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    search(): void {
        if (!this.minDuration || this.minDuration <= 0) {
            this.messageService.add({
                severity: 'warn',
                summary: this.lang === 'en' ? 'Minimum duration required' : 'সর্বনিম্ন সময়কাল প্রয়োজন',
                detail: this.lang === 'en'
                    ? 'Enter a positive number.'
                    : 'একটি ধনাত্মক সংখ্যা প্রবেশ করান।',
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
        const params: LongStayNominalRollReportParams = {
            minDuration: this.minDuration,
            unit: this.unit,
            orgId: this.selectedOrgId,
            rankId: this.selectedRankId,
            postingStatus: 'Servings',
            pagination: { page_no: this.pageNo, row_per_page: this.rows },
        };
        this.reportService.getLongStayNominalRollReport(params).subscribe({
            next: (res) => {
                this.list = res.datalist ?? [];
                this.totalRecords = res.pages?.rows ?? 0;
                this.accessibleScope = res.accessibleScope ?? null;
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
            ? ['Ser', 'Service ID', 'Rank', 'Name', 'Mother Unit', 'Date of Joining in RAB',
               'Duration of Stay', 'Battalion', 'Posted-out Unit',
               'Posting Order Date', 'Reliever Joining Date', 'Rmks']
            : ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবী', 'নাম', 'মাতৃ ইউনিট', 'র‍্যাবে যোগদানের তারিখ',
               'অবস্থানের মেয়াদকাল', 'ব্যাটালিয়ন', 'বদলিকৃত ইউনিট',
               'প্রেষনাদেশ বাতিলের তারিখ', 'প্রতিস্থাপক যোগদানের তারিখ', 'মন্তব্য'];
        const rows = this.list.map((row, i) => [
            this.displayNum(i + 1),
            this.displayNum(row.serviceId),
            this.codeValue(row.rank, row.rankBN),
            this.codeValue(row.name, row.nameBN),
            this.codeValue(row.motherUnit, row.motherUnitBN),
            this.formatDateLabel(row.joiningInRab),
            this.formatDuration(row.durationOfStay),
            this.codeValue(row.presentUnit, row.presentUnitBN),
            this.codeValue(row.postedOutUnit, row.postedOutUnitBN),
            this.formatDateLabel(row.postingOrderDate),
            this.formatDateLabel(row.relieverJoiningDate),
            row.rmks ?? '',
        ]);
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        const { columns, rows } = this.getExportData();
        const { preDateLines, filterLines } = buildScopeExportLines(this.accessibleScope, this.lang, this.appliedFilterLines);
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            landscape: true,
            preDateLines,
            filterLines,
            filename: 'long-stay-nominal-roll',
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

    /** Backend returns "Yy Mm" — turn into "Y years M months" / Bangla equivalent. */
    formatDuration(v: string | null | undefined): string {
        if (!v) return '—';
        const m = /^(\d+)y\s+(\d+)m$/.exec(v.trim());
        if (!m) return v;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        if (this.lang === 'en') {
            const parts: string[] = [];
            if (y > 0) parts.push(`${y} ${y === 1 ? 'year' : 'years'}`);
            parts.push(`${mo} ${mo === 1 ? 'month' : 'months'}`);
            return parts.join(' ');
        }
        const yBn = BanglaNumerals.toBangla(String(y));
        const mBn = BanglaNumerals.toBangla(String(mo));
        return `${yBn} বছর ${mBn} মাস`;
    }
}
