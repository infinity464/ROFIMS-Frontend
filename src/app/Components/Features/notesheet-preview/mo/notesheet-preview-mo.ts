import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, PageOrientation, TableLayoutType, HeightRule } from 'docx';
import { saveAs } from 'file-saver';
import { JsReportService } from '@/services/jsreport.service';

import { MovementInfoService } from '@/services/movement-info.service';
import { MovementInfoModel } from '@/models/movement-info.model';
import { EmpService } from '@/services/emp-service';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { MovementReturnButtonComponent } from '../shared/movement-return-button';
import { MovementFilesInfoComponent } from '../shared/movement-files-info';

@Component({
    selector: 'app-notesheet-preview-mo',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, SelectModule, Toast, MovementReturnButtonComponent, MovementFilesInfoComponent],
    providers: [MessageService],
    templateUrl: './notesheet-preview-mo.html',
    styleUrls: ['../notesheet-preview.scss', '../notesheet-preview-toolbar-dark.scss']
})
export class NotesheetPreviewMOComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private movementService = inject(MovementInfoService);
    private empService = inject(EmpService);
    private servingMembersService = inject(ServingMembersService);
    private masterBasicSetup = inject(MasterBasicSetupService);
    private organizationService = inject(OrganizationService);
    private messageService = inject(MessageService);
    private http = inject(HttpClient);
    private jsreportService = inject(JsReportService);

    @ViewChild('paper') paper!: ElementRef<HTMLDivElement>;

    loading = true;
    error: string | null = null;
    movement: MovementInfoModel | null = null;

    /** Export state. */
    exportingPdf = false;
    printingPreview = false;
    pageSizeOptions = [
        { label: 'Legal', value: 'Legal' },
        { label: 'A4', value: 'A4' },
        { label: 'Letter', value: 'Letter' }
    ];
    selectedPageSize: 'Legal' | 'A4' | 'Letter' = 'Legal';

    employee: EmployeeSearchInfoModel | null = null;
    overview: EmployeeServiceOverview | null = null;
    /** Per-employee personal overview — reliable prefix source for any employee. */
    personalOverview: any | null = null;

    /** Recipient lines parsed from MovementInfo.letterRecipients (rendered as flat list). */
    recipientLines: string[] = [];

    /** Top-right header label — pulled from letterNo if present, else placeholder. */
    topRightLabelBn = '---';
    /** Bottom-block date line. */
    letterDateBn = '';
    /** "Destined" mother-unit display name (resolved from destinedMotherUnitId). */
    destinedMotherUnitName = '';
    destinedMotherUnitNameBn = '';
    /** District id of the destined mother unit (for Row 2 — গন্তব্যস্থল). */
    destinedMotherUnitDistrictId: number | null = null;
    /** Battalion HQ location of the destined RAB unit (for Row 2 when RAB unit destination). */
    destinedRABUnitHqEn = '';
    destinedRABUnitHqBn = '';
    /** District id → labels map (CommonCode codeType='District'). */
    private districtLabels = new Map<number, { en: string; bn: string }>();
    /** Battalion HQ location for the employee's RAB unit (Bangla preferred). */
    battalionHqEn = '';
    battalionHqBn = '';

    private rankLabels = new Map<number, { en: string; bn: string }>();
    private rabUnitLabels = new Map<number, { en: string; bn: string }>();
    private corpsLabels = new Map<number, { en: string; bn: string }>();
    private prefixLabels = new Map<number, { en: string; bn: string }>();

    ngOnInit(): void {
        this.loadRankLabels();
        this.loadRabUnitLabels();
        this.loadCorpsLabels();
        this.loadDistrictLabels();
        this.loadPrefixLabels();

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
                this.recipientLines = this.parseStringArray(this.movement.letterRecipients);
                this.buildHeaderLines();
                this.loadEmployee();
                this.loadDestinedMotherUnit();
                this.loadDestinedRABUnitHq();
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

    private buildHeaderLines(): void {
        this.topRightLabelBn = this.movement?.letterNo ? this.toBn(this.movement.letterNo) : '---';
        const d = this.movement?.letterDate ? new Date(this.movement.letterDate) : new Date();
        this.letterDateBn = this.formatBnDate(d);
    }

    private loadEmployee(): void {
        const ids = this.parseIntArray(this.movement?.employeeIds);
        const firstId = ids.length > 0 ? ids[0] : 0;
        if (!firstId) return;
        this.empService.getEmployeeSearchInfo(firstId).subscribe({
            next: (info) => {
                this.employee = info ?? null;
                this.loadOverview();
            },
            error: () => {
                this.employee = null;
            }
        });

        // The employee-search record carries no prefix and the serving-members
        // overview is null for non-serving members, so pull the prefix from the
        // per-employee personal overview (vw_EmployeePersonalServiceOverview),
        // which is populated for every employee.
        this.servingMembersService.getEmployeePersonalServiceOverview(firstId).subscribe({
            next: (po: any) => { this.personalOverview = po ?? null; },
            error: () => { this.personalOverview = null; }
        });
    }

    private loadOverview(): void {
        const e: any = this.employee || {};
        const rabId: string = e.rabID ?? e.RABID ?? '';
        const serviceId: string = e.serviceId ?? e.ServiceId ?? '';
        if (!rabId && !serviceId) return;

        this.servingMembersService
            .getPresentlyServingMembersPaginatedFiltered({
                pagination: { page_no: 1, row_per_page: 5 },
                filter: rabId ? { rabId } : { serviceId }
            })
            .subscribe({
                next: (res: any) => {
                    const list: EmployeeServiceOverview[] = (res?.datalist ?? res?.data ?? res ?? []) as EmployeeServiceOverview[];
                    this.overview = Array.isArray(list) && list.length ? list[0] : null;
                    this.loadBattalionHq();
                },
                error: () => {
                    this.overview = null;
                }
            });
    }

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

    private loadDestinedMotherUnit(): void {
        const id = this.movement?.destinedMotherUnitId;
        if (!id) return;
        this.organizationService.GetAllOrgUnit().subscribe({
            next: (rows: any[]) => {
                const hit = (rows || []).find((r) => (r.orgId ?? r.OrgId) === id);
                if (hit) {
                    this.destinedMotherUnitName = (hit.orgNameEN ?? hit.OrgNameEN ?? '') as string;
                    this.destinedMotherUnitNameBn = (hit.orgNameBN ?? hit.OrgNameBN ?? '') as string;
                    this.destinedMotherUnitDistrictId = (hit.districtId ?? hit.DistrictId ?? null) as number | null;
                }
            }
        });
    }

    /** Battalion HQ location of the **destined** RAB unit — drives Row 2 (গন্তব্যস্থল)
     *  when DestinedRABUnitId is the destination. Source = basic-setup/rab-unit-aor. */
    private loadDestinedRABUnitHq(): void {
        const rabUnitId = this.movement?.destinedRABUnitId;
        if (!rabUnitId) return;
        this.masterBasicSetup.getRABUnitAORByRabUnit(rabUnitId).subscribe({
            next: (rows: any[]) => {
                if (!Array.isArray(rows) || rows.length === 0) return;
                const firstEn = rows.find((r) => !!(r?.locationOfBattalionHQ ?? r?.LocationOfBattalionHQ));
                if (firstEn) this.destinedRABUnitHqEn = String(firstEn.locationOfBattalionHQ ?? firstEn.LocationOfBattalionHQ ?? '');
                const firstBn = rows.find((r) => !!(r?.locationOfBattalionHQBangla ?? r?.LocationOfBattalionHQBangla));
                if (firstBn) this.destinedRABUnitHqBn = String(firstBn.locationOfBattalionHQBangla ?? firstBn.LocationOfBattalionHQBangla ?? '');
            }
        });
    }

    /** Cache District id → labels (CommonCode codeType='District'). */
    private loadDistrictLabels(): void {
        this.masterBasicSetup.getAllByType('District').subscribe({
            next: (rows: any[]) => {
                this.districtLabels.clear();
                for (const r of rows || []) {
                    const id = r.codeId ?? r.CodeId;
                    if (id == null) continue;
                    this.districtLabels.set(id, {
                        en: r.codeValueEN ?? r.CodeValueEN ?? '',
                        bn: r.codeValueBN ?? r.CodeValueBN ?? ''
                    });
                }
            }
        });
    }

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

    private loadPrefixLabels(): void {
        this.masterBasicSetup.getAllByType('Prefix').subscribe({
            next: (rows: any[]) => {
                this.prefixLabels.clear();
                for (const r of rows || []) {
                    const id = r.codeId ?? r.CodeId;
                    if (id == null) continue;
                    this.prefixLabels.set(id, {
                        en: r.codeValueEN ?? r.CodeValueEN ?? '',
                        bn: r.codeValueBN ?? r.CodeValueBN ?? ''
                    });
                }
            }
        });
    }

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

    // ── Display getters ───────────────────────────────────────────────────

    /** Row 1: "নং-<svc/rab id> <rank> <name>" — first selected employee. */
    get employeeDisplayBn(): string {
        const e: any = this.employee || {};
        const o: any = this.overview || {};
        const id = e.serviceId ?? e.ServiceId ?? e.rabID ?? e.RABID ?? '';

        // EmployeeInfo.Prefix is a CommonCode id; the displayable name comes from
        // CommonCode. Resolve the name from whatever source is available:
        //   1) the per-employee personal overview (BN/EN label + prefixId) — set
        //      for every employee, including non-serving ones
        //   2) the serving-members overview's prefix string
        //   3) the CommonCode 'Prefix' map keyed on prefixId (loaded async)
        const po: any = this.personalOverview || {};
        const prefixId: number | undefined =
            po.prefixId ?? po.PrefixId ?? o.prefixId ?? o.PrefixId ?? e.prefixId ?? e.PrefixId;
        const prefixFromMap = prefixId != null ? this.prefixLabels.get(prefixId) : undefined;
        const prefix = (po.prefixBN || po.PrefixBN || po.prefixEN || po.PrefixEN || po.prefix || po.Prefix
            || o.prefixBN || o.PrefixBN || o.prefix || o.Prefix
            || prefixFromMap?.bn || prefixFromMap?.en || '') as string;

        const rankId: number | undefined = o.armyRankId ?? o.ArmyRankId ?? e.rankId ?? e.RankId;
        const rank = (rankId != null ? this.rankLabels.get(rankId)?.bn : '') ?? '';

        const name = (e.fullNameBN ?? e.FullNameBN ?? e.fullNameEN ?? e.FullNameEN ?? '') as string;
        const idPart = prefix ? `${prefix}-${this.toBn(id)}` : this.toBn(id);
        return `${idPart} ${rank} ${name}।`.trim();
    }

    /** Resolve the destination unit (either DestinedMotherUnitId or DestinedRABUnitId)
     *  to a Bangla-first display name. Used by rows 2, 3 and 9. */
    private resolveDestinationBn(): string {
        // Prefer the destined mother unit (Bangla then English).
        if (this.destinedMotherUnitNameBn) return this.destinedMotherUnitNameBn;
        if (this.destinedMotherUnitName) return this.destinedMotherUnitName;
        // Fall back to the destined RAB unit (Bangla then English from CommonCode 'RabUnit').
        const rabUnitId = this.movement?.destinedRABUnitId;
        if (rabUnitId != null) {
            const labels = this.rabUnitLabels.get(rabUnitId);
            if (labels?.bn) return labels.bn;
            if (labels?.en) return labels.en;
        }
        return '---';
    }

    /** Row 2: গন্তব্যস্থল — District (for Mother unit) or Battalion HQ Bangla (for RAB unit). */
    get destinationBn(): string {
        // Mother unit destination → its district name (Bangla preferred).
        if (this.movement?.destinedMotherUnitId && this.destinedMotherUnitDistrictId != null) {
            const labels = this.districtLabels.get(this.destinedMotherUnitDistrictId);
            if (labels?.bn) return labels.bn;
            if (labels?.en) return labels.en;
        }
        // RAB unit destination → Location of Battalion HQ (Bangla preferred).
        if (this.movement?.destinedRABUnitId) {
            if (this.destinedRABUnitHqBn) return this.destinedRABUnitHqBn;
            if (this.destinedRABUnitHqEn) return this.destinedRABUnitHqEn;
        }
        return '---';
    }

    /** Row 3: reporting unit/establishment. */
    get reportingUnitBn(): string {
        return this.resolveDestinationBn();
    }

    /** Row 4: date of release in Bangla. */
    get departureDateBn(): string {
        const d = this.movement?.dateOfRelease ? new Date(this.movement.dateOfRelease) : null;
        return d ? this.formatBnDate(d) : '---';
    }

    /** Row 9: reception unit. */
    get receptionUnitBn(): string {
        return this.resolveDestinationBn();
    }

    /** Bottom block — RAB Unit name. */
    get rabUnitBn(): string {
        const o = this.overview as any;
        const rabUnitId: number | undefined = o?.rabUnitId ?? o?.RabUnitId;
        if (rabUnitId != null) {
            const labels = this.rabUnitLabels.get(rabUnitId);
            if (labels?.bn) return labels.bn;
            if (labels?.en) return labels.en;
        }
        return (o?.rabUnit ?? o?.RabUnit ?? 'র‍্যাব ফোর্সেস সদর দপ্তর') as string;
    }

    /** Bottom block — Battalion HQ location. */
    get rabUnitLocationBn(): string {
        if (this.battalionHqBn) return this.battalionHqBn;
        if (this.battalionHqEn) return this.battalionHqEn;
        const o = this.overview as any;
        return (o?.location ?? o?.Location ?? '') as string;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private formatBnDate(d: Date): string {
        const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
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

    private parseIntArray(json: string | null | undefined): number[] {
        if (!json) return [];
        try {
            const arr = JSON.parse(json);
            return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
        } catch {
            return [];
        }
    }

    private parseStringArray(json: string | null | undefined): string[] {
        if (!json) return [];
        try {
            const arr = JSON.parse(json);
            return Array.isArray(arr) ? arr.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0) : [];
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
        if (raw && raw.trim()) {
            return raw.replace(/[\\/:*?"<>|]+/g, '_').trim();
        }
        return `MO_${this.movement?.movementId ?? 'export'}`;
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
                severity: 'error',
                summary: 'JsReport error',
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
                severity: 'error',
                summary: 'JsReport error',
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
        const padX = 10,
            padTop = 14,
            padBottom = 20; // mm — .a4-paper padding

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
            marginTop: '0',
            marginBottom: '0',
            marginLeft: '0',
            marginRight: '0',
            printBackground: true,
            displayHeaderFooter: false,
            headerTemplate: '',
            footerTemplate: ''
        };

        return { html, chrome };
    }

    /** Concatenate every same-origin stylesheet loaded into the page. */
    private collectDocumentStyles(): string {
        const out: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
            } catch {
                /* cross-origin — skip */
            }
        }
        return out.join('\n');
    }

    /** Twentieths of a point (twips) for the selected page size — portrait. */
    private getPageDimensions(): { width: number; height: number } {
        switch (this.selectedPageSize) {
            case 'A4':
                return { width: 11906, height: 16838 };
            case 'Letter':
                return { width: 12240, height: 15840 };
            case 'Legal':
            default:
                return { width: 12240, height: 20160 };
        }
    }

    /** Build the MO Word document (portrait, mirrors the on-screen layout). */
    private buildWordDocument(): Document {
        const m = this.movement!;
        const font = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const dims = this.getPageDimensions();
        const contentWidth = dims.width - 1440;

        const SZ_TITLE = 30; // 15pt — গমনাদেশ
        const SZ_BODY = 20; // 10pt — body rows
        const SZ_FOOTER = 20; // 10pt — recipient lines (match body)

        const noBorder = {
            top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
        };

        const para = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingBefore?: number; spacingAfter?: number; lineTwips?: number } = {}) => {
            const sz = opts.size ?? SZ_BODY;
            const hasSpacing = opts.spacingBefore != null || opts.spacingAfter != null || opts.lineTwips != null;
            // `line` in twips with `lineRule: 'atLeast'` sets the minimum line
            // height — used to give multi-line cell content extra inter-line
            // breathing room without affecting single-line rows.
            const spacing: any = hasSpacing ? {} : undefined;
            if (hasSpacing) {
                if (opts.spacingBefore != null) spacing.before = opts.spacingBefore;
                if (opts.spacingAfter != null) spacing.after = opts.spacingAfter;
                if (opts.lineTwips != null) {
                    spacing.line = opts.lineTwips;
                    spacing.lineRule = 'atLeast';
                }
            }
            return new Paragraph({
                alignment: opts.align,
                spacing,
                children: [
                    new TextRun({
                        text,
                        bold: opts.bold,
                        size: sz,
                        sizeComplexScript: sz,
                        font,
                        language: bnLang
                    })
                ]
            });
        };

        // Keep ZWJ/ZWNJ — words like "র‍্যাব" need ZWJ to render correctly.
        // Only normalize Unicode (NFC) and turn NBSP into a regular space.
        const cleanText = (s: string): string => s.trim().normalize('NFC').replace(/ /g, ' ');

        /** Convert Quill HTML into Paragraphs, one per top-level <p>/<div>,
         *  joining them with `\n` for use inside a single table cell.
         *  When the cell needs multiple paragraphs, callers use the array form. */
        const htmlToParagraphs = (html: string | null | undefined, opts: { size?: number; lineTwips?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph[] => {
            if (!html) return [];
            const div = document.createElement('div');
            div.innerHTML = html;
            const blocks = Array.from(div.querySelectorAll('p, div'));
            const sourceTexts = blocks.length > 0 ? blocks.map((el) => cleanText(el.textContent || '')) : [cleanText(div.textContent || '')];
            return sourceTexts.map((t) => para(t, { size: opts.size, lineTwips: opts.lineTwips, align: opts.align }));
        };

        const topRightLabel = new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'বিএফটি-১৭৬২ এর পরিবর্তে', size: SZ_BODY, sizeComplexScript: SZ_BODY, font, language: bnLang })]
        });
        const heading = new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 200 },
            children: [new TextRun({ text: 'গমনাদেশ', size: SZ_TITLE, sizeComplexScript: SZ_TITLE, font, language: bnLang })]
        });

        // Numbered-rows table (serial | label | : | value).
        const SERIAL_W = 600;
        const LABEL_W = 3600;
        const COLON_W = 280;
        const VALUE_W = contentWidth - SERIAL_W - LABEL_W - COLON_W;

        // Line height for body cells: 10pt text × (240 + 40 twips) ≈ 14pt
        // single-line height (+ 2pt vs the default 12pt). Used for multi-line
        // values so wrapped lines (e.g. মন্তব্য, গমনের প্রাধিকার) breathe.
        const CELL_LINE = 280;
        const rowCell = (text: string | Paragraph[], widthTwips: number): TableCell =>
            new TableCell({
                width: { size: widthTwips, type: WidthType.DXA },
                borders: noBorder,
                // 80 twips = 4pt top + 4pt bottom — matches the on-screen
                // `padding:4pt 0` rule and gives ~2pt extra line gap per row.
                margins: { top: 80, bottom: 80, left: 0, right: 0 },
                verticalAlign: 'top' as any,
                children: typeof text === 'string' ? [para(text, { lineTwips: CELL_LINE })] : text
            });
        const dataRow = (serial: number, label: string, value: string | Paragraph[]): TableRow =>
            new TableRow({
                children: [rowCell(this.serialBn(serial), SERIAL_W), rowCell(label, LABEL_W), rowCell(':', COLON_W), rowCell(value, VALUE_W)]
            });

        // Rich-text cells (auth/remarks/details) now preserve Quill paragraph
        // structure — one docx Paragraph per top-level <p> — instead of being
        // flattened to a single line.
        const authParas = htmlToParagraphs(m.auth, { lineTwips: CELL_LINE });
        const authValue: string | Paragraph[] = authParas.length > 0 ? authParas : '---';
        const remarksParas = htmlToParagraphs(m.remarks, { lineTwips: CELL_LINE });
        const remarksValue: string | Paragraph[] = remarksParas.length > 0 ? remarksParas : '---';

        const numberedTable = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [SERIAL_W, LABEL_W, COLON_W, VALUE_W],
            layout: TableLayoutType.FIXED,
            borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [
                dataRow(1, 'ব্যক্তিগত নং, পদবী এবং নাম', this.employeeDisplayBn),
                dataRow(2, 'গন্তব্যস্থল', this.destinationBn),
                dataRow(3, 'রিপোর্ট করিবার ইউনিট/প্রতিষ্ঠান', this.reportingUnitBn),
                dataRow(4, 'গমনের তারিখ ও সময়', this.departureDateBn),
                dataRow(5, 'গমনের প্রাধিকার', authValue),
                dataRow(6, 'শেষ রসদ সনদপত্র', m.lastRationCertificate || ''),
                dataRow(7, 'বেতন ও ভাতা', m.payAndAllowance || ''),
                dataRow(8, 'রেলওয়ে আজ্ঞাপত্র', m.railwayWarrant || ''),
                dataRow(9, 'অভ্যর্থনা', this.receptionUnitBn),
                dataRow(10, 'মন্তব্য', remarksValue)
            ]
        });

        // Bottom metadata block (label : value).
        const metaLabelW = 1600;
        const metaColonW = 280;
        const metaValueW = contentWidth - metaLabelW - metaColonW;
        const metaRow = (label: string, value: string | Paragraph[]): TableRow =>
            new TableRow({
                children: [rowCell(label, metaLabelW), rowCell(':', metaColonW), rowCell(value, metaValueW)]
            });
        const detailsParas = htmlToParagraphs(m.detailsInformation, { lineTwips: CELL_LINE });
        const detailsValue: string | Paragraph[] = detailsParas.length > 0 ? detailsParas : '';
        const metaTable = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [metaLabelW, metaColonW, metaValueW],
            layout: TableLayoutType.FIXED,
            borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [
                metaRow('ইউনিট', this.rabUnitBn),
                metaRow('স্থান', this.rabUnitLocationBn || '---'),
                metaRow('তারালাপনী', '৮৯৬৫৩১৫০ বর্ধিত ৩৫১১'),
                metaRow('নথি নং', this.topRightLabelBn),
                metaRow('তারিখ', this.letterDateBn),
                metaRow('বিতরণ', detailsValue)
            ]
        });

        // 8pt before + 8pt after each line (160 twips = 8pt). +1pt vs previous.
        const recipientParas = this.recipientLines.length > 0 ? this.recipientLines.map((l) => para(l, { size: SZ_FOOTER, spacingBefore: 160, spacingAfter: 160 })) : [];

        return new Document({
            styles: { default: { document: { run: { font, language: bnLang } } } },
            sections: [
                {
                    properties: {
                        page: {
                            size: { width: dims.width, height: dims.height, orientation: PageOrientation.PORTRAIT },
                            margin: { top: 720, bottom: 720, left: 720, right: 720 }
                        }
                    },
                    children: [topRightLabel, heading, numberedTable, para(''), metaTable, para(''), ...recipientParas]
                }
            ]
        });
    }
}
