import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';

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
    imports: [CommonModule, ButtonModule, Toast],
    providers: [MessageService],
    templateUrl: './notesheet-preview-mo.html',
    styleUrl: '../notesheet-preview.scss'
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

    loading = true;
    error: string | null = null;
    movement: MovementInfoModel | null = null;

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
}
