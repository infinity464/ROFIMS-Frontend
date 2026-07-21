import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, HeightRule,
    ImageRun, TableLayoutType
} from 'docx';
import { saveAs } from 'file-saver';
import * as QRCode from 'qrcode';

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
import { JsReportService } from '@/services/jsreport.service';
import { embedBanglaFontCss, collectDocumentStyles, BANGLA_DOC_FONT_STACK } from '@/shared/utils/bangla-font.util';
import { MovementReturnButtonComponent } from '../shared/movement-return-button';
import { MovementFilesInfoComponent } from '../shared/movement-files-info';

interface EmployeeLine {
    serial: string;          // ১। ২। … in Bangla
    text: string;            // "এসআই, মোঃ আলী হাসান (৮৬০৭১২২৩৩১)"
}

interface ApproverBlock {
    name: string;            // "মেজর মোঃ শাহরিয়ার কবির"
}

@Component({
    selector: 'app-notesheet-preview-cc',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, SelectModule, Toast, MovementReturnButtonComponent, MovementFilesInfoComponent],
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
    private jsreportService = inject(JsReportService);

    @ViewChild('paper') paper!: ElementRef<HTMLDivElement>;

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
        { label: 'A4',        value: 'A4'        }
    ];
    selectedPageSize: 'Legal' | 'A4' | 'Letter' = 'A4';

    /** Numbered Bangla list of employees rendered in column 2 (বাহিনীর পূর্ণ বিবরণ ও নাম). */
    employeeLines: EmployeeLine[] = [];

    /** One signature block per Final Approver (name + own unit/HQ).
     *  Empty when no approver is set — UI falls back to a single
     *  default block using the requesting unit. */
    approverBlocks: ApproverBlock[] = [];

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
            this.loadApprovers();
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
            ? `/movement-preview/cc/${this.movement.publicToken}`
            : `/movement-preview/cc?id=${this.movement.movementId}`;
        const url = new URL(path, window.location.origin).toString();
        QRCode.toDataURL(url, { width: 160, margin: 1 })
            .then((dataUrl: string) => { this.qrDataUrl = dataUrl; })
            .catch((err: unknown) => { console.error('QR code generation failed', err); });
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
                            if (idx === 0) {
                                this.firstOverview = overview ?? null;
                                // Run even without an overview — the movement's
                                // CurrentUnitId alone can resolve জেলা/স্টেশন.
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
                        // Still resolve জেলা/স্টেশন from the movement's CurrentUnitId.
                        this.resolveStationAndSutro();
                        this.loading = false;
                    }
                });
            },
            error: () => { this.loading = false; }
        });
    }

    /** Load every approver from movement.finalApproverIds and build one
     *  signature block per approver. Uses GetEmployeePersonalServiceOverview
     *  (direct lookup by employeeId) so the rank + name reliably resolve.
     *  The trailing lines under "নির্বাহী কর্মকর্তা" are the shared
     *  জেলা এবং স্টেশন lines (requesting unit), not per-approver. */
    private loadApprovers(): void {
        const ids = this.parseIntArray(this.movement?.finalApproverIds);
        if (ids.length === 0) return;

        const profileTasks = ids.map((id) =>
            this.servingMembersService.getEmployeePersonalServiceOverview(id).pipe(
                map((p) => p ?? null),
                catchError(() => of<any | null>(null))
            )
        );

        forkJoin(profileTasks).subscribe({
            next: (profiles) => {
                this.approverBlocks = profiles.map((profile) => ({
                    name: this.formatApproverLineFromProfile(profile)
                }));
            }
        });
    }

    /** Format "<rank> <name>" (Bangla preferred) from a personal-service-overview row. */
    private formatApproverLineFromProfile(profile: any): string {
        if (!profile) return '';
        const rankBn = (profile.armyRankBN as string | null)
            || (profile.armyRankId != null ? this.rankLabels.get(profile.armyRankId)?.bn : '')
            || (profile.armyRank as string | null)
            || '';
        const nameBn = (profile.nameBN as string | null)
            || (profile.nameEnglish as string | null)
            || '';
        return [rankBn, nameBn].filter(Boolean).join(' ').trim();
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

    /** Column 1 (জেলা এবং স্টেশন) and সূত্র — derive from the movement's stored
     *  CurrentUnitId (the member's current RAB unit; RAB HQ for new postings),
     *  falling back to the first employee's overview RAB unit for legacy rows.
     *  জেলা এবং স্টেশন = Battalion HQ Bangla location (from basic-setup/rab-unit-aor).
     *  সূত্র = the RAB unit's Bangla name from CommonCode 'RabUnit'. */
    private resolveStationAndSutro(): void {
        const o: any = this.firstOverview || {};
        // Legacy rows stored the mother unit in currentUnitId — only trust it
        // when it resolves as a real RabUnit code.
        const movementUnitId = this.movement?.currentUnitId;
        const overviewUnitId: number | undefined = o.rabUnitId ?? o.RabUnitId;
        const rabUnitId: number | undefined =
            movementUnitId != null && this.rabUnitLabels.has(movementUnitId)
                ? movementUnitId
                : (overviewUnitId ?? undefined);

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

    /** Comma-separated districtAndStationBn split into individual lines —
     *  reused as the signature block at the bottom of the work-description cell. */
    get districtAndStationLines(): string[] {
        return (this.districtAndStationBn || '')
            .split(',')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
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
            next: (rows: any[]) => {
                this.fillMap(this.rabUnitLabels, rows);
                // Labels may arrive after the movement/employees — re-resolve so
                // জেলা/স্টেশন picks up the unit name once it's known.
                if (this.movement) this.resolveStationAndSutro();
            }
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

    /** Filename stem from the LetterNo (e.g. "CC-2026/05/10001" → "CC-2026_05_10001"),
     *  falling back to the movement ID for legacy rows without a letter no. */
    private exportFileStem(): string {
        const raw = this.movement?.letterNo;
        if (raw && raw.trim()) {
            return raw.replace(/[\\/:*?"<>|]+/g, '_').trim();
        }
        return `CC_${this.movement?.movementId ?? 'export'}`;
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
        const sz = this.selectedPageSize;
        // Rewrite the body-row height directly in the collected CSS: the on-screen
        // rule `tbody .cc-cell { padding-bottom: 150pt }` is Angular-scoped and
        // !important, so a separate override can't out-specify it. A4 landscape is
        // shorter than Legal/Letter (210mm vs 215.9mm tall), so the same row height
        // spills to a 2nd page — give A4 a reduced value (~−25pt at the 0.667 zoom)
        // so it fits one page.
        const rowPad = sz === 'A4' ? 217 : 242;
        const styles = collectDocumentStyles()
            .replace(/padding-bottom:\s*150pt/gi, `padding-bottom:${rowPad}pt`);
        const fontCss = await embedBanglaFontCss();
        const body = this.paper.nativeElement.innerHTML;
        // CC is a wide grid → LANDSCAPE: page width = the long edge, height = short.
        const pageWidth = sz === 'A4' ? '297mm' : sz === 'Letter' ? '279.4mm' : '355.6mm';
        const pageHeight = sz === 'A4' ? '210mm' : '215.9mm';
        const padX = 10, padTop = 14, padBottom = 20; // mm — .a4-paper padding
        // Text column = page width − both side insets.
        const colWidth = sz === 'A4' ? '277mm' : sz === 'Letter' ? '259.4mm' : '335.6mm';

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${styles}

/* SolaimanLipi inlined as base64 — JsReport has no base URL to resolve the app's
   relative /assets/fonts reference. See bangla-font.util.ts. */
${fontCss}

@page { size: ${pageWidth} ${pageHeight}; margin: ${padTop}mm ${padX}mm ${padBottom}mm ${padX}mm; }
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

/* Follow the docx font sizes: the on-screen CC content uses larger inline pt
   sizes (12pt body / 19pt title) plus a viewport-based responsive zoom. Lock a
   fixed zoom that (a) neutralises the @media zoom rules in headless Chromium and
   (b) maps the on-screen sizes to the docx sizes — ×8/12 → 12pt body becomes
   8pt, 19pt title becomes ~12pt — matching the Word output. */
.pdf-flow .cc-content-scale { zoom: 0.667 !important; }
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
            landscape: true,
            marginTop: '0', marginBottom: '0', marginLeft: '0', marginRight: '0',
            printBackground: true,
            displayHeaderFooter: false,
            headerTemplate: '', footerTemplate: ''
        };

        return { html, chrome };
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
        // Word-friendly Bangla font (SolaimanLipi ships with Windows 10+);
        // `cs` covers complex-script shaping needed for Bangla.
        const font = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const };
        const dims = this.getPageDimensions();
        // Printable width in landscape = page-height twips minus 2 × 0.5" margins (1440 twips).
        // getPageDimensions() returns *portrait* dims, so `height` is the longer side.
        const contentWidth = dims.height - 1440;
        const bnVehicle = this.vehicleLabelBn;
        const bnDate = this.letterDateBn;
        const bnTimeDate = this.departureTimeAndDateBn;

        // Font sizes in half-points (1pt = 2 half-points). Cumulative −2pt vs. earlier.
        const SZ_TITLE  = 24; // 12pt — main title
        const SZ_BODY   = 16; //  8pt — body text
        const SZ_TABLE  = 16; //  8pt — table header & cells (+1pt)
        const SZ_FOOTER = 16; //  8pt — footnote (+2pt)

        // Bangla language tags on every run so LibreOffice / Word use the
        // complex-script shaper. Without these, Bengali conjuncts render as
        // empty boxes in the LibreOffice → PDF pipeline even though the same
        // font renders them correctly in Word.
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;

        const para = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; indentRight?: number; spacingBefore?: number } = {}) => {
            const sz = opts.size ?? SZ_BODY;
            return new Paragraph({
                alignment: opts.align,
                indent: opts.indentRight != null ? { right: opts.indentRight } : undefined,
                spacing: opts.spacingBefore != null ? { before: opts.spacingBefore } : undefined,
                children: [new TextRun({
                    text,
                    bold: opts.bold,
                    size: sz,
                    sizeComplexScript: sz,
                    font,
                    language: bnLang
                })]
            });
        };

        const noBorder = {
            top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        };

        // QR image paragraph (PNG, right-aligned in its own cell).
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

        // 3-column top row: form-numbers (15%) / title + subtitle (70%) / QR (15%).
        // Wider center column ensures the title fits on one line in both Word
        // and LibreOffice. FIXED layout prevents either renderer from rebalancing.
        const sideColW = Math.round(contentWidth * 0.15);
        const centerColW = contentWidth - 2 * sideColW;
        const topHeaderStrip = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [sideColW, centerColW, sideColW],
            layout: TableLayoutType.FIXED,
            borders: {
                ...noBorder,
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: sideColW, type: WidthType.DXA },
                            borders: noBorder,
                            verticalAlign: 'top' as any,
                            children: [
                                // Blank line at top so the form numbers sit on the
                                // 2nd line (aligned with the title's subtitle).
                                para(''),
                                para('বি পি ফরম নং ১০', { size: SZ_BODY }),
                                para('বাংলাদেশ ফরম নং ৫৩৩৬', { size: SZ_BODY })
                            ]
                        }),
                        new TableCell({
                            width: { size: centerColW, type: WidthType.DXA },
                            borders: noBorder,
                            verticalAlign: 'top' as any,
                            children: [
                                para('কর্তব্যে প্রেরিত পুলিশ অফিসার কর্তৃক বহনীয় হুকুমনামা',
                                     { size: SZ_TITLE, align: AlignmentType.CENTER }),
                                para('(নিয়ন্ত্রণ নং ১৬৩ এবং ৯০৯)',
                                     { size: SZ_BODY, align: AlignmentType.CENTER })
                            ]
                        }),
                        new TableCell({
                            width: { size: sideColW, type: WidthType.DXA },
                            borders: noBorder,
                            verticalAlign: 'top' as any,
                            children: qrParagraphs
                        })
                    ]
                })
            ]
        });

        // Second strip — M CC No (left, 60%) + vehicle / date (right, 40%).
        // Explicit DXA + FIXED layout so Word doesn't shrink the cells to
        // character-width (same auto-fit issue as the top header).
        const secondLeftW = Math.round(contentWidth * 0.6);
        const secondRightW = contentWidth - secondLeftW;
        const secondStrip = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: [secondLeftW, secondRightW],
            layout: TableLayoutType.FIXED,
            borders: {
                ...noBorder,
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: secondLeftW, type: WidthType.DXA },
                            borders: noBorder,
                            children: [para(`এম সিসি নং ${this.letterNoBn}`, { size: SZ_BODY })]
                        }),
                        new TableCell({
                            width: { size: secondRightW, type: WidthType.DXA },
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

        // Compute explicit twip widths for each of the 8 grid columns. Using
        // percentages alone isn't respected by LibreOffice during PDF rendering;
        // explicit DXA widths + `columnWidths` on the Table guarantee the same
        // layout in Word and the PDF/Print Preview pipeline.
        // `contentWidth` already accounts for landscape page + 0.5" margins.
        const colPctGrid = [5, 24, 6, 26, 10, 10, 14, 5]; // sums to 100
        const colWidths = colPctGrid.map((p) => Math.round((contentWidth * p) / 100));
        // Fix any rounding drift so the columns add up exactly to contentWidth.
        const widthSum = colWidths.reduce((a, b) => a + b, 0);
        colWidths[colWidths.length - 1] += (contentWidth - widthSum);

        const th = (text: string, opts: { rowSpan?: number; columnSpan?: number; widthTwips?: number } = {}) =>
            new TableCell({
                rowSpan: opts.rowSpan,
                columnSpan: opts.columnSpan,
                width: opts.widthTwips != null ? { size: opts.widthTwips, type: WidthType.DXA } : undefined,
                borders: allBorder,
                margins: cellMargins,
                verticalAlign: 'center' as any,
                children: [para(text, { size: SZ_TABLE, align: AlignmentType.CENTER })]
            });

        // Header rows of the bordered grid
        const headerRow1 = new TableRow({
            children: [
                th('জেলা এবং স্টেশন',                              { rowSpan: 2, widthTwips: colWidths[0] }),
                th('বাহিনীর পূর্ণ বিবরণ ও নাম',                      { rowSpan: 2, widthTwips: colWidths[1] }),
                th('গন্তব্যস্থল',                                  { rowSpan: 2, widthTwips: colWidths[2] }),
                th('কাজের বিবরণ এবং যতজন চাওয়া হয়েছে',          { rowSpan: 2, widthTwips: colWidths[3] }),
                th(bnTimeDate, { columnSpan: 3, widthTwips: colWidths[4] + colWidths[5] + colWidths[6] }),
                th('মন্তব্য (ফেরার সময়, তারিখ ইত্যাদি লিখিতে হইবে)', { rowSpan: 2, widthTwips: colWidths[7] })
            ]
        });
        const headerRow2 = new TableRow({
            children: [
                th('প্রস্থান',                                                 { widthTwips: colWidths[4] }),
                th('পৌঁছানোর',                                                { widthTwips: colWidths[5] }),
                th('ফেরত আসার অনুমতি (প্রদানকারী অফিসারের স্বাক্ষরসহ)', { widthTwips: colWidths[6] })
            ]
        });

        // Body row
        const bodyParagraphs = (children: Paragraph[]) => children.length ? children : [para('')];
        const employeeParas = this.employeeLines.map((l) => para(`${l.serial} ${l.text}`, { size: SZ_TABLE }));

        // Quill HTML → docx Paragraphs (one per top-level <p>/<div>). ZWJ/ZWNJ
        // are preserved so words like "র‍্যাব" render correctly.
        const cleanText = (s: string): string =>
            s.trim().normalize('NFC').replace(/ /g, ' ');
        const htmlToParagraphs = (html: string | null | undefined, opts: { size?: number; firstPrefix?: string } = {}): Paragraph[] => {
            if (!html) return [];
            const div = document.createElement('div');
            div.innerHTML = html;
            const blocks = Array.from(div.querySelectorAll('p, div'));
            const sourceTexts = blocks.length > 0
                ? blocks.map((el) => cleanText(el.textContent || ''))
                : [cleanText(div.textContent || '')];
            return sourceTexts.map((t, idx) => {
                const prefix = idx === 0 && opts.firstPrefix ? opts.firstPrefix : '';
                return para(prefix + t, { size: opts.size });
            });
        };
        const sutroParas = m.auth
            ? htmlToParagraphs(m.auth, { firstPrefix: 'সূত্রঃ ', size: SZ_TABLE })
            : [para('সূত্রঃ', { size: SZ_TABLE })];
        const smarakParas = m.remarks
            ? htmlToParagraphs(m.remarks, { firstPrefix: `স্মারক নং - ${this.letterNoBn} `, size: SZ_TABLE })
            : [para(`স্মারক নং - ${this.letterNoBn}`, { size: SZ_TABLE })];

        // The work-description cell mixes Paragraphs (sutro / smarak) with a
        // nested Table (the signature row). Side-by-side approver columns
        // mirror the on-screen `inline-block` layout.
        const workDescChildren: (Paragraph | Table)[] = [];
        workDescChildren.push(...sutroParas);
        workDescChildren.push(...smarakParas);
        // Larger top gap before the signature row.
        for (let i = 0; i < 6; i++) workDescChildren.push(para(''));

        // Build one cell per approver (or a single default cell when none).
        const sigCellParas = (name: string, unitLines: string[]): Paragraph[] => {
            const out: Paragraph[] = [];
            if (name) {
                out.push(para(name, { size: SZ_TABLE, align: AlignmentType.CENTER }));
            }
            out.push(para('নির্বাহী কর্মকর্তা', { size: SZ_TABLE, align: AlignmentType.CENTER }));
            for (const line of unitLines) {
                out.push(para(line, { size: SZ_TABLE, align: AlignmentType.CENTER }));
            }
            return out;
        };

        // Each signature column gets a fixed width; the whole sub-table is
        // right-aligned within the work-description cell so the blocks sit
        // on the right side instead of spreading across the full cell width.
        const SIG_COL_TWIPS = 3000; // ~150pt — enough for the longest expected name
        const sigCells: TableCell[] = [];
        const sigBlocks = this.approverBlocks.length > 0
            ? this.approverBlocks.map((b) => ({ name: b.name }))
            : [{ name: '' }];
        for (const block of sigBlocks) {
            sigCells.push(new TableCell({
                width: { size: SIG_COL_TWIPS, type: WidthType.DXA },
                borders: noBorder,
                margins: cellMargins,
                verticalAlign: 'top' as any,
                children: sigCellParas(block.name, this.districtAndStationLines)
            }));
        }

        workDescChildren.push(new Table({
            width: { size: SIG_COL_TWIPS * sigCells.length, type: WidthType.DXA },
            columnWidths: sigCells.map(() => SIG_COL_TWIPS),
            alignment: AlignmentType.RIGHT,
            borders: {
                ...noBorder,
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
            },
            rows: [new TableRow({ children: sigCells })]
        }));

        const bodyRow = new TableRow({
            // Force a tall body row so the table fills the page even when there's
            // little content (twips: 1pt = 20 → 5000 = 250pt ≈ 3.5"). `ATLEAST`
            // means the row will grow further if content needs more space.
            height: { value: 5000, rule: HeightRule.ATLEAST },
            children: [
                new TableCell({
                    width: { size: colWidths[0], type: WidthType.DXA },
                    borders: allBorder,
                    margins: cellMargins,
                    verticalAlign: 'center' as any,
                    children: [para(this.districtAndStationBn || '---', { size: SZ_TABLE, align: AlignmentType.CENTER })]
                }),
                new TableCell({
                    width: { size: colWidths[1], type: WidthType.DXA },
                    borders: allBorder,
                    margins: cellMargins,
                    children: bodyParagraphs(employeeParas)
                }),
                new TableCell({
                    width: { size: colWidths[2], type: WidthType.DXA },
                    borders: allBorder,
                    margins: cellMargins,
                    verticalAlign: 'center' as any,
                    children: [para(this.destinationBn || '---', { size: SZ_TABLE, align: AlignmentType.CENTER })]
                }),
                new TableCell({
                    width: { size: colWidths[3] + colWidths[4] + colWidths[5] + colWidths[6], type: WidthType.DXA },
                    borders: allBorder,
                    margins: cellMargins,
                    columnSpan: 4,
                    children: workDescChildren
                }),
                new TableCell({
                    width: { size: colWidths[7], type: WidthType.DXA },
                    borders: allBorder,
                    margins: cellMargins,
                    children: [para('')]
                })
            ]
        });

        const grid = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            columnWidths: colWidths,
            rows: [headerRow1, headerRow2, bodyRow]
        });

        const footnote = para(
            'দ্রষ্টব্য - কোন বিলম্ব হইলে সঙ্গে সঙ্গে শেষ চার কলামের লিখিত বিবরণ খুঁজিয়া বাহির করিতে হইবে। বিলম্বকারীকে অভিযুক্ত করিতে হইবে। তদন্তকারী অফিসার তাহার কৈফিয়ত হুকুমনামার পর পৃষ্ঠায় লিখিবেন এবং সুপারের কাছে আদেশের জন্য পাঠাইবেন।',
            // 4px top margin at 96 DPI ≈ 60 twips.
            { size: SZ_FOOTER, spacingBefore: 60 }
        );

        return new Document({
            styles: {
                default: {
                    document: {
                        run: {
                            font,
                            language: bnLang
                        }
                    }
                }
            },
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
                children: [topHeaderStrip, secondStrip, para(''), grid, footnote]
            }]
        });
    }
}
