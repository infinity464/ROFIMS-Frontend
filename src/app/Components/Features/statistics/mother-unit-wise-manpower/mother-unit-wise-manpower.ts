import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import {
    StatisticsService,
    type MotherUnitOrgOption,
    type MotherUnitRankColumn,
    type MotherUnitRow,
    type MotherUnitWiseManpowerResponse
} from '@/services/statistics.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type Lang = 'en' | 'bn';

/** One mother org's data block; alias of the per-org backend response for clarity. */
type MotherUnitOrgBlock = MotherUnitWiseManpowerResponse;

@Component({
    selector: 'app-mother-unit-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule],
    templateUrl: './mother-unit-wise-manpower.html',
    styleUrl: './mother-unit-wise-manpower.scss'
})
export class MotherUnitWiseManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    loadingOrgs = false;
    exporting = false;
    exportDropdownOpen = false;

    /** All mother orgs available to the user (raw dropdown options). */
    orgOptions: MotherUnitOrgOption[] = [];
    /** Multi-select binding: empty array = nothing loaded yet (shows empty state). */
    selectedOrgIds: number[] = [];

    /** Currently displayed blocks — only orgs the user explicitly selected. */
    filteredOrgs: MotherUnitOrgBlock[] = [];

    /** Sum of every filtered org's grandTotal — single number because rank columns vary per org. */
    grandTotal = 0;

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    private static readonly EN_MONTHS = [
        'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
        'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
    ];
    private static readonly BN_MONTHS = [
        'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
        'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'
    ];

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadOrgOptions();
    }

    /** Loads the dropdown options only — data is fetched on-demand when the user selects orgs. */
    private loadOrgOptions(): void {
        this.loadingOrgs = true;
        this.statisticsService.getMotherOrgOptions().subscribe({
            next: (opts) => {
                this.orgOptions = opts ?? [];
                this.loadingOrgs = false;
            },
            error: () => { this.loadingOrgs = false; }
        });
    }

    /**
     * Multi-select changed: fetch data only for the currently selected orgs.
     * Empty selection clears the report (no auto-load-all).
     */
    onOrgFilterChange(): void {
        const ids = this.selectedOrgIds ?? [];
        if (ids.length === 0) {
            this.filteredOrgs = [];
            this.grandTotal = 0;
            this.accessibleRabUnitNames = null;
            this.accessibleRabUnitNamesBN = null;
            return;
        }
        this.loading = true;
        forkJoin(
            ids.map(id =>
                this.statisticsService.getMotherUnitWiseManpower(id).pipe(
                    catchError(() => of(null as MotherUnitWiseManpowerResponse | null))
                )
            )
        ).subscribe({
            next: (results) => {
                this.filteredOrgs = (results ?? [])
                    .filter((r): r is MotherUnitWiseManpowerResponse => r != null);
                // RAB-unit scope is the same across calls — take it from the first non-null response.
                const first = this.filteredOrgs[0];
                this.accessibleRabUnitNames   = first?.accessibleRabUnitNames   ?? null;
                this.accessibleRabUnitNamesBN = first?.accessibleRabUnitNamesBN ?? null;
                this.grandTotal = this.filteredOrgs.reduce((sum, o) => sum + (o.grandTotal ?? 0), 0);
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    /** Comma-separated unit-scope line shown under the report title; null when unrestricted. */
    get scopeLine(): string | null {
        const names = this.lang === 'bn'
            ? (this.accessibleRabUnitNamesBN ?? this.accessibleRabUnitNames)
            : this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
    }

    toggleLang(): void { this.lang = this.lang === 'en' ? 'bn' : 'en'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (type === 'pdf') {
            this.exporting = true;
            try { await this.exportPdfPopup(); } finally { this.exporting = false; }
            return;
        }
        if (type === 'print') {
            this.exportPrintPopup();
            return;
        }

        // Word / Excel: build sectioned export — one section per org, each with its
        // own column header (rank list differs per org).
        const scope = this.scopeLine;
        const sectionedConfig = {
            title: this.titleLabel,
            lang: this.lang,
            // Top-level columns kept for backwards-compatible exporters; the real
            // per-section columns are provided below.
            columns: [],
            sections: this.filteredOrgs.map(org => ({
                title: this.orgLabel(org),
                columns: [
                    this.serLabel,
                    this.unitLabel,
                    ...org.ranks.map(r => this.rankLabel(r)),
                    this.totalLabel
                ],
                rows: org.units.map((unit, i) => [
                    this.fmt(i + 1),
                    this.unitNameLabel(unit),
                    ...org.ranks.map(r => this.fmt(this.cellValue(unit, r.rankId))),
                    this.fmt(unit.total)
                ]),
                subtotalRow: [
                    '',
                    this.totalLabel,
                    ...org.ranks.map(r => this.fmt(this.columnTotal(org, r.rankId))),
                    this.fmt(org.grandTotal)
                ]
            })),
            grandTotalRow: ['', this.grandTotalLabel, this.fmt(this.grandTotal)],
            showPageNumbers: true,
            filename: 'mother-unit-wise-manpower',
            filterLines: scope ? [scope] : undefined
        };
        if (type === 'word') {
            // exportWordSectioned may exist (rank-wise uses it); fall back to exportWord otherwise.
            const svc: any = this.exportService;
            if (typeof svc.exportWordSectioned === 'function') {
                await svc.exportWordSectioned(sectionedConfig);
            } else {
                await this.exportService.exportWord(sectionedConfig as any);
            }
        } else {
            const svc: any = this.exportService;
            if (typeof svc.exportExcelSectioned === 'function') {
                svc.exportExcelSectioned(sectionedConfig);
            } else {
                this.exportService.exportExcel(sectionedConfig as any);
            }
        }
    }

    // ── Computed labels ──────────────────────────────────────────────────

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'MOTHER UNIT WISE MANPOWER STATE'
            : 'মাতৃ ইউনিট ভিত্তিক জনবলের সারাংশ';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${MotherUnitWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `${BanglaNumerals.toBangla(String(day))} ${MotherUnitWiseManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get serLabel(): string { return this.lang === 'en' ? 'Ser' : 'ক্রমিক'; }
    get unitLabel(): string { return this.lang === 'en' ? 'Mother Unit Name' : 'মাতৃ ইউনিটের নাম'; }
    get totalLabel(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }
    get grandTotalLabel(): string { return this.lang === 'en' ? 'GRAND TOTAL' : 'সর্ব মোট'; }

    rankLabel(rank: MotherUnitRankColumn): string {
        return this.lang === 'en' ? rank.rankName : (rank.rankNameBN || rank.rankName);
    }

    unitNameLabel(unit: MotherUnitRow): string {
        return this.lang === 'en' ? unit.unitName : (unit.unitNameBN || unit.unitName);
    }

    orgLabel(org: MotherUnitOrgBlock): string {
        return this.lang === 'en'
            ? org.orgName.toUpperCase()
            : (org.orgNameBN || org.orgName);
    }

    cellValue(unit: MotherUnitRow, rankId: number): number {
        return unit.rankCounts?.[rankId] ?? 0;
    }

    columnTotal(org: MotherUnitOrgBlock, rankId: number): number {
        return org.totals?.[rankId] ?? 0;
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    // ── PDF popup (one table per org + grand total) ──────────────────────

    private async exportPdfPopup(): Promise<void> {
        const fontFamily = this.lang === 'bn'
            ? "'Noto Sans Bengali', 'Nirmala UI', sans-serif"
            : "'Times New Roman', serif";
        const now = new Date();
        const dateStr = now.toLocaleDateString(this.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const orgTables = this.filteredOrgs.map(org => {
            const rankHeaders = org.ranks.map(r => `<th>${esc(this.rankLabel(r))}</th>`).join('');
            const bodyRows = org.units.map((unit, i) => {
                const cells = org.ranks
                    .map(r => `<td class="num">${esc(this.fmt(this.cellValue(unit, r.rankId)))}</td>`)
                    .join('');
                return `<tr>
                    <td class="num">${esc(this.fmt(i + 1))}</td>
                    <td class="name">${esc(this.unitNameLabel(unit))}</td>
                    ${cells}
                    <td class="num total-col">${esc(this.fmt(unit.total))}</td>
                </tr>`;
            }).join('');
            const totalCells = org.ranks
                .map(r => `<td class="num">${esc(this.fmt(this.columnTotal(org, r.rankId)))}</td>`)
                .join('');
            return `
            <div class="org-block">
                <div class="org-title">${esc(this.orgLabel(org))}</div>
                <table>
                    <thead><tr>
                        <th>${esc(this.serLabel)}</th>
                        <th>${esc(this.unitLabel)}</th>
                        ${rankHeaders}
                        <th>${esc(this.totalLabel)}</th>
                    </tr></thead>
                    <tbody>${bodyRows}</tbody>
                    <tfoot><tr class="total-row">
                        <td></td>
                        <td class="name" style="font-weight:700;text-align:right">${esc(this.totalLabel)}</td>
                        ${totalCells}
                        <td class="num" style="font-weight:700">${esc(this.fmt(org.grandTotal))}</td>
                    </tr></tfoot>
                </table>
            </div>`;
        }).join('');

        const grandHtml = `
            <div class="grand-total-block">
                <span class="grand-label">${esc(this.grandTotalLabel)}:</span>
                <span class="grand-value">${esc(this.fmt(this.grandTotal))}</span>
            </div>`;

        const scope = this.scopeLine;
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:0;width:1045px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box';
        container.innerHTML = `
            <div style="font-family:${fontFamily};font-size:9pt;color:#000;line-height:1.4;width:100%">
                <h1 style="font-size:14pt;font-weight:700;text-align:center;margin:0 0 3px 0">${esc(this.titleLabel)}</h1>
                ${scope ? `<div style="font-size:10pt;font-weight:600;text-align:center;margin:2px 0 6px 0;color:#1e3a5f">${esc(scope)}</div>` : ''}
                <div style="font-size:9pt;text-align:center;margin-bottom:14px">${esc(dateStr)}</div>
                ${orgTables}
                ${grandHtml}
            </div>`;
        // Apply table styles
        container.querySelectorAll<HTMLElement>('table').forEach(t => {
            t.style.cssText = 'width:100%;border-collapse:collapse;margin-bottom:14px';
        });
        container.querySelectorAll<HTMLElement>('.org-title').forEach(t => {
            t.style.cssText = 'font-size:11pt;font-weight:700;padding:4px 0;border-bottom:2px solid #000;margin:8px 0 4px 0';
        });
        container.querySelectorAll<HTMLElement>('th').forEach(el => {
            el.style.cssText = 'padding:4px 6px;text-align:center;font-size:9pt;font-weight:700;border:1px solid #000;white-space:nowrap;background:#fff;color:#000';
        });
        container.querySelectorAll<HTMLElement>('td').forEach(el => {
            el.style.cssText += ';padding:4px 6px;border:1px solid #000;font-size:9pt;color:#000';
        });
        container.querySelectorAll<HTMLElement>('td.num').forEach(el => { el.style.textAlign = 'center'; });
        container.querySelectorAll<HTMLElement>('td.name').forEach(el => { el.style.textAlign = 'left'; });
        container.querySelectorAll<HTMLElement>('.total-row td').forEach(el => { el.style.fontWeight = '700'; el.style.borderTop = '2px solid #000'; });
        container.querySelectorAll<HTMLElement>('.grand-total-block').forEach(el => {
            el.style.cssText = 'margin-top:6px;padding:8px 10px;border:2px solid #000;font-weight:700;font-size:11pt;text-align:right';
        });
        document.body.appendChild(container);

        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const scale = 2;
            const canvas = await html2canvas(container, {
                scale, useCORS: true, backgroundColor: '#ffffff',
                logging: false, scrollY: -window.scrollY,
                height: container.scrollHeight, windowHeight: container.scrollHeight
            });
            const imgWidth = canvas.width;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth() - 16;
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - 16;
            const ratio = pdfWidth / imgWidth;
            const maxSlicePx = Math.floor(pdfPageHeight / ratio);
            let srcY = 0;
            let page = 0;
            while (srcY < canvas.height) {
                const sliceH = Math.min(maxSlicePx, canvas.height - srcY);
                if (page > 0) pdf.addPage();
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = imgWidth;
                sliceCanvas.height = sliceH;
                sliceCanvas.getContext('2d')!.drawImage(canvas, 0, srcY, imgWidth, sliceH, 0, 0, imgWidth, sliceH);
                const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
                pdf.addImage(sliceData, 'JPEG', 8, 8, pdfWidth, sliceH * ratio);
                srcY += sliceH;
                page++;
            }
            const pdfBlob = pdf.output('blob');
            window.open(URL.createObjectURL(pdfBlob), '_blank');
        } finally {
            document.body.removeChild(container);
        }
    }

    // ── Print popup ──────────────────────────────────────────────────────

    private exportPrintPopup(): void {
        const fontFamily = this.lang === 'bn' ? "'Nirmala UI', serif" : "'Times New Roman', serif";
        const now = new Date();
        const dateStr = now.toLocaleDateString(this.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const orgTables = this.filteredOrgs.map(org => {
            const rankHeaders = org.ranks.map(r => `<th>${esc(this.rankLabel(r))}</th>`).join('');
            const bodyRows = org.units.map((unit, i) => {
                const cells = org.ranks
                    .map(r => `<td class="num">${esc(this.fmt(this.cellValue(unit, r.rankId)))}</td>`)
                    .join('');
                return `<tr>
                    <td class="num">${esc(this.fmt(i + 1))}</td>
                    <td class="name">${esc(this.unitNameLabel(unit))}</td>
                    ${cells}
                    <td class="num">${esc(this.fmt(unit.total))}</td>
                </tr>`;
            }).join('');
            const totalCells = org.ranks
                .map(r => `<td class="num">${esc(this.fmt(this.columnTotal(org, r.rankId)))}</td>`)
                .join('');
            return `
            <div class="org-block">
                <div class="org-title">${esc(this.orgLabel(org))}</div>
                <table>
                    <thead><tr>
                        <th>${esc(this.serLabel)}</th>
                        <th>${esc(this.unitLabel)}</th>
                        ${rankHeaders}
                        <th>${esc(this.totalLabel)}</th>
                    </tr></thead>
                    <tbody>${bodyRows}</tbody>
                    <tfoot><tr class="total-row">
                        <td></td>
                        <td class="name" style="font-weight:700;text-align:right">${esc(this.totalLabel)}</td>
                        ${totalCells}
                        <td class="num" style="font-weight:700">${esc(this.fmt(org.grandTotal))}</td>
                    </tr></tfoot>
                </table>
            </div>`;
        }).join('');

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(this.titleLabel)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${fontFamily}; font-size: 9pt; color: #000; background: #fff; padding: 15mm; }
    h1 { font-size: 14pt; font-weight: 700; text-align: center; margin-bottom: 3px; }
    .scope { font-size: 10pt; font-weight: 600; text-align: center; margin: 2px 0 6px 0; color: #1e3a5f; }
    .date { font-size: 9pt; text-align: center; margin-bottom: 18px; }
    .org-block { margin-bottom: 18px; page-break-inside: avoid; }
    .org-title { font-size: 11pt; font-weight: 700; padding: 4px 0; border-bottom: 2px solid #000; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 4px 6px; text-align: center; font-size: 9pt; font-weight: 700;
         border: 1px solid #000; white-space: nowrap; background: #fff; color: #000; }
    td { padding: 4px 6px; border: 1px solid #000; font-size: 9pt;
         background: #fff; color: #000; }
    td.num { text-align: center; }
    td.name { text-align: left; }
    .total-row td { font-weight: 700; border-top: 2px solid #000; }
    .grand-total-block { margin-top: 8px; padding: 8px 12px; border: 2px solid #000;
        font-weight: 700; font-size: 11pt; text-align: right; }
    @page { size: landscape; margin: 8mm 8mm 14mm 8mm;
        @bottom-center { content: "Page " counter(page) " of " counter(pages); font-family: ${fontFamily}; font-size: 7pt; color: #555; }
    }
    @media print {
        body { padding: 0; }
        .org-block { page-break-inside: avoid; }
    }
</style></head><body>
    <h1>${esc(this.titleLabel)}</h1>
    ${this.scopeLine ? `<div class="scope">${esc(this.scopeLine)}</div>` : ''}
    <div class="date">${esc(dateStr)}</div>
    ${orgTables}
    <div class="grand-total-block">${esc(this.grandTotalLabel)}: ${esc(this.fmt(this.grandTotal))}</div>
</body></html>`;

        const win = window.open('', '_blank', 'width=1100,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }
}
