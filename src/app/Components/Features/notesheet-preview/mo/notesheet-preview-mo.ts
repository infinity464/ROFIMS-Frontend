import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, TableLayoutType,
    HeightRule
} from 'docx';
import { saveAs } from 'file-saver';
import { environment } from '@/Core/Environments/environment';

import { MovementInfoService } from '@/services/movement-info.service';
import { MovementInfoModel } from '@/models/movement-info.model';
import { EmpService } from '@/services/emp-service';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';

@Component({
    selector: 'app-notesheet-preview-mo',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, SelectModule, Toast],
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

    loading = true;
    error: string | null = null;
    movement: MovementInfoModel | null = null;

    /** Export state. */
    exportingPdf = false;
    printingPreview = false;
    pageSizeOptions = [
        { label: 'Legal',  value: 'Legal'  },
        { label: 'A4',     value: 'A4'     },
        { label: 'Letter', value: 'Letter' }
    ];
    selectedPageSize: 'Legal' | 'A4' | 'Letter' = 'Legal';

    employee: EmployeeSearchInfoModel | null = null;
    overview: EmployeeServiceOverview | null = null;

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
        this.topRightLabelBn = this.movement?.letterNo
            ? this.toBn(this.movement.letterNo)
            : '---';
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
            error: () => { this.employee = null; }
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
                    this.destinedMotherUnitName        = (hit.orgNameEN ?? hit.OrgNameEN ?? '') as string;
                    this.destinedMotherUnitNameBn      = (hit.orgNameBN ?? hit.OrgNameBN ?? '') as string;
                    this.destinedMotherUnitDistrictId  = (hit.districtId ?? hit.DistrictId ?? null) as number | null;
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

        // Prefix: Bangla label from CommonCode 'Prefix' keyed on overview.prefixId.
        const prefixId: number | undefined = o.prefixId ?? o.PrefixId;
        const prefix = (prefixId != null ? this.prefixLabels.get(prefixId)?.bn : '') ?? '';

        const rankId: number | undefined = o.armyRankId ?? o.ArmyRankId ?? e.rankId ?? e.RankId;
        const rank = (rankId != null ? this.rankLabels.get(rankId)?.bn : '') ?? '';

        const name = (e.fullNameBN ?? e.FullNameBN ?? e.fullNameEN ?? e.FullNameEN ?? '') as string;
        return `${prefix}-${this.toBn(id)} ${rank} ${name}।`.trim();
    }

    /** Resolve the destination unit (either DestinedMotherUnitId or DestinedRABUnitId)
     *  to a Bangla-first display name. Used by rows 2, 3 and 9. */
    private resolveDestinationBn(): string {
        // Prefer the destined mother unit (Bangla then English).
        if (this.destinedMotherUnitNameBn) return this.destinedMotherUnitNameBn;
        if (this.destinedMotherUnitName)   return this.destinedMotherUnitName;
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

    async exportPdf(): Promise<void> {
        if (!this.movement) return;
        this.exportingPdf = true;
        try {
            const doc = this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const pdfBlob = await this.convertDocxToPdf(docxBlob);
            saveAs(pdfBlob, `${this.exportFileStem()}.pdf`);
        } catch (err) {
            console.error('PDF export failed', err);
            this.messageService.add({ severity: 'error', summary: 'Export Error', detail: 'Failed to generate PDF.' });
        } finally {
            this.exportingPdf = false;
        }
    }

    async printPreview(): Promise<void> {
        if (!this.movement) return;
        this.printingPreview = true;
        try {
            const doc = this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const pdfBlob = await this.convertDocxToPdf(docxBlob);
            const url = URL.createObjectURL(pdfBlob);
            window.open(url, '_blank');
        } catch (err) {
            console.error('Print preview failed', err);
            this.messageService.add({ severity: 'error', summary: 'Preview Error', detail: 'Failed to generate print preview.' });
        } finally {
            this.printingPreview = false;
        }
    }

    private async convertDocxToPdf(docxBlob: Blob): Promise<Blob> {
        const form = new FormData();
        form.append('file', docxBlob, 'document.docx');
        return await firstValueFrom(
            this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
        );
    }

    /** Twentieths of a point (twips) for the selected page size — portrait. */
    private getPageDimensions(): { width: number; height: number } {
        switch (this.selectedPageSize) {
            case 'A4':     return { width: 11906, height: 16838 };
            case 'Letter': return { width: 12240, height: 15840 };
            case 'Legal':
            default:       return { width: 12240, height: 20160 };
        }
    }

    /** Build the MO Word document (portrait, mirrors the on-screen layout). */
    private buildWordDocument(): Document {
        const m = this.movement!;
        const font = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const dims = this.getPageDimensions();
        const contentWidth = dims.width - 1440;

        const SZ_TITLE  = 30; // 15pt — গমনাদেশ
        const SZ_BODY   = 20; // 10pt — body rows
        const SZ_FOOTER = 20; // 10pt — recipient lines (match body)

        const noBorder = {
            top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        };

        const para = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingBefore?: number; spacingAfter?: number } = {}) => {
            const sz = opts.size ?? SZ_BODY;
            const hasSpacing = opts.spacingBefore != null || opts.spacingAfter != null;
            return new Paragraph({
                alignment: opts.align,
                spacing: hasSpacing
                    ? { before: opts.spacingBefore ?? 0, after: opts.spacingAfter ?? 0 }
                    : undefined,
                children: [new TextRun({
                    text, bold: opts.bold, size: sz, sizeComplexScript: sz, font, language: bnLang
                })]
            });
        };

        const stripHtml = (html: string | null | undefined): string => {
            if (!html) return '';
            const div = document.createElement('div');
            div.innerHTML = html;
            let s = (div.textContent || div.innerText || '').trim();
            s = s.normalize('NFC');
            s = s.replace(/[‌‍]/g, '').replace(/ /g, ' ');
            return s;
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
        const LABEL_W  = 3600;
        const COLON_W  = 280;
        const VALUE_W  = contentWidth - SERIAL_W - LABEL_W - COLON_W;

        const rowCell = (text: string | Paragraph[], widthTwips: number): TableCell => new TableCell({
            width: { size: widthTwips, type: WidthType.DXA },
            borders: noBorder,
            // 80 twips = 4pt top + 4pt bottom — matches the on-screen
            // `padding:4pt 0` rule and gives ~2pt extra line gap per row.
            margins: { top: 80, bottom: 80, left: 0, right: 0 },
            verticalAlign: 'top' as any,
            children: typeof text === 'string' ? [para(text)] : text
        });
        const dataRow = (serial: number, label: string, value: string): TableRow => new TableRow({
            children: [
                rowCell(this.serialBn(serial), SERIAL_W),
                rowCell(label, LABEL_W),
                rowCell(':', COLON_W),
                rowCell(value, VALUE_W)
            ]
        });

        const authText = stripHtml(m.auth) || '---';
        const remarksText = stripHtml(m.remarks) || '---';

        const numberedTable = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [SERIAL_W, LABEL_W, COLON_W, VALUE_W],
            layout: TableLayoutType.FIXED,
            borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [
                dataRow(1,  'ব্যক্তিগত নং, পদবী এবং নাম', this.employeeDisplayBn),
                dataRow(2,  'গন্তব্যস্থল',                  this.destinationBn),
                dataRow(3,  'রিপোর্ট করিবার ইউনিট/প্রতিষ্ঠান', this.reportingUnitBn),
                dataRow(4,  'গমনের তারিখ ও সময়',         this.departureDateBn),
                dataRow(5,  'গমনের প্রাধিকার',             authText),
                dataRow(6,  'শেষ রসদ সনদপত্র',             m.lastRationCertificate || ''),
                dataRow(7,  'বেতন ও ভাতা',                 m.payAndAllowance || ''),
                dataRow(8,  'রেলওয়ে আজ্ঞাপত্র',          m.railwayWarrant || ''),
                dataRow(9,  'অভ্যর্থনা',                    this.receptionUnitBn),
                dataRow(10, 'মন্তব্য',                       remarksText)
            ]
        });

        // Bottom metadata block (label : value).
        const metaLabelW = 1600;
        const metaColonW = 280;
        const metaValueW = contentWidth - metaLabelW - metaColonW;
        const metaRow = (label: string, value: string): TableRow => new TableRow({
            children: [
                rowCell(label, metaLabelW),
                rowCell(':', metaColonW),
                rowCell(value, metaValueW)
            ]
        });
        const detailsText = stripHtml(m.detailsInformation) || '';
        const metaTable = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [metaLabelW, metaColonW, metaValueW],
            layout: TableLayoutType.FIXED,
            borders: { ...noBorder, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
            rows: [
                metaRow('ইউনিট',    this.rabUnitBn),
                metaRow('স্থান',    this.rabUnitLocationBn || '---'),
                metaRow('তারালাপনী', '৮৯৬৫৩১৫০ বর্ধিত ৩৫১১'),
                metaRow('নথি নং',   this.topRightLabelBn),
                metaRow('তারিখ',    this.letterDateBn),
                metaRow('বিতরণ',    detailsText)
            ]
        });

        // 7pt before + 7pt after each line (140 twips = 7pt). +2pt vs previous.
        const recipientParas = this.recipientLines.length > 0
            ? this.recipientLines.map((l) => para(l, { size: SZ_FOOTER, spacingBefore: 140, spacingAfter: 140 }))
            : [];

        return new Document({
            styles: { default: { document: { run: { font, language: bnLang } } } },
            sections: [{
                properties: {
                    page: {
                        size: { width: dims.width, height: dims.height, orientation: PageOrientation.PORTRAIT },
                        margin: { top: 720, bottom: 720, left: 720, right: 720 }
                    }
                },
                children: [topRightLabel, heading, numberedTable, para(''), metaTable, para(''), ...recipientParas]
            }]
        });
    }
}
