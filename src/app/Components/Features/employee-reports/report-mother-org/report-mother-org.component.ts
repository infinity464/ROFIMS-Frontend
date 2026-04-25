import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { GenericReportRow } from '@/models/report.model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import type { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-report-mother-org',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, Toast],
    providers: [MessageService],
    templateUrl: './report-mother-org.component.html',
    styleUrls: ['./report-mother-org.component.scss', '../report-theme.scss'],
})
export class ReportMotherOrgComponent implements OnInit, OnChanges {
    L = REPORT_LABELS;
    @Input() lang: ReportLang = 'en';
    @Input() commonCodeId: number | null = null;
    @Input() reportTypeLabel = '';
    @Input() commonCodeLabel = '';
    @Input() postingStatus: string = 'Servings';
    @Input() statusLabel = '';
    @Input() statusLabelBn = '';
    @Output() langToggle = new EventEmitter<void>();

    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgId: number | null = null;
    /** Mother Org Units (children of selected Mother Org); loaded when commonCodeId is set. */
    motherOrgUnitOptions: MotherOrganizationModel[] = [];
    selectedMotherOrgUnitId: number | null = null;
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    tradeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedRankId: number | null = null;
    selectedTradeId: number | null = null;

    list: GenericReportRow[] = [];
    loading = false;
    first = 0;
    rows = 20;
    totalRecords = 0;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    constructor(
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private exportService: ExportService
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
        return this.L[this.lang]['report.title.motherOrg'] + statusSuffix;
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
        if (this.selectedOrgId != null) {
            const org = this.orgOptions.find((o) => o.orgId === this.selectedOrgId);
            const val = this.lang === 'bn' ? (org?.orgNameBN || org?.orgNameEN) : org?.orgNameEN;
            if (val) lines.push(`${L['report.search.motherOrg']}: ${val}`);
        }
        if (this.selectedRankId != null) {
            const rank = this.rankOptions.find((o) => o.value === this.selectedRankId);
            const val = this.lang === 'bn' ? rank?.labelBn : rank?.label;
            if (val) lines.push(`${L['report.search.rank']}: ${val}`);
        }
        if (this.selectedTradeId != null) {
            const trade = this.tradeOptions.find((o) => o.value === this.selectedTradeId);
            const val = this.lang === 'bn' ? trade?.labelBn : trade?.label;
            if (val) lines.push(`${L['report.search.trade']}: ${val}`);
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
        this.loadOrgOptions();
        if (this.commonCodeId != null) {
            this.loadMotherOrgUnitsAndRankTrade(this.commonCodeId);
        }
        this.load();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['commonCodeId']) {
            this.motherOrgUnitOptions = [];
            this.selectedMotherOrgUnitId = null;
            const id = this.commonCodeId;
            if (id != null) {
                this.loadMotherOrgUnitsAndRankTrade(id);
            } else {
                this.rankOptions = [];
                this.tradeOptions = [];
            }
            if (!changes['commonCodeId'].firstChange) {
                this.first = 0;
                this.load();
            }
        } else if (changes['postingStatus'] && !changes['postingStatus'].firstChange) {
            this.first = 0;
            this.load();
        }
        if (changes['lang']) {
            this.appliedFilterLines = this.buildFilterLines();
        }
    }

    /** Load mother org units and rank/trade options when org is fixed from parent (commonCodeId). */
    private loadMotherOrgUnitsAndRankTrade(orgId: number): void {
        this.commonCodeService.getAllActiveMotherOrgUnits(orgId).subscribe({
            next: (units) => (this.motherOrgUnitOptions = units ?? []),
            error: (err: any) => (this.motherOrgUnitOptions = []),
        });
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.rankOptions = codes.map((c) => ({ label: c.codeValueEN || String(c.codeId), labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId), value: c.codeId }))),
        });
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Trade').subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.tradeOptions = codes.map((c) => ({ label: c.codeValueEN || String(c.codeId), labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId), value: c.codeId }))),
        });
    }

    loadOrgOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => (this.orgOptions = orgs),
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load organizations' });
            },
        });
    }

    onOrgChange(): void {
        this.rankOptions = [];
        this.tradeOptions = [];
        this.selectedRankId = null;
        this.selectedTradeId = null;
        const orgId = this.selectedOrgId;
        if (orgId != null) {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.rankOptions = codes.map((c) => ({ label: c.codeValueEN || String(c.codeId), labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId), value: c.codeId }))),
            });
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Trade').subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.tradeOptions = codes.map((c) => ({ label: c.codeValueEN || String(c.codeId), labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId), value: c.codeId }))),
            });
        }
    }

    onFilterChange(): void {}

    filterOpen = true;

    get activeFilterCount(): number {
        let c = 0;
        if (this.commonCodeId == null && this.selectedOrgId != null) c++;
        if (this.selectedMotherOrgUnitId != null) c++;
        if (this.selectedRankId != null) c++;
        if (this.selectedTradeId != null) c++;
        return c;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    filterSubtitle(): string {
        const L = this.L['en'];
        if (this.activeFilterCount === 0) return L['report.search.panelSubtitle'];
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' ' + L['report.search.panelSubtitleApplied'];
    }

    clearFilters(): void {
        this.selectedOrgId = null;
        this.selectedMotherOrgUnitId = null;
        this.selectedRankId = null;
        this.selectedTradeId = null;
        if (this.commonCodeId != null) {
            this.rankOptions = [];
            this.tradeOptions = [];
            this.motherOrgUnitOptions = [];
            this.loadMotherOrgUnitsAndRankTrade(this.commonCodeId);
        } else {
            this.rankOptions = [];
            this.tradeOptions = [];
            this.motherOrgUnitOptions = [];
        }
        this.first = 0;
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
            .getMotherOrgReport({
                orgId: (this.selectedOrgId ?? this.commonCodeId) ?? undefined,
                rankId: this.selectedRankId ?? undefined,
                tradeId: this.selectedTradeId ?? undefined,
                commonCodeId: this.commonCodeId ?? undefined,
                motherUnitId: this.selectedMotherOrgUnitId ?? undefined,
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
