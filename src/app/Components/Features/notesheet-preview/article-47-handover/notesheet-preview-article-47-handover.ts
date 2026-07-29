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
import { embedBanglaFontCss, collectDocumentStyles, BANGLA_DOC_FONT_STACK } from '@/shared/utils/bangla-font.util';

import { MovementInfoService } from '@/services/movement-info.service';
import { MovementInfoModel } from '@/models/movement-info.model';
import { EmpService } from '@/services/emp-service';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { MoveOrderType } from '@/models/enums';
import { MovementReturnButtonComponent } from '../shared/movement-return-button';
import { MovementFilesInfoComponent } from '../shared/movement-files-info';

@Component({
    selector: 'app-notesheet-preview-article-47-handover',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, SelectModule, Toast, MovementReturnButtonComponent, MovementFilesInfoComponent],
    providers: [MessageService],
    templateUrl: './notesheet-preview-article-47-handover.html',
    // Own stylesheet LAST — it overrides the shared .a4-paper side padding.
    styleUrls: ['../notesheet-preview.scss', '../notesheet-preview-toolbar-dark.scss', './notesheet-preview-article-47-handover.scss']
})
export class NotesheetPreviewArticle47HandoverComponent implements OnInit {
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
        { label: 'A4',     value: 'A4'     }
    ];
    selectedPageSize: 'Legal' | 'A4' | 'Letter' = 'A4';

    loading = true;
    error: string | null = null;
    movement: MovementInfoModel | null = null;

    /** First (and only, for Article 47) employee on the movement — used in the signature block. */
    employee: EmployeeSearchInfoModel | null = null;
    /** EmployeeServiceOverview row — same source as /presently-serving-members.
     *  Used to pull the RAB unit display name. */
    overview: EmployeeServiceOverview | null = null;
    /** Per-employee personal overview — reliable prefix source (CommonCode label + id). */
    personalOverview: any | null = null;
    /** MotherOrgRank id → label map (English + Bangla). */
    private rankLabels = new Map<number, { en: string; bn: string }>();
    /** RabUnit id → label map (English + Bangla). */
    private rabUnitLabels = new Map<number, { en: string; bn: string }>();
    /** Corps id → label map (English + Bangla). */
    private corpsLabels = new Map<number, { en: string; bn: string }>();
    /** Battalion HQ location for the employee's RAB unit (English / Bangla). */
    battalionHqEn = '';
    battalionHqBn = '';

    /** First Final Approver on the movement — rendered as the left signature block,
     *  in the same shape as the member's block on the right. Same three sources the
     *  member uses: search info, serving-members overview and personal overview. */
    approver: EmployeeSearchInfoModel | null = null;
    approverOverview: EmployeeServiceOverview | null = null;
    approverPersonalOverview: any | null = null;
    approverBattalionHqEn = '';
    approverBattalionHqBn = '';
    /** True once an approver has been resolved — the left block is hidden until then. */
    get hasApprover(): boolean {
        return this.approver != null;
    }

    /** Final recipient list — same positioning rule as Takeover. */
    recipientLines: string[] = [];

    memoNoBn = '---';
    letterDateBn = '';

    ngOnInit(): void {
        // Load rank + RAB-unit + corps labels once for Bangla rendering of the signature block.
        this.loadRankLabels();
        this.loadRabUnitLabels();
        this.loadLetterConfigs();
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
                this.loadApprover();
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

    /** Pull the first employee id from EmployeeIds JSON and load search info for it,
     *  then chain a serving-members overview lookup so we get the RAB unit name. */
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

    /** Load the EmployeeServiceOverview row for the employee (matches /presently-serving-members
     *  data) so we can pull the RAB unit name. Filters by RAB ID or Service ID. */
    /** Same three lookups as loadEmployee(), for the first Final Approver. */
    private loadApprover(): void {
        const ids = this.parseIntArray(this.movement?.finalApproverIds);
        const firstId = ids.length > 0 ? ids[0] : 0;
        if (!firstId) return;

        this.empService.getEmployeeSearchInfo(firstId).subscribe({
            next: (info) => {
                this.approver = info ?? null;
                this.loadApproverOverview();
            },
            error: () => { this.approver = null; }
        });

        this.servingMembersService.getEmployeePersonalServiceOverview(firstId).subscribe({
            next: (po: any) => { this.approverPersonalOverview = po ?? null; },
            error: () => { this.approverPersonalOverview = null; }
        });
    }

    private loadApproverOverview(): void {
        const e: any = this.approver || {};
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
                this.approverOverview = Array.isArray(list) && list.length ? list[0] : null;
                this.loadApproverBattalionHq();
            },
            error: () => { this.approverOverview = null; }
        });
    }

    /** GetByRabUnit returns an ARRAY of AOR rows — take the first carrying a value. */
    private loadApproverBattalionHq(): void {
        const rabUnitId = (this.approverOverview as any)?.rabUnitId ?? (this.approverOverview as any)?.RabUnitId;
        if (!rabUnitId) return;
        this.masterBasicSetup.getRABUnitAORByRabUnit(rabUnitId).subscribe({
            next: (rows: any[]) => {
                if (!Array.isArray(rows) || rows.length === 0) return;
                const firstEn = rows.find((r) => !!(r?.locationOfBattalionHQ ?? r?.LocationOfBattalionHQ));
                if (firstEn) this.approverBattalionHqEn = String(firstEn.locationOfBattalionHQ ?? firstEn.LocationOfBattalionHQ ?? '');
                const firstBn = rows.find((r) => !!(r?.locationOfBattalionHQBangla ?? r?.LocationOfBattalionHQBangla));
                if (firstBn) this.approverBattalionHqBn = String(firstBn.locationOfBattalionHQBangla ?? firstBn.LocationOfBattalionHQBangla ?? '');
            },
            error: () => { /* leave blank */ }
        });
    }

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

    /* ── Signature-block fields ─────────────────────────────────────────────────
       Built once against an (employee, overview, personalOverview) triple so the
       member block on the right and the approver block on the left render
       identically from their own sources. */

    private idLineBn(emp: any, ovw: any, personal: any): string {
        const id = emp ? (emp.rabID ?? emp.RABID ?? emp.serviceId ?? emp.ServiceId ?? '') : '';

        // Prefix is the CommonCode label behind EmployeeInfo.Prefix (an id), not a
        // fixed value. Resolve from the personal overview, then the serving-members
        // overview, falling back to '' when genuinely absent.
        const prefix = (personal?.prefixBN || personal?.PrefixBN || personal?.prefixEN || personal?.PrefixEN
            || personal?.prefix || personal?.Prefix
            || ovw?.prefixBN || ovw?.PrefixBN || ovw?.prefix || ovw?.Prefix || '') as string;

        if (!id) return prefix ? `${prefix}-----` : '-----';
        return prefix ? `${prefix}-${this.toBn(id)}` : this.toBn(id);
    }

    private rankBn(emp: any, ovw: any): string {
        // Prefer overview.armyRankId (matches /presently-serving-members);
        // fall back to search-info rankId. Look up the Bangla label from the map.
        const rankId: number | undefined = ovw?.armyRankId ?? ovw?.ArmyRankId ?? emp?.rankId ?? emp?.RankId;
        if (rankId != null) {
            const labels = this.rankLabels.get(rankId);
            if (labels?.bn) return labels.bn;
            if (labels?.en) return labels.en;
        }
        return (emp?.rank ?? emp?.Rank ?? ovw?.armyRank ?? ovw?.ArmyRank ?? 'ক্যাপ্টেন') as string;
    }

    private nameBn(emp: any): string {
        if (!emp) return '-- -- --';
        return (emp.fullNameBN ?? emp.FullNameBN ?? emp.fullNameEN ?? emp.FullNameEN ?? '-- -- --') as string;
    }

    private corpsBn(emp: any, ovw: any): string {
        const corpsId: number | undefined = ovw?.corpsId ?? ovw?.CorpsId ?? emp?.branchId ?? emp?.BranchId;
        let value = '';
        if (corpsId != null) {
            const labels = this.corpsLabels.get(corpsId);
            value = labels?.bn || labels?.en || '';
        }
        if (!value) {
            value = (emp?.corps ?? emp?.Corps ?? ovw?.corps ?? ovw?.Corps ?? '') as string;
        }
        // Don't render a "not applicable" placeholder as a corps name.
        return this.isNotApplicable(value) ? '' : value;
    }

    private unitBn(ovw: any): string {
        const rabUnitId: number | undefined = ovw?.rabUnitId ?? ovw?.RabUnitId;
        if (rabUnitId != null) {
            const labels = this.rabUnitLabels.get(rabUnitId);
            if (labels?.bn) return labels.bn;
            if (labels?.en) return labels.en;
        }
        const rabUnit = (ovw?.rabUnit ?? ovw?.RabUnit ?? '') as string;
        return rabUnit || 'র‍্যাব ফোর্সেস সদর দপ্তর';
    }

    private unitLocationBn(ovw: any, hqBn: string, hqEn: string): string {
        if (hqBn) return hqBn;
        if (hqEn) return hqEn;
        return (ovw?.location ?? ovw?.Location ?? '') as string;
    }

    /** True when a label is an N/A placeholder (in either language) and shouldn't be shown. */
    private isNotApplicable(value: string | null | undefined): boolean {
        const v = (value ?? '').trim().toLowerCase();
        return v === '' || v === 'n/a' || v === 'na' || v === 'অপ্রযোজ্য';
    }

    // Member (right-hand block).
    get employeeIdLineBn(): string { return this.idLineBn(this.employee, this.overview, this.personalOverview); }
    get employeeRankBn(): string { return this.rankBn(this.employee, this.overview); }
    get employeeNameBn(): string { return this.nameBn(this.employee); }
    get employeeCorpsBn(): string { return this.corpsBn(this.employee, this.overview); }
    get employeeUnitBn(): string { return this.unitBn(this.overview); }
    /** Second signature line under the RAB Unit — Battalion HQ location. */
    get employeeUnitLocationBn(): string {
        return this.unitLocationBn(this.overview, this.battalionHqBn, this.battalionHqEn);
    }

    // Final Approver (left-hand block).
    get approverIdLineBn(): string { return this.idLineBn(this.approver, this.approverOverview, this.approverPersonalOverview); }
    get approverRankBn(): string { return this.rankBn(this.approver, this.approverOverview); }
    get approverNameBn(): string { return this.nameBn(this.approver); }
    get approverCorpsBn(): string { return this.corpsBn(this.approver, this.approverOverview); }
    get approverUnitBn(): string { return this.unitBn(this.approverOverview); }
    get approverUnitLocationBn(): string {
        return this.unitLocationBn(this.approverOverview, this.approverBattalionHqBn, this.approverBattalionHqEn);
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

    /**
     * Article47Handover rows of MovementLetterNumberConfig, kept only to render the
     * Bangla prefix on স্মারক নং. Each row pairs the prefix its letter numbers are
     * minted with against that prefix's Bangla form.
     */
    private letterConfigs: { prefix: string; prefixBN: string }[] = [];

    private loadLetterConfigs(): void {
        this.masterBasicSetup.getAllMovementLetterNumberConfig().subscribe({
            next: (rows: any[]) => {
                this.letterConfigs = (rows || [])
                    .filter((r) => r.moveOrderType === MoveOrderType.Article47Handover)
                    .map((r) => ({ prefix: (r.prefix || '').trim(), prefixBN: (r.prefixBN || '').trim() }))
                    .filter((r) => r.prefix && r.prefixBN);
                // Configs may land after the movement — rebuild so the Bangla prefix
                // replaces the English one once it's known.
                if (this.movement) this.buildHeaderLines();
            },
            // A lookup failure must not blank the header — the minted prefix stands.
            error: () => { /* keep the minted prefix */ }
        });
    }

    /**
     * Letter numbers are minted with the config's English prefix. The Bangla letter
     * prints Prefix (Bangla) instead, so swap the leading prefix for its prefixBN and
     * Bangla-ise only the digits that follow (the Bangla prefix is already Bangla text
     * and must not go through the numeral converter).
     *
     * The config is identified by the prefix the number actually starts with — longest
     * match wins — rather than by re-resolving the issuing unit, so the swap stays
     * correct for movements whose unit config has since changed.
     */
    private toBanglaLetterNo(letterNo: string): string {
        const match = this.letterConfigs
            .filter((c) => letterNo.startsWith(c.prefix))
            .sort((a, b) => b.prefix.length - a.prefix.length)[0];
        if (!match) return this.toBn(letterNo);
        return `${match.prefixBN}${this.toBn(letterNo.slice(match.prefix.length))}`;
    }

    private buildHeaderLines(): void {
        this.memoNoBn = this.movement?.letterNo
            ? this.toBanglaLetterNo(this.movement.letterNo)
            : '---';

        const d = this.movement?.letterDate ? new Date(this.movement.letterDate) : new Date();
        this.letterDateBn = `তারিখঃ ${this.formatBnDate(d)}।`;
    }

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

    toBn(input: string | number | null | undefined): string {
        if (input == null) return '';
        return BanglaNumerals.toBangla(String(input));
    }

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
        return `Article47_Handover_${this.movement?.movementId ?? 'export'}`;
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
            const { html, chrome } = await this.buildJsReportPdf();
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
            const { html, chrome } = await this.buildJsReportPdf();
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
    private async buildJsReportPdf(): Promise<{ html: string; chrome: Record<string, unknown> }> {
        const styles = collectDocumentStyles();
        const fontCss = await embedBanglaFontCss();
        const body = this.paper.nativeElement.innerHTML;
        const sz = this.selectedPageSize;
        const pageWidth = sz === 'A4' ? '210mm' : '215.9mm';
        const pageHeight = sz === 'A4' ? '297mm' : sz === 'Letter' ? '279.4mm' : '355.6mm';
        // mm — mirrors .a4-paper's padding (see this component's .scss):
        // left 1in, right 0.4in, top/bottom unchanged.
        const padLeft = 25.4, padRight = 10.16, padTop = 14, padBottom = 20;
        const paperWidth = sz === 'A4' ? 210 : 215.9;
        const colWidth = `${(paperWidth - padLeft - padRight).toFixed(2)}mm`;

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${styles}

/* SolaimanLipi inlined as base64 — JsReport has no base URL to resolve the app's
   relative /assets/fonts reference. See bangla-font.util.ts. */
${fontCss}

@page { size: ${pageWidth} ${pageHeight}; margin: ${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm; }
html, body { margin: 0; padding: 0; background: transparent; }

.no-print, .preview-header, .preview-actions { display: none !important; }

.pdf-flow {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    width: ${colWidth};
    font-family: ${BANGLA_DOC_FONT_STACK};
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

    private getPageDimensions(): { width: number; height: number } {
        switch (this.selectedPageSize) {
            case 'A4':     return { width: 11906, height: 16838 };
            case 'Letter': return { width: 12240, height: 15840 };
            case 'Legal':
            default:       return { width: 12240, height: 20160 };
        }
    }

    /** Build the Article 47 Handover Word document (portrait). */
    private buildWordDocument(): Document {
        const m = this.movement!;
        const font = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const dims = this.getPageDimensions();
        // Twips — same margins as the preview/PDF: left 1in (1440), right 0.4in (576).
        const MARGIN_LEFT = 1440, MARGIN_RIGHT = 576, MARGIN_Y = 720;
        const contentWidth = dims.width - MARGIN_LEFT - MARGIN_RIGHT;

        const SZ_BODY  = 20; // 10pt
        const SZ_ORG   = 18; //  9pt — form number header

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

        // Form number header
        const formHeader = para('বাংলাদেশ ফরম নং-২৪০৩', { size: SZ_ORG });

        // Memo + date row (2-column table for left/right alignment)
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

        // প্রতি block (Handover — comes BEFORE সূত্র)
        const recipientCellW = contentWidth - 1000; // leave room for the left margin offset
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

        // সূত্র + remarks — convert Quill HTML into one Paragraph per <p>
        // so paragraph breaks from the rich editor render correctly in Word
        // (matches the on-screen `[innerHTML]` rendering).
        const sutroParas = m.auth
            ? htmlToParagraphs(m.auth, { lineTwips: 280, firstPrefix: 'সূত্র: ' })
            // Blank when no Auth was entered — no --- placeholder.
            : [para('সূত্র: ', { lineTwips: 280 })];
        const remarksParas = htmlToParagraphs(m.remarks, { lineTwips: 280 });

        // অগ্রগামী
        const ogragami = para('অগ্রগামী করা হইল।', { spacingBefore: 480 });

        // Signature block — sits on the right side of the page (empty left
        // column takes ~60% width), with its lines centered within the right
        // column. Matches the on-screen `text-align:right > inline-block` pattern.
        // Two equal columns: Final Approver on the left, member on the right.
        const sigLeftW = Math.round(contentWidth / 2);
        const sigRightW = contentWidth - sigLeftW;

        /** One signature stack. No caption and no rule above the name — the leading
         *  empty paragraph keeps the signing space the underscores used to occupy. */
        const sigStack = (idLine: string, rank: string, name: string, corps: string, unit: string, location: string): Paragraph[] => {
            const out: Paragraph[] = [];
            out.push(para('', { align: AlignmentType.CENTER, spacingBefore: 720 }));
            out.push(para(`${idLine} ${rank}`.trim(), { align: AlignmentType.CENTER }));
            out.push(para(`${name}${corps ? ', ' + corps : ''}`, { align: AlignmentType.CENTER }));
            out.push(para(`${unit}${location ? ', ' + location : ''}`, { align: AlignmentType.CENTER }));
            return out;
        };

        const approverParas: Paragraph[] = this.hasApprover
            ? sigStack(this.approverIdLineBn, this.approverRankBn, this.approverNameBn,
                       this.approverCorpsBn, this.approverUnitBn, this.approverUnitLocationBn)
            : [para('')];
        const sigInnerParas: Paragraph[] = sigStack(
            this.employeeIdLineBn, this.employeeRankBn, this.employeeNameBn,
            this.employeeCorpsBn, this.employeeUnitBn, this.employeeUnitLocationBn);
        const sigRow = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [sigLeftW, sigRightW],
            layout: TableLayoutType.FIXED,
            borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [new TableRow({ children: [
                new TableCell({ width: { size: sigLeftW, type: WidthType.DXA }, borders: noBorder, children: approverParas }),
                new TableCell({ width: { size: sigRightW, type: WidthType.DXA }, borders: noBorder, children: sigInnerParas })
            ] })]
        });

        // Witness / Rule 78 block — three blank ruled lines + one inline-filled line.
        const witnessParas: (Paragraph | Table)[] = [];
        witnessParas.push(para('বেসামরিক হিসাব পদ্ধতির ৭৮ নং বিধি অনুযায়ী আমি (গ্রহণকারী কর্মকর্তা)', { spacingBefore: 480 }));

        // Three blank dotted ruled lines — built as a Table with 3 rows so
        // each row's bottom border renders distinctly. Adjacent
        // Paragraph-with-border-bottom were collapsing into one line in Word.
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
        // "সমুদয় ... দিলাম <dotted-fill> জেলা" — single paragraph with three runs.
        // The middle run uses single-dotted underline as the fill line.
        witnessParas.push(new Paragraph({
            spacing: { before: 180, line: 280, lineRule: 'atLeast' as any },
            children: [
                new TextRun({ text: 'সমুদয় স্থায়ী অগ্রিম লেনদেনের টাকা গ্রহণের প্রাপ্তি স্বীকার দিলাম ', size: SZ_BODY, sizeComplexScript: SZ_BODY, font, language: bnLang }),
                new TextRun({ text: ' '.repeat(40), underline: { type: 'dotted' as any }, size: SZ_BODY, font, language: bnLang }),
                new TextRun({ text: '  জেলা', size: SZ_BODY, sizeComplexScript: SZ_BODY, font, language: bnLang })
            ]
        }));
        // Final districts/signature line
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
            para(''),
            // Handover variant — প্রতি before সূত্র
            para('প্রতি,'),
            ...(recipientTable ? [recipientTable] : []),
            // 2 empty lines above সূত্র.
            para(''),
            para(''),
            ...sutroParas,
            // 2 empty lines below সূত্র.
            para(''),
            para(''),
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
                        margin: { top: MARGIN_Y, bottom: MARGIN_Y, left: MARGIN_LEFT, right: MARGIN_RIGHT }
                    }
                },
                children
            }]
        });
    }
}
