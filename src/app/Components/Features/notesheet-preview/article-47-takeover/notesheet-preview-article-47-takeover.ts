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
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';

@Component({
    selector: 'app-notesheet-preview-article-47-takeover',
    standalone: true,
    imports: [CommonModule, ButtonModule, Toast],
    providers: [MessageService],
    templateUrl: './notesheet-preview-article-47-takeover.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewArticle47TakeoverComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private movementService = inject(MovementInfoService);
    private empService = inject(EmpService);
    private servingMembersService = inject(ServingMembersService);
    private masterBasicSetup = inject(MasterBasicSetupService);
    private messageService = inject(MessageService);

    loading = true;
    error: string | null = null;
    movement: MovementInfoModel | null = null;

    /** First (and only, for Article 47) employee on the movement — used in the signature block. */
    employee: EmployeeSearchInfoModel | null = null;
    /** EmployeeServiceOverview row — same source as /presently-serving-members. */
    overview: EmployeeServiceOverview | null = null;
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
        if (!e) return 'বিডি/-----';
        const id = e.rabID ?? e.RABID ?? e.serviceId ?? e.ServiceId ?? '';
        return id ? `বিডি/${this.toBn(id)}` : 'বিডি/-----';
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
        if (corpsId != null) {
            const labels = this.corpsLabels.get(corpsId);
            if (labels?.bn) return labels.bn;
            if (labels?.en) return labels.en;
        }
        return (e?.corps ?? e?.Corps ?? o?.corps ?? o?.Corps ?? '') as string;
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
}
