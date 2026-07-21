import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ReportService } from '@/services/report.service';
import { ExportService, type ReportConfig } from '@/services/export.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    PresentStatusMotherOrgColumn,
    PresentStatusByMotherOrgRow,
    PresentStatusByMotherOrgReportResponse,
} from '@/models/report.model';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-report-present-status-by-mother-org',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule, DatePickerModule],
    templateUrl: './report-present-status-by-mother-org.component.html',
    styleUrls: [
        '../report-theme.scss',
        './report-present-status-by-mother-org.component.scss',
    ],
})
export class ReportPresentStatusByMotherOrgComponent implements OnInit {
    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    columns: PresentStatusMotherOrgColumn[] = [];
    rows: PresentStatusByMotherOrgRow[] = [];
    columnTotals: Record<number, number> = {};
    grandTotal = 0;

    // Filters
    fromDate: Date = new Date(new Date().getFullYear(), 0, 1);
    toDate: Date = new Date(new Date().getFullYear(), 11, 31);

    postingStatusOptions: { label: string; value: string | null }[] = [
        { label: 'All', value: null },
        { label: 'Servings', value: 'Servings' },
        { label: 'Ex Member', value: 'ExMember' },
    ];
    selectedPostingStatus: string | null = 'Servings';

    presentStatusTypeOptions: { label: string; value: string | null }[] = [
        { label: 'All', value: null },
        { label: 'On Duty', value: 'OnDuty' },
        { label: 'Regular Posting Out', value: 'RegularPostingOut' },
        { label: 'RTU', value: 'RTUOnDisciplineIssue' },
        { label: 'Deceased', value: 'Deceased' },
        { label: 'Absent', value: 'Absent' },
        { label: 'Arrested', value: 'Arrested' },
    ];
    selectedPresentStatusType: string | null = null;

    constructor(
        private reportService: ReportService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
    }

