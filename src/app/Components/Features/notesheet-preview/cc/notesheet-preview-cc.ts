import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { MovementInfoService } from '@/services/movement-info.service';
import { MovementInfoModel } from '@/models/movement-info.model';
import { EmpService } from '@/services/emp-service';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';

interface EmployeeLine {
    serial: string;          // ১। ২। … in Bangla
    text: string;            // "এসআই, মোঃ আলী হাসান (৮৬০৭১২২৩৩১)"
}

@Component({
    selector: 'app-notesheet-preview-cc',
    standalone: true,
    imports: [CommonModule, ButtonModule, Toast],
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

    loading = true;
    error: string | null = null;
    movement: MovementInfoModel | null = null;

    /** Numbered Bangla list of employees rendered in column 2 (বাহিনীর পূর্ণ বিবরণ ও নাম). */
    employeeLines: EmployeeLine[] = [];

    /** First employee's overview — used to resolve current unit / district / station. */
    private firstOverview: EmployeeServiceOverview | null = null;

    /** Header / column values. */
    letterNoBn = '';
    letterDateBn = '';
    departureTimeAndDateBn = '';   // "০৯:৩০ ঘটিকা সময় ও তারিখ ০৬/০৫/২০২৬"
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
                this.buildHeaderLines();
                this.loadEmployees();
                this.loadDestinedMotherUnit();
                this.loadDestinedRABUnitHq();
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
        this.letterNoBn = this.movement?.letterNo ? this.toBn(this.movement.letterNo) : '---';
        const d = this.movement?.letterDate ? new Date(this.movement.letterDate) : new Date();
        this.letterDateBn = this.formatBnDateShort(d);

        const departureDate = this.movement?.dateOfRelease
            ? new Date(this.movement.dateOfRelease)
            : d;
        this.departureTimeAndDateBn = `${this.toBn('09:30')} ঘটিকা সময় ও তারিখ ${this.formatBnDateShort(departureDate)}`;
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

    /** Column 1 (জেলা এবং স্টেশন) and সূত্র — derive from first employee's RAB unit. */
    private resolveStationAndSutro(): void {
        const o: any = this.firstOverview || {};
        const rabUnitId: number | undefined = o.rabUnitId ?? o.RabUnitId;

        // RAB unit Bangla name (e.g. "র‍্যাব সদর দপ্তর") + location ("কুর্মিটোলা, ঢাকা").
        const rabUnitBn = (rabUnitId != null ? this.rabUnitLabels.get(rabUnitId)?.bn : '')
            ?? (o.rabUnit ?? o.RabUnit ?? '');
        const location = (o.location ?? o.Location ?? '') as string;

        this.districtAndStationBn = [rabUnitBn, location].filter(Boolean).join(', ');
        this.sutroBn = rabUnitBn || 'র‍্যাব সদর দপ্তর';
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
}
