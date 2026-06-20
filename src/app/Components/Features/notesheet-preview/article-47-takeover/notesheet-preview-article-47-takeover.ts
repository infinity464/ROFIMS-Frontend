import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, TableLayoutType,
    HeightRule
} from 'docx';
import { saveAs } from 'file-saver';
import { JsReportService } from '@/services/jsreport.service';

import { MovementInfoService } from '@/services/movement-info.service';
import { MovementInfoModel } from '@/models/movement-info.model';
import { EmpService } from '@/services/emp-service';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { MovementReturnButtonComponent } from '../shared/movement-return-button';
import { MovementFilesInfoComponent } from '../shared/movement-files-info';

@Component({
    selector: 'app-notesheet-preview-article-47-takeover',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, SelectModule, Toast, MovementReturnButtonComponent, MovementFilesInfoComponent],
    providers: [MessageService],
    templateUrl: './notesheet-preview-article-47-takeover.html',
    styleUrls: ['../notesheet-preview.scss', '../notesheet-preview-toolbar-dark.scss']
})
export class NotesheetPreviewArticle47TakeoverComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private movementService = inject(MovementInfoService);
    private empService = inject(EmpService);
    private servingMembersService = inject(ServingMembersService);
    private masterBasicSetup = inject(MasterBasicSetupService);
    private messageService = inject(MessageService);
    private http = inject(HttpClient);
    private jsreportService = inject(JsReportService);

    @ViewChild('paper') paper!: ElementRef<HTMLDivElement>;

    /** Export state. */
    exportingPdf = false;
    printingPreview = false;
    pageSizeOptions = [
        { label: 'Legal',  value: 'Legal'  },
        { label: 'A4',     value: 'A4'     },
        { label: 'Letter', value: 'Letter' }
    ];
    selectedPageSize: 'Legal' | 'A4' | 'Letter' = 'Legal';

    loading = true;
    error: string | null = null;
    movement: MovementInfoModel | null = null;

    /** First (and only, for Article 47) employee on the movement — used in the signature block. */
    employee: EmployeeSearchInfoModel | null = null;
    /** EmployeeServiceOverview row — same source as /presently-serving-members. */
    overview: EmployeeServiceOverview | null = null;
    /** Per-employee personal overview — reliable prefix source (CommonCode label + id). */
    personalOverview: any | null = null;
    /** MotherOrgRank id → labels map (English + Bangla). */
    private rankLabels = new Map<number, { en: string; bn: string }>();
    /** RabUnit id → labels map (English + Bangla). */
    private rabUnitLabels = new Map<number, { en: string; bn: string }>();
    /** Corps id → labels map (English + Bangla). */
    private corpsLabels = new Map<number, { en: string; bn: string }>();
    /** Battalion HQ location for the employee's RAB unit (English / Bangla). */
    battalionHqEn = '';
    battalionHqBn = '';

    /** Final recipient list rendered in the letter: stored items 1–4, then the
     *  two dynamic entries (Adhinayak + FC Army Pay-1) at slots 5–6, then stored
     *  items Personal/Office Copy at slots 7–8. */
    recipientLines: string[] = [];

    /** Memo number shown top-left (uses LetterNo when set, falls back to '---'). */
    memoNoBn = '---';
    /** Date shown top-right (Bangla, derived from LetterDate or today). */
    letterDateBn = '';

    ngOnInit(): void {
        this.loadRankLabels();
        this.loadRabUnitLabels();
        this.loadCorpsLabels();
        const idParam = this.route.snapshot.queryParamMap.get('id');
        const id = idParam ? Number(idParam) : NaN;
        if (!Number.isFinite(id) || id <= 0) {
            this.error = 'Missing or invalid movement id (?id=N).';
            this.loading = false;
            return;
        }

        this.movementService.getById(id).subscribe({
            next: (data) => {
                const row: any = Array.isArray(data) ? data[0] : data;
                if (!row || !row.movementId) {
                    this.error = `Movement #${id} not found.`;
                    this.loading = false;
                    return;
                }
                this.movement = row as MovementInfoModel;
                this.buildRecipientList();
                this.buildHeaderLines();
                this.loadEmployee();
                this.loading = false;
            },
            error: (err) => {
                console.error('Failed to load movement', err);
                this.error = err?.error?.message || 'Failed to load movement.';
                this.loading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: this.error || 'Failed to load movement.'
                });
            }
        });
    }

    /** Pull the first employee id from EmployeeIds JSON and load search info,
     *  then chain a serving-members overview lookup to get the RAB unit name. */
    private loadEmployee(): void {
        const ids = this.parseIntArray(this.movement?.employeeIds);
        const firstId = ids.length > 0 ? ids[0] : 0;
        if (!firstId) return;
        this.empService.getEmployeeSearchInfo(firstId).subscribe({
            next: (info) => {
                this.employee = info ?? null;
                this.loadOverview();
            },
            error: () => { this.employee = null; }
        });

        // EmployeeInfo.Prefix is a CommonCode id; the personal overview carries
        // both the id and the resolved CommonCode label for every employee
        // (serving or not), so use it as the prefix source.
        this.servingMembersService.getEmployeePersonalServiceOverview(firstId).subscribe({
            next: (po: any) => { this.personalOverview = po ?? null; },
            error: () => { this.personalOverview = null; }
        });
    }

    /** Load EmployeeServiceOverview row (same source as /presently-serving-members)
     *  so we can pull the RAB unit display name. Filters by RAB ID or Service ID. */
    private loadOverview(): void {
        const e: any = this.employee || {};
        const rabId: string = e.rabID ?? e.RABID ?? '';
        const serviceId: string = e.serviceId ?? e.ServiceId ?? '';
        if (!rabId && !serviceId) return;

        this.servingMembersService.getPresentlyServingMembersPaginatedFiltered({
            pagination: { page_no: 1, row_per_page: 5 },
            filter: rabId ? { rabId } : { serviceId }
        }).subscribe({
            next: (res: any) => {
                const list: EmployeeServiceOverview[] =
                    (res?.datalist ?? res?.data ?? res ?? []) as EmployeeServiceOverview[];
                this.overview = Array.isArray(list) && list.length ? list[0] : null;
                this.loadBattalionHq();
            },
            error: () => { this.overview = null; }
        });
    }

    /** Look up the Battalion HQ location for the employee's RAB unit — same source
     *  the leave card uses (RABUnitAOR.locationOfBattalionHQ[Bangla]). */
    private loadBattalionHq(): void {
        const rabUnitId = (this.overview as any)?.rabUnitId ?? (this.overview as any)?.RabUnitId;
        if (!rabUnitId) return;
        this.masterBasicSetup.getRABUnitAORByRabUnit(rabUnitId).subscribe({
            next: (rows: any[]) => {
                if (!Array.isArray(rows) || rows.length === 0) return;
                const firstEn = rows.find((r) => !!(r?.locationOfBattalionHQ ?? r?.LocationOfBattalionHQ));
                if (firstEn) this.battalionHqEn = String(firstEn.locationOfBattalionHQ ?? firstEn.LocationOfBattalionHQ ?? '');
                const firstBn = rows.find((r) => !!(r?.locationOfBattalionHQBangla ?? r?.LocationOfBattalionHQBangla));
                if (firstBn) this.battalionHqBn = String(firstBn.locationOfBattalionHQBangla ?? firstBn.LocationOfBattalionHQBangla ?? '');
            }
        });
    }

    /** Cache Corps id → labels so we can render the corps name in Bangla. */
    private loadCorpsLabels(): void {
        this.masterBasicSetup.getAllByType('Corps').subscribe({
            next: (rows: any[]) => {
                this.corpsLabels.clear();
                for (const r of rows || []) {
                    const id = r.codeId ?? r.CodeId;
                    if (id == null) continue;
                    this.corpsLabels.set(id, {
                        en: r.codeValueEN ?? r.CodeValueEN ?? '',
                        bn: r.codeValueBN ?? r.CodeValueBN ?? ''
                    });
                }
            }
        });
    }

    /** Cache RabUnit id → labels so we can render the unit name in Bangla. */
    private loadRabUnitLabels(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (rows: any[]) => {
                this.rabUnitLabels.clear();
                for (const r of rows || []) {
                    const id = r.codeId ?? r.CodeId;
                    if (id == null) continue;
                    this.rabUnitLabels.set(id, {
                        en: r.codeValueEN ?? r.CodeValueEN ?? '',
                        bn: r.codeValueBN ?? r.CodeValueBN ?? ''
                    });
                }
            }
        });
    }

    /** Cache MotherOrgRank id → labels so we can render the rank in Bangla. */
    private loadRankLabels(): void {
        this.masterBasicSetup.getAllByType('MotherOrgRank').subscribe({
            next: (rows: any[]) => {
                this.rankLabels.clear();
                for (const r of rows || []) {
                    const id = r.codeId ?? r.CodeId;
                    if (id == null) continue;
                    this.rankLabels.set(id, {
                        en: r.codeValueEN ?? r.CodeValueEN ?? '',
                        bn: r.codeValueBN ?? r.CodeValueBN ?? ''
                    });
                }
            }
        });
    }

    /** Field accessors for the signature block. Fall back to placeholders when empty. */
    get employeeIdLineBn(): string {
        const e = this.employee as any;
        const o = this.overview as any;
        const po = this.personalOverview as any;
        const id = e ? (e.rabID ?? e.RABID ?? e.serviceId ?? e.ServiceId ?? '') : '';

        // Prefix is the CommonCode label behind EmployeeInfo.Prefix (an id), not a
        // fixed "বিডি". Resolve from the personal overview, then the serving-members
        // overview, falling back to '' when genuinely absent.
        const prefix = (po?.prefixBN || po?.PrefixBN || po?.prefixEN || po?.PrefixEN || po?.prefix || po?.Prefix
            || o?.prefixBN || o?.PrefixBN || o?.prefix || o?.Prefix || '') as string;

        if (!id) return prefix ? `${prefix}/-----` : '-----';
        return prefix ? `${prefix}/${this.toBn(id)}` : this.toBn(id);
    }
    get employeeRankBn(): string {
        const e = this.employee as any;
        const o = this.overview as any;
        const rankId: number | undefined =
            o?.armyRankId ?? o?.ArmyRankId ?? e?.rankId ?? e?.RankId;
        if (rankId != null) {
            const labels = this.rankLabels.get(rankId);
            if (labels?.bn) return labels.bn;
            if (labels?.en) return labels.en;
        }
        return (e?.rank ?? e?.Rank ?? o?.armyRank ?? o?.ArmyRank ?? 'ক্ষোয়াড্রন লীডার') as string;
    }
    get employeeNameBn(): string {
        const e = this.employee as any;
        if (!e) return '-- -- --';
        return (e.fullNameBN ?? e.FullNameBN ?? e.fullNameEN ?? e.FullNameEN ?? '-- -- --') as string;
    }
    get employeeCorpsBn(): string {
        const e = this.employee as any;
        const o = this.overview as any;
        const corpsId: number | undefined =
            o?.corpsId ?? o?.CorpsId ?? e?.branchId ?? e?.BranchId;
        let value = '';
        if (corpsId != null) {
            const labels = this.corpsLabels.get(corpsId);
            value = labels?.bn || labels?.en || '';
        }
        if (!value) {
            value = (e?.corps ?? e?.Corps ?? o?.corps ?? o?.Corps ?? '') as string;
        }
        // Don't render a "not applicable" placeholder as a corps name.
        return this.isNotApplicable(value) ? '' : value;
    }

    /** True when a label is an N/A placeholder (in either language) and shouldn't be shown. */
    private isNotApplicable(value: string | null | undefined): boolean {
        const v = (value ?? '').trim().toLowerCase();
        return v === '' || v === 'n/a' || v === 'na' || v === 'অপ্রযোজ্য';
    }
    get employeeUnitBn(): string {
        const o = this.overview as any;
        const rabUnitId: number | undefined = o?.rabUnitId ?? o?.RabUnitId;
        if (rabUnitId != null) {
            const labels = this.rabUnitLabels.get(rabUnitId);
            if (labels?.bn) return labels.bn;
            if (labels?.en) return labels.en;
        }
        const rabUnit = (o?.rabUnit ?? o?.RabUnit ?? '') as string;
        return rabUnit || 'র‍্যাব ফোর্সেস সদর দপ্তর';
    }

    /** Second signature line under the RAB Unit — Battalion HQ location. */
    get employeeUnitLocationBn(): string {
        if (this.battalionHqBn) return this.battalionHqBn;
        if (this.battalionHqEn) return this.battalionHqEn;
        const o = this.overview as any;
        return (o?.location ?? o?.Location ?? '') as string;
    }

    private parseIntArray(json: string | null | undefined): number[] {
        if (!json) return [];
        try {
            const arr = JSON.parse(json);
            return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
        } catch {
            return [];
        }
    }

    private buildRecipientList(): void {
        // The MovementInfo form now stores a free-form JSON array of strings
        // (one line per recipient, in print order). Render verbatim.
        this.recipientLines = this.parseStringArray(this.movement?.letterRecipients);
    }

    private buildHeaderLines(): void {
        this.memoNoBn = this.movement?.letterNo
            ? this.toBn(this.movement.letterNo)
            : '---';

        const d = this.movement?.letterDate ? new Date(this.movement.letterDate) : new Date();
        this.letterDateBn = `তারিখঃ ${this.formatBnDate(d)}।`;
    }

    /** Returns "DD MonthBn YYYY" in Bangla numerals. */
    private formatBnDate(d: Date): string {
        const months = [
            'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
            'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
        ];
        const day = BanglaNumerals.toBangla(String(d.getDate()).padStart(2, '0'));
        const month = months[d.getMonth()];
        const year = BanglaNumerals.toBangla(String(d.getFullYear()));
        return `${day} ${month} ${year}`;
    }

    /** Convenience used in template too. */
    toBn(input: string | number | null | undefined): string {
        if (input == null) return '';
        return BanglaNumerals.toBangla(String(input));
    }

    /** Numbered prefix in Bangla ("১।", "২।", …). */
    serialBn(n: number): string {
        return `${BanglaNumerals.toBangla(String(n))}।`;
    }

    private parseStringArray(json: string | null | undefined): string[] {
        if (!json) return [];
        try {
            const arr = JSON.parse(json);
            return Array.isArray(arr)
                ? arr.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0)
                : [];
        } catch {
            return [];
        }
    }

    onPrint(): void {
        window.print();
    }

    onEdit(): void {
        if (!this.movement?.movementId) return;
        this.router.navigate(['/movement-info'], { queryParams: { id: this.movement.movementId } });
    }

    onBack(): void {
        this.router.navigate(['/movement-list']);
    }

    // ── Export ─────────────────────────────────────────────────────────────

    private exportFileStem(): string {
        const raw = this.movement?.letterNo;
        if (raw && raw.trim()) return raw.replace(/[\\/:*?"<>|]+/g, '_').trim();
        return `Article47_Takeover_${this.movement?.movementId ?? 'export'}`;
    }

    async exportWord(): Promise<void> {
        if (!this.movement) return;
        try {
            const doc = this.buildWordDocument();
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `${this.exportFileStem()}.docx`);
        } catch (err) {
            console.error('Word export failed', err);
            this.messageService.add({ severity: 'error', summary: 'Export Error', detail: 'Failed to generate Word document.' });
        }
    }

    // ─── PDF download via JsReport (chrome-pdf, exact web view) ──
    async exportPdf(): Promise<void> {
        if (!this.movement || !this.paper) return;
        this.exportingPdf = true;
        try {
            const { html, chrome } = this.buildJsReportPdf();
            await this.jsreportService.downloadPdf(html, {}, `${this.exportFileStem()}.pdf`, chrome);
        } catch (err: any) {
            this.messageService.add({
                severity: 'error', summary: 'JsReport error',
                detail: err?.message || 'Failed to render PDF via JsReport. Is the server reachable?'
            });
        } finally {
            this.exportingPdf = false;
        }
    }

    // ─── Print Preview via JsReport (chrome-pdf, new tab) ──
    async printPreview(): Promise<void> {
        if (!this.movement || !this.paper) return;
        this.printingPreview = true;
        try {
            const { html, chrome } = this.buildJsReportPdf();
            await this.jsreportService.previewPdfInNewTab(html, {}, this.exportFileStem(), chrome);
        } catch (err: any) {
            this.messageService.add({
                severity: 'error', summary: 'JsReport error',
                detail: err?.message || 'Failed to render PDF via JsReport. Is the server reachable?'
            });
        } finally {
            this.printingPreview = false;
        }
    }

    /**
     * Build chrome-pdf HTML + chrome options reproducing the on-screen
     * `.a4-paper` exactly. Ships every same-origin stylesheet so Chromium
     * applies the scoped CSS; @page insets mirror .a4-paper's padding so the
     * text column matches the web view.
     */
    private buildJsReportPdf(): { html: string; chrome: Record<string, unknown> } {
        const styles = this.collectDocumentStyles();
        const body = this.paper.nativeElement.innerHTML;
        const sz = this.selectedPageSize;
        const pageWidth = sz === 'A4' ? '210mm' : '215.9mm';
        const pageHeight = sz === 'A4' ? '297mm' : sz === 'Letter' ? '279.4mm' : '355.6mm';
        const colWidth = sz === 'A4' ? '190mm' : '195.9mm';
        const padX = 10, padTop = 14, padBottom = 20; // mm — .a4-paper padding

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${styles}

@page { size: ${pageWidth} ${pageHeight}; margin: ${padTop}mm ${padX}mm ${padBottom}mm ${padX}mm; }
html, body { margin: 0; padding: 0; background: transparent; }

.no-print, .preview-header, .preview-actions { display: none !important; }

.pdf-flow {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    width: ${colWidth};
    font-family: 'Times New Roman', 'SolaimanLipi', 'Noto Sans Bengali', 'Nirmala UI', 'Vrinda', 'Shonar Bangla', Times, serif;
    font-size: 10pt;
    line-height: 1.7;
    color: #000;
}
</style>
</head>
<body>
<div class="pdf-flow">${body}</div>
</body>
</html>`;

        const chrome: Record<string, unknown> = {
            format: null,
            width: pageWidth,
            height: pageHeight,
            landscape: false,
            marginTop: '0', marginBottom: '0', marginLeft: '0', marginRight: '0',
            printBackground: true,
            displayHeaderFooter: false,
            headerTemplate: '', footerTemplate: ''
        };

        return { html, chrome };
    }

    /** Concatenate every same-origin stylesheet loaded into the page. */
    private collectDocumentStyles(): string {
        const out: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
            } catch { /* cross-origin — skip */ }
        }
        return out.join('\n');
    }

    private getPageDimensions(): { width: number; height: number } {
        switch (this.selectedPageSize) {
            case 'A4':     return { width: 11906, height: 16838 };
            case 'Letter': return { width: 12240, height: 15840 };
            case 'Legal':
            default:       return { width: 12240, height: 20160 };
        }
    }

    /** Build the Article 47 Takeover Word document (portrait). */
    private buildWordDocument(): Document {
        const m = this.movement!;
        const font = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const dims = this.getPageDimensions();
        const contentWidth = dims.width - 1440;

        const SZ_BODY = 20;
        const SZ_ORG  = 18;

        const noBorder = {
            top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        };

        const para = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingBefore?: number; lineTwips?: number } = {}) => {
            const sz = opts.size ?? SZ_BODY;
            const hasSpacing = opts.spacingBefore != null || opts.lineTwips != null;
            const spacing: any = hasSpacing ? {} : undefined;
            if (hasSpacing) {
                if (opts.spacingBefore != null) spacing.before = opts.spacingBefore;
                if (opts.lineTwips != null) {
                    spacing.line = opts.lineTwips;
                    spacing.lineRule = 'atLeast';
                }
            }
            return new Paragraph({
                alignment: opts.align,
                spacing,
                children: [new TextRun({ text, bold: opts.bold, size: sz, sizeComplexScript: sz, font, language: bnLang })]
            });
        };

        // Keep ZWJ/ZWNJ — words like "র‍্যাব" need ZWJ to render correctly.
        // Only normalize Unicode (NFC) and turn NBSP into a regular space.
        const cleanText = (s: string): string =>
            s.trim().normalize('NFC').replace(/ /g, ' ');

        /** Convert Quill HTML into docx Paragraphs, one per top-level <p>
         *  (preserves blank lines from `<p><br></p>` as empty paragraphs).
         *  Falls back to a single paragraph when no <p> tags are present. */
        const htmlToParagraphs = (html: string | null | undefined, opts: { size?: number; lineTwips?: number; firstPrefix?: string } = {}): Paragraph[] => {
            if (!html) return [];
            const div = document.createElement('div');
            div.innerHTML = html;
            const blocks = Array.from(div.querySelectorAll('p, div'));
            const sourceTexts = blocks.length > 0
                ? blocks.map((el) => cleanText(el.textContent || ''))
                : [cleanText(div.textContent || '')];
            return sourceTexts.map((t, idx) => {
                const prefix = idx === 0 && opts.firstPrefix ? opts.firstPrefix : '';
                return para(prefix + t, { size: opts.size, lineTwips: opts.lineTwips });
            });
        };

        const formHeader = para('বাংলাদেশ ফরম নং-২৪০৩', { size: SZ_ORG });

        // Memo + date row
        const memoLeftW = Math.round(contentWidth * 0.65);
        const memoRightW = contentWidth - memoLeftW;
        const memoRow = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [memoLeftW, memoRightW],
            layout: TableLayoutType.FIXED,
            borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [new TableRow({ children: [
                new TableCell({ width: { size: memoLeftW, type: WidthType.DXA }, borders: noBorder, children: [para(`স্মারক নং- ${this.memoNoBn}`)] }),
                new TableCell({ width: { size: memoRightW, type: WidthType.DXA }, borders: noBorder, children: [para(this.letterDateBn, { align: AlignmentType.RIGHT })] })
            ] })]
        });

        // সূত্র (Takeover — BEFORE প্রতি). Convert Quill HTML into one
        // Paragraph per <p> so paragraph breaks render correctly in Word.
        const sutroParas = m.auth
            ? htmlToParagraphs(m.auth, { lineTwips: 280, firstPrefix: 'সূত্র: ' })
            : [para('সূত্র: ---', { lineTwips: 280 })];

        // প্রতি block
        const recipientCellW = contentWidth - 1000;
        const recipientRows = this.recipientLines.map((line, idx) => new TableRow({ children: [
            new TableCell({ width: { size: 600, type: WidthType.DXA }, borders: noBorder, margins: { top: 20, bottom: 20, left: 0, right: 0 }, children: [para(this.serialBn(idx + 1))] }),
            new TableCell({ width: { size: recipientCellW - 600, type: WidthType.DXA }, borders: noBorder, margins: { top: 20, bottom: 20, left: 0, right: 0 }, children: [para(line)] })
        ] }));
        const recipientTable = recipientRows.length > 0
            ? new Table({
                width: { size: recipientCellW, type: WidthType.DXA },
                columnWidths: [600, recipientCellW - 600],
                layout: TableLayoutType.FIXED,
                indent: { size: 1000, type: WidthType.DXA },
                borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
                rows: recipientRows
            })
            : null;

        // Remarks — preserve Quill paragraph structure (matches web).
        const remarksParas = htmlToParagraphs(m.remarks, { lineTwips: 280 });
        const ogragami = para('অগ্রগামী করা হইল।', { spacingBefore: 480 });

        // Signature block — right-side nested table so the content sits on the
        // right with its lines centered inside (mirrors the web layout).
        const sigLeftW = Math.round(contentWidth * 0.6);
        const sigRightW = contentWidth - sigLeftW;
        const sigInnerParas: Paragraph[] = [];
        sigInnerParas.push(para('গ্রহণকারী কর্মকর্তা', { align: AlignmentType.CENTER, spacingBefore: 240 }));
        sigInnerParas.push(para('________________________', { align: AlignmentType.CENTER, spacingBefore: 720 }));
        sigInnerParas.push(para(`${this.employeeIdLineBn} ${this.employeeRankBn}`.trim(), { align: AlignmentType.CENTER }));
        sigInnerParas.push(para(`${this.employeeNameBn}${this.employeeCorpsBn ? ', ' + this.employeeCorpsBn : ''}`, { align: AlignmentType.CENTER }));
        sigInnerParas.push(para(this.employeeUnitBn, { align: AlignmentType.CENTER }));
        if (this.employeeUnitLocationBn) sigInnerParas.push(para(this.employeeUnitLocationBn, { align: AlignmentType.CENTER }));
        const sigRow = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [sigLeftW, sigRightW],
            layout: TableLayoutType.FIXED,
            borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [new TableRow({ children: [
                new TableCell({ width: { size: sigLeftW, type: WidthType.DXA }, borders: noBorder, children: [para('')] }),
                new TableCell({ width: { size: sigRightW, type: WidthType.DXA }, borders: noBorder, children: sigInnerParas })
            ] })]
        });

        // Witness / Rule 78 — three blank ruled lines + one inline-filled line.
        const witnessParas: (Paragraph | Table)[] = [];
        witnessParas.push(para('বেসামরিক হিসাব পদ্ধতির ৭৮ নং বিধি অনুযায়ী আমি (গ্রহণকারী কর্মকর্তা)', { spacingBefore: 480 }));

        // Three blank dotted ruled lines — built as a Table with 3 rows so
        // each row's bottom border renders distinctly. Adjacent
        // Paragraph-with-border-bottom collapse into one line in Word.
        const ruledCellBorder = {
            top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.DOTTED, size: 6, color: '000000' },
            left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
        };
        const ruledRow = () => new TableRow({
            height: { value: 360, rule: HeightRule.ATLEAST }, // 18pt per row
            children: [new TableCell({
                width: { size: contentWidth, type: WidthType.DXA },
                borders: ruledCellBorder,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: [para(' ')]
            })]
        });
        witnessParas.push(new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [contentWidth],
            layout: TableLayoutType.FIXED,
            borders: {
                top:              { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                bottom:           { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                left:             { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                right:            { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
            },
            rows: [ruledRow(), ruledRow(), ruledRow()]
        }));
        witnessParas.push(new Paragraph({
            spacing: { before: 180, line: 280, lineRule: 'atLeast' as any },
            children: [
                new TextRun({ text: 'সমুদয় স্থায়ী অগ্রিম লেনদেনের টাকা গ্রহণের প্রাপ্তি স্বীকার দিলাম ', size: SZ_BODY, sizeComplexScript: SZ_BODY, font, language: bnLang }),
                new TextRun({ text: ' '.repeat(40), underline: { type: 'dotted' as any }, size: SZ_BODY, font, language: bnLang }),
                new TextRun({ text: '  জেলা', size: SZ_BODY, sizeComplexScript: SZ_BODY, font, language: bnLang })
            ]
        }));

        const tailLeftW = Math.round(contentWidth * 0.7);
        const tailRightW = contentWidth - tailLeftW;
        const tailRow = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [tailLeftW, tailRightW],
            layout: TableLayoutType.FIXED,
            borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [new TableRow({ children: [
                new TableCell({ width: { size: tailLeftW, type: WidthType.DXA }, borders: noBorder, children: [para('জেলাঃ', { spacingBefore: 120 })] }),
                new TableCell({ width: { size: tailRightW, type: WidthType.DXA }, borders: noBorder, children: [para('স্বাক্ষরঃ', { spacingBefore: 120 })] })
            ] })]
        });

        const children: (Paragraph | Table)[] = [
            formHeader,
            // 2-line gap between form header and স্মারক নং / তারিখ row.
            para(''),
            para(''),
            memoRow,
            // 2 empty lines above সূত্র.
            para(''),
            para(''),
            ...sutroParas,
            // 2 empty lines below সূত্র.
            para(''),
            para(''),
            para('প্রতি,'),
            ...(recipientTable ? [recipientTable] : []),
            ...remarksParas,
            ogragami,
            sigRow,
            ...witnessParas,
            tailRow
        ];

        return new Document({
            styles: { default: { document: { run: { font, language: bnLang } } } },
            sections: [{
                properties: {
                    page: {
                        size: { width: dims.width, height: dims.height, orientation: PageOrientation.PORTRAIT },
                        margin: { top: 720, bottom: 720, left: 720, right: 720 }
                    }
                },
                children
            }]
        });
    }
}