    search(): void {
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        const fmtDate = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        this.reportService
            .getPresentStatusByMotherOrgReport({
                fromDate: fmtDate(this.fromDate),
                toDate: fmtDate(this.toDate),
                postingStatus: this.selectedPostingStatus,
                presentStatusType: this.selectedPresentStatusType,
            })
            .subscribe({
                next: (res: PresentStatusByMotherOrgReportResponse) => {
                    this.columns = res.columns ?? [];
                    this.rows = res.rows ?? [];
                    this.columnTotals = res.columnTotals ?? {};
                    this.grandTotal = res.grandTotal ?? 0;
                    this.loading = false;
                },
                error: () => {
                    this.loading = false;
                },
            });
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    colLabel(col: PresentStatusMotherOrgColumn): string {
        return this.lang === 'en' ? col.orgNameEN : (col.orgNameBN || col.orgNameEN);
    }

    monthLabel(row: PresentStatusByMotherOrgRow): string {
        if (this.lang === 'en') return row.monthLabelEN;
        const label = row.monthLabelBN || row.monthLabelEN;
        return BanglaNumerals.toBangla(label);
    }

    cellValue(row: PresentStatusByMotherOrgRow, orgId: number): number {
        return row.counts?.[orgId] ?? 0;
    }

    colTotalValue(orgId: number): number {
        return this.columnTotals?.[orgId] ?? 0;
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'PRESENT STATUS BY MOTHER ORGANIZATION (MONTHLY)'
            : 'মাতৃসংগঠন অনুযায়ী বর্তমান অবস্থা (মাসিক)';
    }

    get monthHeader(): string {
        return this.lang === 'en' ? 'Month' : 'মাস';
    }

    get serHeader(): string {
        return this.lang === 'en' ? 'Ser' : 'ক্রমিক';
    }

    get totalHeader(): string {
        return this.lang === 'en' ? 'Total' : 'মোট';
    }

    get rmksHeader(): string {
        return this.lang === 'en' ? 'Rmks' : 'মন্তব্য';
    }

    private static readonly EN_MONTHS = [
        'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
    ];
    private static readonly BN_MONTHS = [
        'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
        'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
    ];

    get dateLine(): string {
        const fmtRange = (d: Date) => {
            const day = d.getDate();
            const mon = d.getMonth();
            const year = d.getFullYear();
            if (this.lang === 'en') {
                return `${day} ${ReportPresentStatusByMotherOrgComponent.EN_MONTHS[mon]} ${year}`;
            }
            return `${BanglaNumerals.toBangla(String(day))} ${ReportPresentStatusByMotherOrgComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
        };
        return `${fmtRange(this.fromDate)} - ${fmtRange(this.toDate)}`;
    }

    get generateDateLabel(): string {
        const now = new Date();
        const day = now.getDate();
        const mon = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `Generated: ${day} ${ReportPresentStatusByMotherOrgComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `তৈরির তারিখ: ${BanglaNumerals.toBangla(String(day))} ${ReportPresentStatusByMotherOrgComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    // ── Export ──────────────────────────────────────────────────────────

    private getExportData(): { columns: string[]; rows: string[][] } {
        const cols = [
            this.serHeader,
            this.monthHeader,
            ...this.columns.map(c => this.colLabel(c)),
            this.totalHeader,
            this.rmksHeader,
        ];

        const dataRows = this.rows.map((row, i) => [
            this.fmt(i + 1),
            this.monthLabel(row),
            ...this.columns.map(c => this.fmt(this.cellValue(row, c.orgId))),
            this.fmt(row.total),
            '',
        ]);

        // Total row
        dataRows.push([
            '',
            this.totalHeader,
            ...this.columns.map(c => this.fmt(this.colTotalValue(c.orgId))),
            this.fmt(this.grandTotal),
            '',
        ]);

        return { columns: cols, rows: dataRows };
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        if (type === 'pdf') {
            this.exporting = true;
            try { await this.exportPdfDirect(); } finally { this.exporting = false; }
            return;
        }
        if (type === 'print') {
            this.exportPrintPopup();
            return;
        }

        const { columns, rows } = this.getExportData();
        const config: ReportConfig = {
            title: this.titleLabel,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            filename: 'present-status-by-mother-org-monthly',
            landscape: true,
            filterLines: [this.dateLine, this.generateDateLabel],
        };

        if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    /** Build the HTML for PDF and print exports. */
    private buildReportHtml(): { headerHtml: string; bodyHtml: string; totalHtml: string } {
        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const orgHeaders = this.columns
            .map(c => `<th>${esc(this.colLabel(c))}</th>`)
            .join('');
        const headerHtml = `<tr>
            <th class="ser-h">${esc(this.serHeader)}</th>
            <th class="status-h">${esc(this.monthHeader)}</th>
            ${orgHeaders}
            <th>${esc(this.totalHeader)}</th>
            <th class="rmks-h">${esc(this.rmksHeader)}</th>
        </tr>`;

        const bodyHtml = this.rows.map((row, i) => {
            const cells = this.columns
                .map(c => `<td class="num">${esc(this.fmt(this.cellValue(row, c.orgId)))}</td>`)
                .join('');
            return `<tr>
                <td class="num">${esc(this.fmt(i + 1))}</td>
                <td class="name">${esc(this.monthLabel(row))}</td>
                ${cells}
                <td class="num total">${esc(this.fmt(row.total))}</td>
                <td></td>
            </tr>`;
        }).join('');

        const totalCells = this.columns
            .map(c => `<td class="num">${esc(this.fmt(this.colTotalValue(c.orgId)))}</td>`)
            .join('');
        const totalHtml = `<tr class="total-row">
            <td></td>
            <td class="name" style="font-weight:700;text-align:right">${esc(this.totalHeader)}</td>
            ${totalCells}
            <td class="num total">${esc(this.fmt(this.grandTotal))}</td>
            <td></td>
        </tr>`;

        return { headerHtml, bodyHtml, totalHtml };
    }

    private async exportPdfDirect(): Promise<void> {
        const fontFamily = this.lang === 'bn'
            ? "'Times New Roman', 'SolaimanLipi', sans-serif"
            : "'Times New Roman', serif";
        const dateStr = this.dateLine;
        const genStr = this.generateDateLabel;
        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const { headerHtml, bodyHtml, totalHtml } = this.buildReportHtml();

        const tableWidthPx = 50 + 200 + this.columns.length * 110 + 100 + 80;
        const container = document.createElement('div');
        container.style.cssText = `position:absolute;left:-9999px;top:0;width:${tableWidthPx}px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box`;
        container.innerHTML = `
            <div style="font-family:${fontFamily};font-size:9pt;color:#000;line-height:1.4;width:100%">
                <h1 style="font-size:14pt;font-weight:700;text-align:center;margin:0 0 3px 0">${esc(this.titleLabel)}</h1>
                <div style="font-size:9pt;text-align:center;margin-bottom:2px">${esc(dateStr)}</div>
                <div style="font-size:8pt;text-align:center;margin-bottom:14px;color:#555">${esc(genStr)}</div>
                <table style="width:100%;border-collapse:collapse;font-family:${fontFamily}">
                    <thead>${headerHtml}</thead>
                    <tbody>${bodyHtml}</tbody>
                    <tfoot>${totalHtml}</tfoot>
                </table>
            </div>`;
        container.querySelectorAll('th').forEach((el: any) => {
            el.style.cssText = 'padding:5px 8px;text-align:center;font-size:9pt;font-weight:700;border:1px solid #000;white-space:nowrap;background:#fff;color:#000';
        });
        container.querySelectorAll('td').forEach((el: any) => {
            el.style.cssText += ';padding:4px 8px;border:1px solid #000;font-size:9pt;color:#000';
        });
        container.querySelectorAll('td.num').forEach((el: any) => { el.style.textAlign = 'center'; });
        container.querySelectorAll('td.name').forEach((el: any) => { el.style.textAlign = 'left'; });
        container.querySelectorAll('.total-row td').forEach((el: any) => { el.style.fontWeight = '700'; el.style.borderTop = '2px solid #000'; });
        document.body.appendChild(container);

        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const scale = 2;
            const canvas = await html2canvas(container, {
                scale, useCORS: true, backgroundColor: '#ffffff',
                logging: false, scrollY: -window.scrollY,
                height: container.scrollHeight, windowHeight: container.scrollHeight,
            });
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const isLandscape = imgWidth > imgHeight;
            const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
            const ratio = pdfWidth / imgWidth;
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 10, pdfWidth, imgHeight * ratio);
            const pdfBlob = pdf.output('blob');
            window.open(URL.createObjectURL(pdfBlob), '_blank');
        } finally {
            document.body.removeChild(container);
        }
    }

    private exportPrintPopup(): void {
        const fontFamily = this.lang === 'bn'
            ? "'Times New Roman', 'SolaimanLipi', sans-serif"
            : "'Times New Roman', serif";
        const dateStr = this.dateLine;
        const genStr = this.generateDateLabel;
        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const { headerHtml, bodyHtml, totalHtml } = this.buildReportHtml();

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(this.titleLabel)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${fontFamily}; font-size: 9pt; color: #000; background: #fff; padding: 16px; }
    h1 { font-size: 14pt; font-weight: 700; text-align: center; margin-bottom: 3px; }
    .date { font-size: 9pt; text-align: center; margin-bottom: 2px; }
    .gen-date { font-size: 8pt; text-align: center; margin-bottom: 14px; color: #555; }
    table { width: 100%; border-collapse: collapse; font-family: ${fontFamily}; }
    th { padding: 5px 8px; text-align: center; font-size: 9pt; font-weight: 700;
         border: 1px solid #000; white-space: nowrap; background: #fff; color: #000; }
    td { padding: 4px 8px; border: 1px solid #000; font-size: 9pt; }
    td.num { text-align: center; }
    td.name { text-align: left; }
    .total-row td { font-weight: 700; border-top: 2px solid #000; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print { body { padding: 0; } thead { display: table-header-group; } }
</style></head><body>
    <h1>${esc(this.titleLabel)}</h1>
    <div class="date">${esc(dateStr)}</div>
    <div class="gen-date">${esc(genStr)}</div>
    <table>
        <thead>${headerHtml}</thead>
        <tbody>${bodyHtml}</tbody>
        <tfoot>${totalHtml}</tfoot>
    </table>
</body></html>`;

        const win = window.open('', '_blank', 'width=1100,height=800');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }
}
