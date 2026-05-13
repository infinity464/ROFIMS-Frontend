import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of, firstValueFrom } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, HeightRule,
    ImageRun
} from 'docx';
import { saveAs } from 'file-saver';
import * as QRCode from 'qrcode';
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
import { MovementVehicleOptions } from '@/models/enums';

interface EmployeeLine {
    serial: string;          // ১। ২। … in Bangla
    text: string;            // "এসআই, মোঃ আলী হাসান (৮৬০৭১২২৩৩১)"
}

@Component({
    selector: 'app-notesheet-preview-cc',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, SelectModule, Toast],
    providers: [MessageService],
    templateUrl: './notesheet-preview-cc.html',
    styleUrls: [
        '../notesheet-preview.scss',
        '../notesheet-preview-toolbar-dark.scss',
        './notesheet-preview-cc.scss'
    ]
})
export class NotesheetPreviewCCComponent implements OnInit {
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

    /** QR code (data URL, PNG) — encodes the absolute URL of this preview.
     *  Rendered top-right on screen and embedded in the Word export. */
    qrDataUrl: string | null = null;

    /** Export state. */
    exportingPdf = false;
    printingPreview = false;
    pageSizeOptions = [
        { label: 'Legal',     value: 'Legal'     },
        { label: 'A4',        value: 'A4'        },
        { label: 'Letter',    value: 'Letter'    }
    ];
    selectedPageSize: 'Legal' | 'A4' | 'Letter' = 'Legal';

    /** Numbered Bangla list of employees rendered in column 2 (বাহিনীর পূর্ণ বিবরণ ও নাম). */
    employeeLines: EmployeeLine[] = [];

    /** First employee's overview — used to resolve current unit / district / station. */
    private firstOverview: EmployeeServiceOverview | null = null;

    /** Battalion HQ location (Bangla preferred) for the first employee's RAB unit.
     *  Drives Col 1 (জেলা এবং স্টেশন). Source: basic-setup/rab-unit-aor. */
    private battalionHqBn = '';
    private battalionHqEn = '';

    /** Header / column values. */
    letterNoBn = '';
    letterDateBn = '';
    departureTimeAndDateBn = '';   // "০৯:৩০ ঘটিকা সময় ও তারিখ ০৬/০৫/২০২৬"
    vehicleLabelBn = '';           // "সরকারী যানবাহন" / "বেসরকারী যানবাহন"
    districtAndStationBn = '';     // Col 1: জেলা এবং স্টেশন
    destinationBn = '';            // Col 3: গন্তব্যস্থল
    sutroBn = '';                  // সূত্র: <current RAB unit / সদর দপ্তর>

    /** Caches for label lookups. */
    private districtLabels = new Map<number, { en: string; bn: string }>();
    private rabUnitLabels  = new Map<number, { en: string; bn: string }>();
    private rankLabels     = new Map<number, { en: string; bn: string }>();
    private prefixLabels   = new Map<number, { en: string; bn: string }>();

    /** Destination resolution (mother-unit / RAB-unit). */
    private destinedMotherUnitNameBn = '';
    private destinedMotherUnitNameEn = '';
    private destinedRABUnitHqBn = '';
    private destinedRABUnitHqEn = '';

