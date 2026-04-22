import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { FamilyOccupationReportRow } from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-report-family-occupation',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, InputTextModule, Toast],
    providers: [MessageService],
    templateUrl: './report-family-occupation.component.html',
    styleUrls: ['./report-family-occupation.component.scss', '../report-theme.scss'],
})
export class ReportFamilyOccupationComponent implements OnInit {
    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    /** Relation Type dropdown (value = 0 means "All") */
    relationOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedRelationId: number | null = null;

    /** Text search fields */
    searchRabId: string = '';
    searchServiceId: string = '';
    searchNid: string = '';

    /** Occupation dropdown */
    occupationOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedOccupationId: number | null = null;

    /** RAB Member Status dropdown */
    statusOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: 'All' },
        { label: 'Presently Serving', labelBn: 'কর্মরত', value: 'Servings' },
        { label: 'Supernumerary', labelBn: 'সুপারনিউমারারি', value: 'Supernumerary' },
        { label: 'Ex Member', labelBn: 'সাবেক সদস্য', value: 'ExMember' },
    ];
    selectedPostingStatus: string = 'Servings';

    list: FamilyOccupationReportRow[] = [];
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
        const base = this.L[this.lang]['report.title.familyOccupation'];
        if (this.selectedPostingStatus) {
            const status = this.statusOptions.find(o => o.value === this.selectedPostingStatus);
            const label = this.lang === 'bn' ? status?.labelBn : status?.label;
            if (label) return `${base} (${label})`;
        }
        return base;
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
        if (this.selectedRelationId != null) {
            const rel = this.relationOptions.find((o) => o.value === this.selectedRelationId);
            const val = this.lang === 'bn' ? rel?.labelBn : rel?.label;
            if (val) lines.push(`${L['report.search.relationType']}: ${val}`);
        }
        if (this.selectedOccupationId != null) {
            const occ = this.occupationOptions.find((o) => o.value === this.selectedOccupationId);
            const val = this.lang === 'bn' ? occ?.labelBn : occ?.label;
            if (val) lines.push(`${L['report.search.occupation']}: ${val}`);
        }
        if (this.searchRabId.trim()) lines.push(`RAB ID: ${this.searchRabId.trim()}`);
        if (this.searchServiceId.trim()) lines.push(`Service ID: ${this.searchServiceId.trim()}`);
        if (this.searchNid.trim()) lines.push(`NID: ${this.searchNid.trim()}`);
        return lines;
    }

    getExportData(): { columns: string[]; rows: string[][] } {
        const L = this.L[this.lang];
        const columns = [
            L['report.table.ser'],
            L['report.table.familyMemberName'],
            L['report.table.occupation'],
            L['report.table.occupationDetails'],
            L['report.table.rabMemberName'],
            L['report.table.rabId'],
            L['report.table.serviceId'],
            L['report.table.rank'],
            L['report.table.motherOrg'],
        ];
        const rows = this.list.map((row) => [
            this.displayNum(row.ser),
            this.codeValue(row.familyMemberName, row.familyMemberNameBN),
            this.codeValue(row.occupation, row.occupationBN),
            row.occupationDetails ?? '—',
            this.codeValue(row.name, row.nameBN),
            row.rabid ?? '—',
            this.displayNum(row.serviceId),
            this.codeValue(row.rank, row.rankBN),
            this.codeValue(row.orgName, row.orgNameBN),
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
            landscape: true,
            marginMm: 5,
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
        this.loadRelationOptions();
        this.loadOccupationOptions();
    }

    loadRelationOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Relationship').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.relationOptions = [
                    { label: 'All', labelBn: 'সকল', value: 0 },
                    ...codes.map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                        value: c.codeId,
                    })),
                ];
                // Default select Spouse
                const spouse = this.relationOptions.find(
                    (o) => o.label.toLowerCase() === 'spouse' || o.label.toLowerCase() === 'wife'
                );
                if (spouse) {
                    this.selectedRelationId = spouse.value;
                }
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load relation types' });
            },
        });
    }

    loadOccupationOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Occupation').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.occupationOptions = codes.map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }));
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load occupations' });
            },
        });
    }

    filterOpen = true;

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedRelationId != null) c++;
        if (this.selectedOccupationId != null) c++;
        if (this.selectedPostingStatus) c++;
        if (this.searchRabId.trim()) c++;
        if (this.searchServiceId.trim()) c++;
        if (this.searchNid.trim()) c++;
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
        this.selectedRelationId = null;
        this.selectedOccupationId = null;
        this.selectedPostingStatus = 'Servings';
        this.searchRabId = '';
        this.searchServiceId = '';
        this.searchNid = '';
        this.first = 0;
        this.list = [];
        this.totalRecords = 0;
    }

    onPage(event: { first: number; rows: number }): void {
        this.first = event.first;
        this.rows = event.rows;
        this.load();
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    load(): void {
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const page_no = Math.floor(this.first / this.rows) + 1;
        this.reportService
            .getFamilyOccupationReport({
                relationId: this.selectedRelationId && this.selectedRelationId > 0 ? this.selectedRelationId : undefined,
                occupationId: this.selectedOccupationId ?? undefined,
                postingStatus: this.selectedPostingStatus && this.selectedPostingStatus !== 'All' ? this.selectedPostingStatus : undefined,
                rabId: this.searchRabId.trim() || undefined,
                serviceId: this.searchServiceId.trim() || undefined,
                nid: this.searchNid.trim() || undefined,
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
