import { Component, HostListener, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { PaginatorModule } from 'primeng/paginator';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PermanentPostingMORecordService, PostedOutServedReportModel } from '@/services/permanent-posting-mo-record.service';
import { CommonCodeService } from '@/services/common-code-service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { CommonCodeModel } from '@/models/common-code-model';
import {
    AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber,
    PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow,
    TextRun, WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

type Lang = 'en' | 'bn';

interface ReportColumn {
    key: string;
    labelEN: string;
    labelBN: string;
    hint: 'Serial' | 'ServiceId' | 'Date' | 'Duration' | 'Remarks' | 'Plain';
}

/**
 * Posted Out Members Served Report — formal RAB-paper document layout
 * (matches the employee-reports look & feel). Data comes from
 * PermanentPostingMORecord rows whose IsFinalPostedOut = 0, enriched with
 * the member's active service stint + present unit + posted unit.
 */
@Component({
    selector: 'app-posted-out-served-report',
    standalone: true,
    imports: [
        CommonModule, FormsModule, TableModule, ButtonModule, SelectModule,
        PaginatorModule, DatePickerModule, InputTextModule, Toast,
    ],
    providers: [MessageService],
    templateUrl: './posted-out-served-report.html',
    styleUrls: [
        '../employee-reports/report-theme.scss',
        '../employee-reports/report-card-mtr.scss',
        './posted-out-served-report.scss',
    ],
})
export class PostedOutServedReportComponent implements OnInit {
    private _router = inject(Router);
    private recordSvc = inject(PermanentPostingMORecordService);
    private commonCodeService = inject(CommonCodeService);
    private messageService = inject(MessageService);

    lang: Lang = 'en';

    // ── Filters ──────────────────────────────────────────────────
    presentUnitOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedPresentUnitId: number | null = null;
    servedFrom: Date | null = null;
    servedTo: Date | null = null;
    searchText = '';

    filterOpen = true;

    // ── Data / paging ────────────────────────────────────────────
    list: PostedOutServedReportModel[] = [];
    loading = false;
    first = 0;
    rows = 20;
    rowsPerPageOptions = [20, 50, 100];
    totalRecords = 0;
    searched = false;

    exportDropdownOpen = false;
    exporting = false;

    readonly columns: ReportColumn[] = [
        { key: 'ser',          labelEN: 'Ser',        labelBN: 'ক্রঃ',                  hint: 'Serial' },
        { key: 'serviceId',    labelEN: 'Service ID', labelBN: 'সার্ভিস আইডি',          hint: 'ServiceId' },
        { key: 'rank',         labelEN: 'Rank',       labelBN: 'র‍্যাংক',               hint: 'Plain' },
        { key: 'corps',        labelEN: 'Corps',      labelBN: 'কোর',                   hint: 'Plain' },
        { key: 'trade',        labelEN: 'Trade',      labelBN: 'ট্রেড',                 hint: 'Plain' },
        { key: 'name',         labelEN: 'Name',       labelBN: 'নাম',                   hint: 'Plain' },
        { key: 'joiningDate',  labelEN: 'Date of Joining in RAB', labelBN: 'র‍্যাবে যোগদানের তারিখ', hint: 'Date' },
        { key: 'duration',     labelEN: 'Duration',   labelBN: 'মেয়াদ',                 hint: 'Duration' },
        { key: 'presentUnit',  labelEN: 'Battalion', labelBN: 'ব্যাটালিয়ন', hint: 'Plain' },
        { key: 'postedUnit',   labelEN: 'Posted Unit', labelBN: 'বদলিকৃত ইউনিট',         hint: 'Plain' },
        { key: 'contact',      labelEN: 'Contact Number', labelBN: 'যোগাযোগ নম্বর',      hint: 'Plain' },
        { key: 'rmks',         labelEN: 'Rmks',       labelBN: 'মন্তব্য',               hint: 'Remarks' },
    ];

    private readonly plainMap: Record<string, { en: keyof PostedOutServedReportModel; bn?: keyof PostedOutServedReportModel }> = {
        rank:        { en: 'rank',        bn: 'rankBN' },
        corps:       { en: 'corps',       bn: 'corpsBN' },
        trade:       { en: 'trade',       bn: 'tradeBN' },
        name:        { en: 'name',        bn: 'nameBN' },
        presentUnit: { en: 'presentUnit', bn: 'presentUnitBN' },
        postedUnit:  { en: 'postedUnit',  bn: 'postedUnitBN' },
        contact:     { en: 'contactNumber' },
    };

    // ── Letterhead getters ───────────────────────────────────────
    get rabOverlineText(): string {
        return this.lang === 'bn'
            ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার'
            : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH";
    }
    get rabOrgTitle(): string { return this.lang === 'bn' ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION'; }
    get rabOrgSubtitle(): string {
        return this.lang === 'bn'
            ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা'
            : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka';
    }
    get rabSectionTitle(): string {
        return this.lang === 'bn' ? 'র‍্যাবে কর্মরত পোস্টেড আউট সদস্যগণ' : 'POSTED OUT MEMBERS SERVED IN RAB';
    }
    get rabCriteriaTitle(): string { return this.lang === 'bn' ? 'নির্বাচন মানদণ্ড' : 'SELECTION CRITERIA'; }
    get rabGeneratedLabel(): string { return this.lang === 'bn' ? 'তারিখ' : 'GENERATED'; }
    get rabFormattedDate(): string {
        const now = new Date();
        return this.lang === 'bn'
            ? now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
            : now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    }
    get rabConfidentialLabel(): string { return this.lang === 'bn' ? 'গোপনীয়' : 'CONFIDENTIAL'; }
    get rabWarningLabel(): string { return this.lang === 'bn' ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED'; }
    get rabPageOfLabel(): string { return this.lang === 'bn' ? 'পৃষ্ঠা ১ / ১' : 'PAGE 1 OF 1'; }

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    ngOnInit(): void {
        this.loadPresentUnits();
    }

    loadPresentUnits(): void {
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.presentUnitOptions = (codes || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }))),
            error: () => (this.presentUnitOptions = []),
        });
    }

    // ── Filter panel ─────────────────────────────────────────────
    toggleFilter(): void { this.filterOpen = !this.filterOpen; }

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedPresentUnitId != null) c++;
        if (this.servedFrom != null) c++;
        if (this.servedTo != null) c++;
        if (this.searchText?.trim()) c++;
        return c;
    }

    filterSubtitle(): string {
        if (this.activeFilterCount === 0) return this.lang === 'bn' ? 'প্রতিবেদন তৈরি করতে মানদণ্ড নির্বাচন করুন' : 'Choose criteria to generate the list';
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return `${n} ${this.lang === 'bn' ? 'টি মানদণ্ড প্রয়োগ করা হয়েছে' : 'filter(s) applied'}`;
    }

    clearFilters(): void {
        this.selectedPresentUnitId = null;
        this.servedFrom = null;
        this.servedTo = null;
        this.searchText = '';
        this.first = 0;
    }

    onFilterChange(): void {}

    // ── Criteria chips ───────────────────────────────────────────
    get criteriaItems(): { label: string; value: string }[] {
        const items: { label: string; value: string }[] = [];
        if (this.selectedPresentUnitId != null) {
            const opt = this.presentUnitOptions.find(o => o.value === this.selectedPresentUnitId);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) items.push({ label: this.lang === 'bn' ? 'ব্যাটালিয়ন' : 'Battalion', value: val });
        }
        if (this.servedFrom != null) items.push({ label: this.lang === 'bn' ? 'যোগদান হতে' : 'Served From', value: this.formatDate(this.toDateStr(this.servedFrom)) });
        if (this.servedTo != null) items.push({ label: this.lang === 'bn' ? 'যোগদান পর্যন্ত' : 'Served To', value: this.formatDate(this.toDateStr(this.servedTo)) });
        if (this.searchText?.trim()) items.push({ label: this.lang === 'bn' ? 'অনুসন্ধান' : 'Search', value: this.searchText.trim() });
        return items;
    }

    // ── Load ─────────────────────────────────────────────────────
    onPage(event: { first?: number; rows?: number }): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.load();
    }

    load(): void {
        this.loading = true;
        const page_no = Math.floor(this.first / this.rows) + 1;
        this.recordSvc.getPostedOutServedReportPaginated(
            page_no, this.rows, this.searchText?.trim() || undefined,
            this.toDateStr(this.servedFrom) || undefined,
            this.toDateStr(this.servedTo) || undefined,
            null, this.selectedPresentUnitId
        ).subscribe({
            next: (res) => {
                this.list = res.datalist ?? [];
                this.totalRecords = res.pages?.Rows ?? 0;
                this.searched = true;
                this.loading = false;
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load report' });
                this.list = [];
                this.totalRecords = 0;
                this.loading = false;
            },
        });
    }

    toggleLang(): void { this.lang = this.lang === 'en' ? 'bn' : 'en'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    // ── Cell helpers ─────────────────────────────────────────────
    ser(i: number): number { return this.first + i + 1; }

    paddedSer(n: number): string {
        const s = String(n).padStart(2, '0');
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    serviceIdDisplay(r: PostedOutServedReportModel): string {
        const prefix = this.lang === 'bn' ? r.prefixBN : r.prefix;
        const id = prefix && r.serviceId ? `${prefix}-${r.serviceId}` : (r.serviceId ?? '');
        return this.lang === 'bn' ? BanglaNumerals.toBangla(id) : id;
    }

    plainValue(r: PostedOutServedReportModel, key: string): string {
        const map = this.plainMap[key];
        if (!map) return '—';
        const en = r[map.en] as string | null | undefined;
        const bn = map.bn ? (r[map.bn] as string | null | undefined) : undefined;
        return this.codeValue(en, bn);
    }

    cellValue(r: PostedOutServedReportModel, col: ReportColumn, i: number): string {
        switch (col.hint) {
            case 'Serial':    return this.paddedSer(this.ser(i));
            case 'ServiceId': return this.serviceIdDisplay(r) || '—';
            case 'Date':      return this.formatDate(r.servedFromDate);
            case 'Duration':  return this.durationDisplay(r.servedFromDate);
            case 'Remarks':   return r.rmks || '';
            case 'Plain':
            default:          return this.plainValue(r, col.key);
        }
    }

    /** Duration of service in RAB from the active-service start date up to today. */
    durationDisplay(v: string | null | undefined): string {
        if (!v) return '—';
        const start = new Date(v);
        if (isNaN(start.getTime())) return '—';
        const now = new Date();
        if (start > now) return '—';
        let years = now.getFullYear() - start.getFullYear();
        let months = now.getMonth() - start.getMonth();
        if (now.getDate() < start.getDate()) months -= 1;
        if (months < 0) { years -= 1; months += 12; }
        const y = this.lang === 'bn' ? BanglaNumerals.toBangla(String(years)) : String(years);
        const m = this.lang === 'bn' ? BanglaNumerals.toBangla(String(months)) : String(months);
        const yL = this.lang === 'bn' ? 'বছর' : 'y';
        const mL = this.lang === 'bn' ? 'মাস' : 'm';
        const parts: string[] = [];
        if (years > 0) parts.push(`${y}${this.lang === 'bn' ? ' ' + yL : yL}`);
        if (months > 0) parts.push(`${m}${this.lang === 'bn' ? ' ' + mL : mL}`);
        if (parts.length === 0) parts.push(this.lang === 'bn' ? '< ১ মাস' : '< 1m');
        return parts.join(' ');
    }

    toDateStr(d: Date | null): string {
        if (d == null) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    formatDate(v: string | null | undefined): string {
        if (v == null || v === '') return '—';
        const d = new Date(v);
        if (isNaN(d.getTime())) return v;
        const s = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
    }

    colLabel(col: ReportColumn): string { return this.lang === 'bn' ? col.labelBN : col.labelEN; }

    // ── Export ───────────────────────────────────────────────────
    async exportAs(type: 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (!this.list?.length) return;
        if (type === 'print') { this.openRabPrintWindow(); return; }
        this.exporting = true;
        try {
            if (type === 'word') await this.exportRabWord();
            else this.exportRabExcel();
        } finally {
            this.exporting = false;
        }
    }

    private async exportRabWord(): Promise<void> {
        const isBn = this.lang === 'bn';
        const bnFont = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'Nirmala UI', hint: 'cs' as const };
        const sans = isBn ? (bnFont as any) : 'Calibri';
        const serif = isBn ? (bnFont as any) : 'Cambria';
        const mono = isBn ? (bnFont as any) : 'Consolas';
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const bnRunExtras = (size: number) => isBn ? { language: bnLang, sizeComplexScript: size } : {};
        const wsafe = (s: string | null | undefined): string => s ?? '';

        const S = { overline: 15, title: 44, subtitle: 20, sectionTitle: 26, stripLabel: 16, stripDate: 16, critLabel: 14, critValue: 20, tableHeader: 14, body: 16, footer: 13 };
        const C = { black: '0B0B0B', mutedText: '555555', gray: '6B6B6B', labelGray: '8A8A8A', zebra: 'FAFAF6', border: 'BFBFBF', innerBorder: 'D9D9D9' };
        const innerCellBorder = { top: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, bottom: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, left: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, right: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder } };
        const headerCellBorder = { top: { style: BorderStyle.SINGLE, size: 8, color: C.black }, bottom: { style: BorderStyle.SINGLE, size: 8, color: C.black }, left: { style: BorderStyle.SINGLE, size: 4, color: C.border }, right: { style: BorderStyle.SINGLE, size: 4, color: C.border } };

        const headerPars: Paragraph[] = [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: wsafe(this.rabOverlineText), font: sans, size: S.overline, ...bnRunExtras(S.overline), color: C.mutedText, characterSpacing: isBn ? 0 : 60, allCaps: !isBn })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: wsafe(this.rabOrgTitle), font: serif, size: S.title, ...bnRunExtras(S.title), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabOrgSubtitle), font: serif, size: S.subtitle, ...bnRunExtras(S.subtitle), italics: true, color: C.mutedText })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabSectionTitle), font: serif, size: S.sectionTitle, ...bnRunExtras(S.sectionTitle), bold: true, color: C.black, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }),
        ];

        const stripCell = (runs: TextRun[], alignment: typeof AlignmentType.LEFT | typeof AlignmentType.RIGHT) =>
            new TableCell({ columnSpan: 2, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border }, left: { style: BorderStyle.SINGLE, size: 4, color: C.border }, right: { style: BorderStyle.SINGLE, size: 4, color: C.border } }, margins: { top: 80, bottom: 80, left: 140, right: 140 }, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment, children: runs })] });
        const stripRow = new TableRow({ cantSplit: true, children: [stripCell([new TextRun({ text: wsafe(this.rabCriteriaTitle), font: sans, size: S.stripLabel, ...bnRunExtras(S.stripLabel), bold: true, color: C.black, characterSpacing: isBn ? 0 : 40, allCaps: !isBn })], AlignmentType.LEFT), stripCell([new TextRun({ text: wsafe(`${this.rabGeneratedLabel} · ${this.rabFormattedDate}`), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.mutedText, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })], AlignmentType.RIGHT)] });
        const items = this.criteriaItems;
        const colsPerCritRow = 4;
        const critCellPct = 100 / colsPerCritRow;
        const critRows: TableRow[] = [stripRow];
        for (let i = 0; i < Math.max(items.length, 1); i += colsPerCritRow) {
            const cells: TableCell[] = [];
            for (let j = 0; j < colsPerCritRow; j++) {
                const it = items[i + j];
                cells.push(new TableCell({ borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: critCellPct, type: WidthType.PERCENTAGE }, children: it ? [new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: wsafe(it.label), font: sans, size: S.critLabel, ...bnRunExtras(S.critLabel), bold: true, color: C.labelGray, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }), new Paragraph({ children: [new TextRun({ text: wsafe(it.value), font: serif, size: S.critValue, ...bnRunExtras(S.critValue), bold: true, color: C.black })] })] : [new Paragraph({ children: [new TextRun({ text: ' ', font: sans, size: S.critValue, ...bnRunExtras(S.critValue) })] })] }));
            }
            critRows.push(new TableRow({ cantSplit: true, children: cells }));
        }
        const criteriaTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: critRows });

        const dataColPct = 100 / this.columns.length;
        const headerCells = this.columns.map(col => new TableCell({ borders: headerCellBorder, margins: { top: 120, bottom: 120, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: wsafe(this.colLabel(col)), font: sans, size: S.tableHeader, ...bnRunExtras(S.tableHeader), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })] })] }));
        const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: headerCells });

        const dataRows: TableRow[] = this.list.map((row, idx) => {
            const shading = idx % 2 === 1 ? { type: 'clear' as const, fill: C.zebra, color: 'auto' } : undefined;
            const cells = this.columns.map(col => new TableCell({ borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, shading, children: [new Paragraph({ children: [new TextRun({ text: wsafe(this.cellValue(row, col, idx)), font: col.hint === 'Date' || col.hint === 'ServiceId' ? mono : sans, size: S.body, ...bnRunExtras(S.body), color: C.black })] })] }));
            return new TableRow({ cantSplit: true, children: cells });
        });
        const dataTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: [headerRow, ...dataRows] });

        const footerCellBorder = { top: { style: BorderStyle.SINGLE, size: 6, color: C.black }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
        const footer = new Footer({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3000, 3000, 3000], rows: [new TableRow({ cantSplit: true, children: [new TableCell({ borders: footerCellBorder, margins: { top: 80, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ children: [new TextRun({ text: wsafe(this.rabConfidentialLabel), font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })] })] }), new TableCell({ borders: footerCellBorder, margins: { top: 80, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({})] }), new TableCell({ borders: footerCellBorder, margins: { top: 80, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${isBn ? 'পৃষ্ঠা' : 'PAGE'} `, PageNumber.CURRENT, ` ${isBn ? '/' : 'OF'} `, PageNumber.TOTAL_PAGES], font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24, allCaps: !isBn })] })] })] })] })] });

        const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 680, bottom: 1247, left: 680, right: 680 } } }, footers: { default: footer }, children: [...headerPars, criteriaTable, new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: '', font: sans, size: 4 })] }), dataTable] }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `posted-out-served-report_${this.lang}.docx`);
    }

    private exportRabExcel(): void {
        const isBn = this.lang === 'bn';
        const wsafe = (s: string | null | undefined): string => s ?? '';
        const headers = this.columns.map(c => this.colLabel(c));
        const totalCols = headers.length || 1;
        const pad = (n: number) => Array.from({ length: n }, () => '');

        const aoa: any[][] = [];
        aoa.push([wsafe(this.rabOverlineText), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgTitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgSubtitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabSectionTitle), ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabCriteriaTitle}  ·  ${this.rabGeneratedLabel}: ${this.rabFormattedDate}`, ...pad(totalCols - 1)]);
        for (const it of this.criteriaItems) aoa.push([`${it.label}: ${it.value}`, ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push(headers);
        this.list.forEach((row, i) => aoa.push(this.columns.map(col => this.cellValue(row, col, i))));
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabConfidentialLabel}  ·  ${this.rabWarningLabel}`, ...pad(totalCols - 1)]);

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = ws['!merges'] ?? [];
        for (const r of [0, 1, 2, 3, 4]) ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
        const lastRow = aoa.length - 1;
        ws['!merges'].push({ s: { r: lastRow, c: 0 }, e: { r: lastRow, c: totalCols - 1 } });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isBn ? 'প্রতিবেদন' : 'Report');
        XLSX.writeFile(wb, `posted-out-served-report_${this.lang}.xlsx`);
    }

    private openRabPrintWindow(): void {
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) { this.messageService.add({ severity: 'warn', summary: 'Popup blocked', detail: 'Allow popups for this site to use Print.', life: 6000 }); return; }
        win.document.open();
        win.document.write(this.buildRabPrintHtml());
        win.document.close();
        setTimeout(() => { try { win.focus(); win.print(); } catch { /* user can Ctrl+P */ } }, 700);
    }

    private buildRabPrintHtml(): string {
        const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const isBn = this.lang === 'bn';
        const serif = isBn ? "'Times New Roman', 'Nirmala UI', serif" : "'Times New Roman', serif";
        const sans = isBn ? "'Times New Roman', 'Nirmala UI', sans-serif" : "'Times New Roman', sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const tableHeaderHtml = `<tr>${this.columns.map(c => `<th>${esc(this.colLabel(c))}</th>`).join('')}</tr>`;
        const tableBodyHtml = this.list.map((row, i) => `<tr>${this.columns.map(c => {
            const cls = c.hint === 'Serial' ? ' class="td-ser"' : (c.hint === 'Date' || c.hint === 'ServiceId') ? ' class="td-date"' : c.hint === 'Remarks' ? ' class="td-rmks"' : '';
            return `<td${cls}>${esc(this.cellValue(row, c, i))}</td>`;
        }).join('')}</tr>`).join('');
        const items = this.criteriaItems;
        const criteriaGridHtml = items.length ? `<div class="criteria-grid">${items.map(item => `<div class="cell"><div class="cell-label">${esc(item.label)}</div><div class="cell-value">${esc(item.value)}</div></div>`).join('')}</div>` : '';
        const pageWord = isBn ? 'পৃষ্ঠা' : 'PAGE';
        const ofWord = isBn ? '/' : 'OF';
        const cssStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        return `<!DOCTYPE html><html lang="${isBn ? 'bn' : 'en'}"><head><meta charset="UTF-8" /><title>${esc(this.rabSectionTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
    @counter-style bn-digits { system: numeric; symbols: '\\09E6' '\\09E7' '\\09E8' '\\09E9' '\\09EA' '\\09EB' '\\09EC' '\\09ED' '\\09EE' '\\09EF'; }
    @page {
        margin: 12mm 5mm 22mm 5mm;
        @bottom-center { content: "${cssStr(pageWord)} " counter(page${isBn ? ', bn-digits' : ''}) " ${cssStr(ofWord)} " counter(pages${isBn ? ', bn-digits' : ''}); font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.25em; text-transform: uppercase; color: #4a4a4a; padding-top: 5mm; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0b0b0b; font-family: ${sans}; font-size: 10pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .paper { padding: 4mm 8mm; }
    .paper-head { text-align: center; margin-bottom: 6mm; }
    .overline { font-size: 7.5pt; letter-spacing: 0.3em; color: #555; text-transform: uppercase; margin-bottom: 3mm; font-weight: 500; ${isBn ? 'letter-spacing:0;text-transform:none;font-size:9pt;' : ''} }
    .paper-title { font-family: ${serif}; font-weight: 700; font-size: 22pt; margin: 0 0 2mm 0; letter-spacing: 0.12em; color: #0b0b0b; ${isBn ? 'letter-spacing:0;' : ''} }
    .paper-sub { font-family: ${serif}; font-style: italic; color: #555; font-size: 10pt; margin-bottom: 4mm; }
    .orn-divider { display: flex; justify-content: center; align-items: center; gap: 6mm; margin: 4mm auto; max-width: 65%; }
    .orn-line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, #b78b3b, transparent); }
    .orn-diamond { color: #b78b3b; font-size: 9pt; }
    .paper-section { font-family: ${serif}; font-size: 13pt; font-weight: 700; letter-spacing: 0.16em; color: #0b0b0b; margin: 0 0 1mm 0; text-transform: uppercase; ${isBn ? 'letter-spacing:0;' : ''} }
    .criteria { margin: 5mm 0 6mm; border: 1px solid #d8d6d0; border-radius: 1mm; overflow: hidden; }
    .criteria-strip { display: flex; justify-content: space-between; align-items: center; padding: 1.5mm 3mm; background: #f4f4f2; border-bottom: 1px solid #d8d6d0; font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase; color: #4a4a4a; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .criteria-strip-title { display: inline-flex; gap: 1.5mm; align-items: center; color: #0b0b0b; }
    .diamond-bullet { color: #b78b3b; }
    .criteria-strip-date { opacity: 0.75; font-weight: 500; }
    .criteria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr)); }
    .cell { padding: 2mm 3mm; border-right: 1px solid #e6e4de; border-top: 1px solid #e6e4de; }
    .cell-label { font-size: 7pt; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 1mm; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .cell-value { font-family: ${serif}; font-size: 10pt; font-weight: 700; color: #0b0b0b; line-height: 1.2; ${isBn ? 'font-family:' + sans + ';' : ''} }
    table { width: 100%; border-collapse: collapse; table-layout: auto; font-family: ${sans}; font-size: 8pt; }
    thead { display: table-header-group; }
    thead th { background: #0b0b0b; color: #d9c79a; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; padding: 1.8mm 2mm; text-align: left; vertical-align: middle; white-space: nowrap; border: 1px solid rgba(11,11,11,0.05); ${isBn ? 'letter-spacing:0.04em;font-family:' + sans + ';' : ''} }
    tbody td { padding: 2mm 2mm; font-size: 8pt; color: #0b0b0b; border: 1px solid rgba(11,11,11,0.05); vertical-align: top; background: #fff; word-break: break-word; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }
    .td-ser { white-space: nowrap; font-family: ${mono}; font-weight: 600; color: #6b6b6b; }
    .td-date { font-family: ${mono}; letter-spacing: 0.02em; white-space: nowrap; }
</style></head><body><div class="paper">
    <header class="paper-head">
        <div class="overline">${esc(this.rabOverlineText)}</div>
        <h1 class="paper-title">${esc(this.rabOrgTitle)}</h1>
        <div class="paper-sub"><em>${esc(this.rabOrgSubtitle)}</em></div>
        <div class="orn-divider"><span class="orn-line"></span><span class="orn-diamond">&#9670;</span><span class="orn-line"></span></div>
        <h2 class="paper-section">${esc(this.rabSectionTitle)}</h2>
    </header>
    <div class="criteria">
        <div class="criteria-strip"><span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${esc(this.rabCriteriaTitle)}</span><span class="criteria-strip-date">${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span></div>
        ${criteriaGridHtml}
    </div>
    <table><thead>${tableHeaderHtml}</thead><tbody>${tableBodyHtml}</tbody></table>
</div></body></html>`;
    }
}