    ngOnInit(): void {
        this.loadRankLabels();
        this.loadRabUnitLabels();
        this.loadDistrictLabels();
        this.loadPrefixLabels();

        // Accept either an opaque PublicToken in the path (`/cc/:token` — used by
        // the QR code) or a legacy numeric `?id=N` query param (used internally
        // from the movement list).
        const tokenParam = this.route.snapshot.paramMap.get('token');
        const idParam = this.route.snapshot.queryParamMap.get('id');

        const onLoaded = (row: any, label: string) => {
            if (!row || !row.movementId) {
                this.error = `Movement ${label} not found.`;
                this.loading = false;
                return;
            }
            this.movement = row as MovementInfoModel;
            this.buildHeaderLines();
            this.generateQrCode();
            this.loadEmployees();
            this.loadDestinedMotherUnit();
            this.loadDestinedRABUnitHq();
        };

        const onError = (err: any) => {
            console.error('Failed to load movement', err);
            this.error = err?.error?.message || 'Failed to load movement.';
            this.loading = false;
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: this.error || 'Failed to load movement.'
            });
        };

        if (tokenParam) {
            this.movementService.getByPublicToken(tokenParam).subscribe({
                next: (data) => onLoaded(Array.isArray(data) ? data[0] : data, `token=${tokenParam}`),
                error: onError
            });
            return;
        }

        const id = idParam ? Number(idParam) : NaN;
        if (!Number.isFinite(id) || id <= 0) {
            this.error = 'Missing or invalid movement id (?id=N or /:token).';
            this.loading = false;
            return;
        }
        this.movementService.getById(id).subscribe({
            next: (data) => onLoaded(Array.isArray(data) ? data[0] : data, `#${id}`),
            error: onError
        });
    }

    /** Generate a QR code (PNG data URL) that encodes the absolute URL of this
     *  CC preview. Prefers the opaque PublicToken so external scanners cannot
     *  enumerate movements by sequential ID; falls back to `?id=` if no token. */
    private generateQrCode(): void {
        if (!this.movement?.movementId) return;
        const path = this.movement.publicToken
            ? `/notesheet-preview/cc/${this.movement.publicToken}`
            : `/notesheet-preview/cc?id=${this.movement.movementId}`;
        const url = new URL(path, window.location.origin).toString();
        QRCode.toDataURL(url, { width: 160, margin: 1 })
            .then((dataUrl) => { this.qrDataUrl = dataUrl; })
            .catch((err) => { console.error('QR code generation failed', err); });
    }

    private buildHeaderLines(): void {
        this.letterNoBn = this.movement?.letterNo ? this.toBn(this.movement.letterNo) : '---';
        const d = this.movement?.letterDate ? new Date(this.movement.letterDate) : new Date();
        this.letterDateBn = this.formatBnDateShort(d);

        const departureDate = this.movement?.dateOfRelease
            ? new Date(this.movement.dateOfRelease)
            : d;
        // Release time from MovementInfo.ReleaseTime (free-form, e.g. "09:30"). No fallback.
        const releaseTimeBn = this.movement?.releaseTime ? this.toBn(this.movement.releaseTime) : '';
        const timePrefix = releaseTimeBn ? `${releaseTimeBn} ঘটিকা সময় ও তারিখ ` : '';
        this.departureTimeAndDateBn = `${timePrefix}${this.formatBnDateShort(departureDate)}`;

        // Vehicle label from MovementInfo.Vehicle enum (1 = সরকারী, 2 = বেসরকারী).
        const v = this.movement?.vehicle;
        this.vehicleLabelBn = v != null
            ? (MovementVehicleOptions.find((o) => o.value === v)?.label ?? '')
            : '';
    }

    /** Resolve every selected employee in parallel and render as a numbered Bangla list. */
    private loadEmployees(): void {
        const ids = this.parseIntArray(this.movement?.employeeIds);
        if (ids.length === 0) {
            this.loading = false;
            return;
        }

        // Per-employee: fetch search info, then overview (rank + prefix). Tolerant of failures.
        const tasks = ids.map((empId) =>
            this.empService.getEmployeeSearchInfo(empId).pipe(
                map((info) => info ?? null),
                catchError(() => of<EmployeeSearchInfoModel | null>(null))
            )
        );

        forkJoin(tasks).subscribe({
            next: (infos) => {
                // Now fetch overview for each (best-effort).
                const overviewTasks = infos.map((info) => this.fetchOverview(info));
                forkJoin(overviewTasks).subscribe({
                    next: (overviews) => {
                        this.employeeLines = infos.map((info, idx) => {
                            const overview = overviews[idx];
                            if (idx === 0 && overview) {
                                this.firstOverview = overview;
                                this.resolveStationAndSutro();
                            }
                            return {
                                serial: this.serialBn(idx + 1),
                                text: this.formatEmployeeLine(info, overview)
                            };
                        });
                        this.loading = false;
                    },
                    error: () => {
                        this.employeeLines = infos.map((info, idx) => ({
                            serial: this.serialBn(idx + 1),
                            text: this.formatEmployeeLine(info, null)
                        }));
                        this.loading = false;
                    }
                });
            },
            error: () => { this.loading = false; }
        });
    }

    private fetchOverview(info: EmployeeSearchInfoModel | null) {
        const e: any = info || {};
        const rabId: string = e.rabID ?? e.RABID ?? '';
        const serviceId: string = e.serviceId ?? e.ServiceId ?? '';
        if (!rabId && !serviceId) return of<EmployeeServiceOverview | null>(null);

        return this.servingMembersService.getPresentlyServingMembersPaginatedFiltered({
            pagination: { page_no: 1, row_per_page: 5 },
            filter: rabId ? { rabId } : { serviceId }
        }).pipe(
            map((res: any) => {
                const list: EmployeeServiceOverview[] =
                    (res?.datalist ?? res?.data ?? res ?? []) as EmployeeServiceOverview[];
                return Array.isArray(list) && list.length ? list[0] : null;
            }),
            catchError(() => of<EmployeeServiceOverview | null>(null))
        );
    }

    private formatEmployeeLine(
        info: EmployeeSearchInfoModel | null,
        overview: EmployeeServiceOverview | null
    ): string {
        const e: any = info || {};
        const o: any = overview || {};

        // Prefix (Bangla) — "এসআই", "সৈনিক", "এমএলএসএস" etc.
        const prefixId: number | undefined = o.prefixId ?? o.PrefixId;
        const prefixBn = (prefixId != null ? this.prefixLabels.get(prefixId)?.bn : '') ?? '';

        // Rank (Bangla) — falls back to the search info rankId when overview missing.
        const rankId: number | undefined = o.armyRankId ?? o.ArmyRankId ?? e.rankId ?? e.RankId;
        const rankBn = (rankId != null ? this.rankLabels.get(rankId)?.bn : '') ?? '';

        const nameBn = (e.fullNameBN ?? e.FullNameBN ?? e.fullNameEN ?? e.FullNameEN ?? '') as string;
        const id = (e.serviceId ?? e.ServiceId ?? e.rabID ?? e.RABID ?? '') as string;
        const idBn = id ? this.toBn(id) : '';

        // Format: "এসআই, মোঃ আলী হাসান (৮৬০৭১২২৩৩১)"
        // Prefix may already include the rank; if both present, comma-join.
        const lead = [prefixBn, rankBn].filter(Boolean).join(' ');
        const body = nameBn ? `${lead ? lead + ', ' : ''}${nameBn}` : lead;
        return idBn ? `${body} (${idBn})` : body;
    }

    /** Column 1 (জেলা এবং স্টেশন) and সূত্র — derive from first employee's RAB unit.
     *  জেলা এবং স্টেশন = Battalion HQ Bangla location (from basic-setup/rab-unit-aor).
     *  সূত্র = the RAB unit's Bangla name from CommonCode 'RabUnit'. */
    private resolveStationAndSutro(): void {
        const o: any = this.firstOverview || {};
        const rabUnitId: number | undefined = o.rabUnitId ?? o.RabUnitId;

        const rabUnitBn = (rabUnitId != null ? this.rabUnitLabels.get(rabUnitId)?.bn : '')
            ?? (o.rabUnit ?? o.RabUnit ?? '');
        this.sutroBn = rabUnitBn || 'র‍্যাব সদর দপ্তর';

        // Col 1: prefer the Battalion HQ Bangla location once loaded.
        this.applyDistrictAndStation();

        // Kick off the rab-unit-aor lookup if we have a RAB unit but no HQ yet.
        if (rabUnitId != null && !this.battalionHqBn && !this.battalionHqEn) {
            this.loadBattalionHq(rabUnitId);
        }
    }

    /** Fetch the Battalion HQ location for a RAB unit (Bangla preferred). */
    private loadBattalionHq(rabUnitId: number): void {
        this.masterBasicSetup.getRABUnitAORByRabUnit(rabUnitId).subscribe({
            next: (rows: any[]) => {
                if (!Array.isArray(rows) || rows.length === 0) return;
                const firstEn = rows.find((r) => !!(r?.locationOfBattalionHQ ?? r?.LocationOfBattalionHQ));
                if (firstEn) this.battalionHqEn = String(firstEn.locationOfBattalionHQ ?? firstEn.LocationOfBattalionHQ ?? '');
                const firstBn = rows.find((r) => !!(r?.locationOfBattalionHQBangla ?? r?.LocationOfBattalionHQBangla));
                if (firstBn) this.battalionHqBn = String(firstBn.locationOfBattalionHQBangla ?? firstBn.LocationOfBattalionHQBangla ?? '');
                this.applyDistrictAndStation();
            }
        });
    }

    /** Resolve the final district/station label: <RAB unit name>, <Battalion HQ location>. */
    private applyDistrictAndStation(): void {
        const hq = this.battalionHqBn || this.battalionHqEn || '';
        this.districtAndStationBn = [this.sutroBn, hq].filter(Boolean).join(', ');
    }

    private loadDestinedMotherUnit(): void {
        const id = this.movement?.destinedMotherUnitId;
        if (!id) { this.maybeFinaliseDestination(); return; }
        this.organizationService.GetAllOrgUnit().subscribe({
            next: (rows: any[]) => {
                const hit = (rows || []).find((r) => (r.orgId ?? r.OrgId) === id);
                if (hit) {
                    this.destinedMotherUnitNameBn = (hit.orgNameBN ?? hit.OrgNameBN ?? '') as string;
                    this.destinedMotherUnitNameEn = (hit.orgNameEN ?? hit.OrgNameEN ?? '') as string;
                }
                this.maybeFinaliseDestination();
            },
            error: () => this.maybeFinaliseDestination()
        });
    }

    private loadDestinedRABUnitHq(): void {
        const rabUnitId = this.movement?.destinedRABUnitId;
        if (!rabUnitId) { this.maybeFinaliseDestination(); return; }
        this.masterBasicSetup.getRABUnitAORByRabUnit(rabUnitId).subscribe({
            next: (rows: any[]) => {
                if (Array.isArray(rows) && rows.length) {
                    const firstEn = rows.find((r) => !!(r?.locationOfBattalionHQ ?? r?.LocationOfBattalionHQ));
                    if (firstEn) this.destinedRABUnitHqEn = String(firstEn.locationOfBattalionHQ ?? firstEn.LocationOfBattalionHQ ?? '');
                    const firstBn = rows.find((r) => !!(r?.locationOfBattalionHQBangla ?? r?.LocationOfBattalionHQBangla));
                    if (firstBn) this.destinedRABUnitHqBn = String(firstBn.locationOfBattalionHQBangla ?? firstBn.LocationOfBattalionHQBangla ?? '');
                }
                this.maybeFinaliseDestination();
            },
            error: () => this.maybeFinaliseDestination()
        });
    }

    private maybeFinaliseDestination(): void {
        // Mother unit name is the typical CC destination (e.g. "পার্সোনাল ম্যানেজমেন্ট-২, পুলিশ হেঃ কোঃ, ঢাকা").
        if (this.destinedMotherUnitNameBn) { this.destinationBn = this.destinedMotherUnitNameBn; return; }
        if (this.destinedMotherUnitNameEn) { this.destinationBn = this.destinedMotherUnitNameEn; return; }
        // RAB unit fallback.
        const rabUnitId = this.movement?.destinedRABUnitId;
        if (rabUnitId != null) {
            const labels = this.rabUnitLabels.get(rabUnitId);
            const rabBn = labels?.bn || labels?.en || '';
            const loc = this.destinedRABUnitHqBn || this.destinedRABUnitHqEn || '';
            this.destinationBn = [rabBn, loc].filter(Boolean).join(', ') || '---';
            return;
        }
        if (!this.destinationBn) this.destinationBn = '---';
    }

    // ── Label caches ──────────────────────────────────────────────────────

    private loadDistrictLabels(): void {
        this.masterBasicSetup.getAllByType('District').subscribe({
            next: (rows: any[]) => this.fillMap(this.districtLabels, rows)
        });
    }
    private loadRabUnitLabels(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (rows: any[]) => this.fillMap(this.rabUnitLabels, rows)
        });
    }
    private loadRankLabels(): void {
        this.masterBasicSetup.getAllByType('MotherOrgRank').subscribe({
            next: (rows: any[]) => this.fillMap(this.rankLabels, rows)
        });
    }
    private loadPrefixLabels(): void {
        this.masterBasicSetup.getAllByType('Prefix').subscribe({
            next: (rows: any[]) => this.fillMap(this.prefixLabels, rows)
        });
    }
    private fillMap(target: Map<number, { en: string; bn: string }>, rows: any[]): void {
        target.clear();
        for (const r of rows || []) {
            const id = r.codeId ?? r.CodeId;
            if (id == null) continue;
            target.set(id, {
                en: r.codeValueEN ?? r.CodeValueEN ?? '',
                bn: r.codeValueBN ?? r.CodeValueBN ?? ''
            });
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /** "06/05/2026" → "০৬/০৫/২০২৬". */
    private formatBnDateShort(d: Date): string {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = String(d.getFullYear());
        return this.toBn(`${dd}/${mm}/${yyyy}`);
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

    onPrint(): void { window.print(); }

    onEdit(): void {
        if (!this.movement?.movementId) return;
        this.router.navigate(['/movement-info'], { queryParams: { id: this.movement.movementId } });
    }

    onBack(): void {
        this.router.navigate(['/movement-list']);
    }

    // ── Export ─────────────────────────────────────────────────────────────

    async exportWord(): Promise<void> {
        if (!this.movement) return;
        try {
            const doc = this.buildWordDocument();
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `CC_${this.movement.movementId}.docx`);
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
            saveAs(pdfBlob, `CC_${this.movement.movementId}.pdf`);
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

    /** Twentieths of a point (twips) for the selected page size.
     *  Returns *portrait* dimensions — docx swaps them when orientation = LANDSCAPE. */
    private getPageDimensions(): { width: number; height: number } {
        switch (this.selectedPageSize) {
            case 'A4':     return { width: 11906, height: 16838 }; // 8.27" × 11.69"
            case 'Letter': return { width: 12240, height: 15840 }; // 8.5"  × 11"
            case 'Legal':
            default:       return { width: 12240, height: 20160 }; // 8.5"  × 14"
        }
    }

    /** Build the Word document (landscape, mirrors the on-screen CC layout). */
    private buildWordDocument(): Document {
        const m = this.movement!;
        // Word-friendly Bangla font (Nirmala UI ships with Windows 10+);
        // `cs` covers complex-script shaping needed for Bangla.
        const font = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const };
        const dims = this.getPageDimensions();
        const bnVehicle = this.vehicleLabelBn;
        const bnDate = this.letterDateBn;
        const bnTimeDate = this.departureTimeAndDateBn;

        // Font sizes in half-points (1pt = 2 half-points).
        const SZ_TITLE  = 28; // 14pt — main title
        const SZ_BODY   = 20; // 10pt — body text (posting +2pt)
        const SZ_TABLE  = 18; //  9pt — table header & cells (posting +2pt)
        const SZ_FOOTER = 16; //  8pt — footnote (unchanged)

        const para = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
            new Paragraph({
                alignment: opts.align,
                children: [new TextRun({
                    text,
                    bold: opts.bold,
                    size: opts.size ?? SZ_BODY,
                    font
                })]
            });

        const noBorder = {
            top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        };

        // Title + subtitle as full-page-width centered paragraphs
        const titlePara = para('কর্তব্যে প্রেরিত পুলিশ অফিসার কর্তৃক বহনীয় হুকুমনামা',
                               { size: SZ_TITLE, align: AlignmentType.CENTER });
        const subtitlePara = para('(নিয়ন্ত্রণ নং ১৬৩ এবং ৯০৯)',
                                  { size: SZ_BODY, align: AlignmentType.CENTER });

        // Right-side QR image paragraph (if available).
        // docx v9+ requires the `type` discriminator on ImageRun (otherwise the
        // generated .docx is rejected by Word with "we found a problem with its
        // contents"). The data URL we produced via qrcode is PNG.
        const qrParagraphs: Paragraph[] = [];
        if (this.qrDataUrl) {
            const base64 = this.qrDataUrl.split(',')[1] ?? '';
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            qrParagraphs.push(new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new ImageRun({
                    type: 'png',
                    data: bytes,
                    transformation: { width: 80, height: 80 }
                })]
            }));
        } else {
            qrParagraphs.push(para(''));
        }

        // Form-numbers strip — 2 columns: form numbers (left) / QR (right)
        const formNumbersStrip = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                ...noBorder,
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            borders: noBorder,
                            children: [
                                para('বি পি ফরম নং ১০', { size: SZ_BODY }),
                                para('বাংলাদেশ ফরম নং ৫৩৩৬', { size: SZ_BODY })
                            ]
                        }),
                        new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            borders: noBorder,
                            children: qrParagraphs
                        })
                    ]
                })
            ]
        });

        // Second strip — M CC No (left) + vehicle / date (right)
        const secondStrip = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                ...noBorder,
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 60, type: WidthType.PERCENTAGE },
                            borders: noBorder,
                            children: [para('এম সিসি নং ৪১৭০/২০২৬', { size: SZ_BODY })]
                        }),
                        new TableCell({
                            width: { size: 40, type: WidthType.PERCENTAGE },
                            borders: noBorder,
                            children: [
                                ...(bnVehicle ? [para(bnVehicle, { size: SZ_BODY, align: AlignmentType.RIGHT })] : []),
                                para(`তারিখঃ ${bnDate}`, { size: SZ_BODY, align: AlignmentType.RIGHT })
                            ]
                        })
                    ]
                })
            ]
        });

        const allBorder = {
            top:    { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            left:   { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            right:  { style: BorderStyle.SINGLE, size: 6, color: '000000' }
        };

        // Inner cell padding (twips: 1pt = 20). ~6pt all-round mirrors the
        // 4pt 6pt padding used on the on-screen .cc-cell rule.
        const cellMargins = { top: 120, bottom: 120, left: 120, right: 120 };

        const th = (text: string, opts: { rowSpan?: number; columnSpan?: number; width?: number } = {}) =>
            new TableCell({
                rowSpan: opts.rowSpan,
                columnSpan: opts.columnSpan,
                width: opts.width != null ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
                borders: allBorder,
                margins: cellMargins,
                verticalAlign: 'center' as any,
                children: [para(text, { size: SZ_TABLE, align: AlignmentType.CENTER })]
            });

        // Header rows of the bordered grid
        const headerRow1 = new TableRow({
            children: [
                th('জেলা এবং স্টেশন',         { rowSpan: 2, width: 5 }),
                th('বাহিনীর পূর্ণ বিবরণ ও নাম', { rowSpan: 2, width: 24 }),
                th('গন্তব্যস্থল',               { rowSpan: 2, width: 5 }),
                th('কাজের বিবরণ এবং যতজন চাওয়া হয়েছে', { rowSpan: 2, width: 28 }),
                th(bnTimeDate,                 { columnSpan: 3 }),
                th('মন্তব্য (ফেরার সময়, তারিখ ইত্যাদি লিখিতে হইবে)', { rowSpan: 2, width: 4 })
            ]
        });
        const headerRow2 = new TableRow({
            children: [
                th('প্রস্থান',                            { width: 10 }),
                th('পৌঁছানোর',                          { width: 10 }),
                th('ফেরত আসার অনুমতি (প্রদানকারী অফিসারের স্বাক্ষরসহ)', { width: 14 })
            ]
        });

        // Body row
        const bodyParagraphs = (children: Paragraph[]) => children.length ? children : [para('')];
        const employeeParas = this.employeeLines.map((l) => para(`${l.serial} ${l.text}`, { size: SZ_TABLE }));

        // Strip HTML from auth/remarks for Word output (keeps things simple — rich
        // formatting is preserved in the screen preview only).
        const stripHtml = (html: string | null | undefined): string => {
            if (!html) return '';
            const div = document.createElement('div');
            div.innerHTML = html;
            return (div.textContent || div.innerText || '').trim();
        };
        const authText = stripHtml(m.auth);
        const remarksText = stripHtml(m.remarks);

        const workDescParas: Paragraph[] = [];
        workDescParas.push(para(`সূত্রঃ ${authText}`, { size: SZ_TABLE }));
        workDescParas.push(para(`স্মারক নং - ${this.letterNoBn} ${remarksText}`, { size: SZ_TABLE }));
        workDescParas.push(para(''));
        workDescParas.push(para(''));
        workDescParas.push(para('নির্বাহী কর্মকর্তা',  { size: SZ_TABLE, align: AlignmentType.CENTER }));
        workDescParas.push(para('র‍্যাব ফোর্সেস সদর দপ্তর', { size: SZ_TABLE, align: AlignmentType.CENTER }));
        workDescParas.push(para('কুর্মিটোলা, ঢাকা।',    { size: SZ_TABLE, align: AlignmentType.CENTER }));

        const bodyRow = new TableRow({
            // Force a tall body row so the table fills the page even when there's
            // little content (twips: 1pt = 20 → 5000 = 250pt ≈ 3.5"). `ATLEAST`
            // means the row will grow further if content needs more space.
            height: { value: 5000, rule: HeightRule.ATLEAST },
            children: [
                new TableCell({
                    borders: allBorder,
                    margins: cellMargins,
                    verticalAlign: 'center' as any,
                    children: [para(this.districtAndStationBn || '---', { size: SZ_TABLE, align: AlignmentType.CENTER })]
                }),
                new TableCell({
                    borders: allBorder,
                    margins: cellMargins,
                    children: bodyParagraphs(employeeParas)
                }),
                new TableCell({
                    borders: allBorder,
                    margins: cellMargins,
                    verticalAlign: 'center' as any,
                    children: [para(this.destinationBn || '---', { size: SZ_TABLE, align: AlignmentType.CENTER })]
                }),
                new TableCell({
                    borders: allBorder,
                    margins: cellMargins,
                    columnSpan: 4,
                    children: workDescParas
                }),
                new TableCell({
                    borders: allBorder,
                    margins: cellMargins,
                    children: [para('')]
                })
            ]
        });

        const grid = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow1, headerRow2, bodyRow]
        });

        const footnote = para(
            'দ্রষ্টব্য - কোন বিলম্ব হইলে সঙ্গে সঙ্গে শেষ চার কলামের লিখিত বিবরণ খুঁজিয়া বাহির করিতে হইবে। বিলম্বকারীকে অভিযুক্ত করিতে হইবে। তদন্তকারী অফিসার তাহার কৈফিয়ত হুকুমনামার পর পৃষ্ঠায় লিখিবেন এবং সুপারের কাছে আদেশের জন্য পাঠাইবেন।',
            { size: SZ_FOOTER }
        );

        return new Document({
            sections: [{
                properties: {
                    page: {
                        size: {
                            width: dims.width,
                            height: dims.height,
                            orientation: PageOrientation.LANDSCAPE
                        },
                        margin: { top: 720, bottom: 720, left: 720, right: 720 } // 0.5"
                    }
                },
                children: [titlePara, subtitlePara, formNumbersStrip, secondStrip, para(''), grid, footnote]
            }]
        });
    }
}
