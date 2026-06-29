import { Component, HostListener, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { forkJoin, of, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Packer } from 'docx';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { environment } from '@/Core/Environments/environment';
import {
    StatisticsService,
    type MotherUnitOrgOption,
    type MotherUnitRankColumn,
    type CorpsRow,
    type CorpsWiseManpowerResponse
} from '@/services/statistics.service';
import { OrgTreeFilterComponent } from '../shared/org-tree-filter/org-tree-filter.component';
import { RabReportPrintService } from '../shared/rab-report-print.service';

type Lang = 'en' | 'bn';

type CorpsOrgBlock = CorpsWiseManpowerResponse;

/**
 * Equivalent-name variant of the corps-wise manpower report. Identical to
 * CorpsWiseManpowerComponent except the columns are EquivalentName (the equivalent-name
 * man-power setup) instead of MotherOrgRank. Reuses the original template/styles.
 */
@Component({
    selector: 'app-corps-wise-equivalent-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule, OrgTreeFilterComponent],
    templateUrl: '../corps-wise-manpower/corps-wise-manpower.html',
    styleUrl: '../corps-wise-manpower/corps-wise-manpower.scss'
})
export class CorpsWiseEquivalentManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    loadingOrgs = false;
    exporting = false;
    exportDropdownOpen = false;

    orgOptions: MotherUnitOrgOption[] = [];
    selectedOrgIds: number[] = [];

    filteredOrgs: CorpsOrgBlock[] = [];

    grandTotal = 0;

    filterRabCodeId: number | null = null;
    filterLabel: string | null = null;

    /** Checked Regiment/Corps ids (rows shown). */
    selectedCorpsIds: number[] = [];
    /** Checked equivalent-name column ids (columns shown). */
    selectedRankIds: number[] = [];

    get corpsVisOptions(): { label: string; value: number }[] {
        const seen = new Map<number, { label: string; value: number }>();
        for (const org of this.filteredOrgs) {
            for (const c of org.corps) {
                if (!seen.has(c.corpsId)) {
                    seen.set(c.corpsId, { value: c.corpsId, label: this.lang === 'en' ? c.corpsName : (c.corpsNameBN || c.corpsName) });
                }
            }
        }
        return [...seen.values()];
    }

    get rankVisOptions(): { label: string; value: number }[] {
        const seen = new Map<number, { label: string; value: number }>();
        for (const org of this.filteredOrgs) {
            for (const r of org.ranks) {
                if (!seen.has(r.rankId)) {
                    seen.set(r.rankId, { value: r.rankId, label: this.lang === 'en' ? r.rankName : (r.rankNameBN || r.rankName) });
                }
            }
        }
        return [...seen.values()];
    }

    private resetVisibilitySelections(): void {
        this.selectedCorpsIds = this.corpsVisOptions.map(o => o.value);
        this.selectedRankIds = this.rankVisOptions.map(o => o.value);
    }

    visibleCorps(org: CorpsOrgBlock): CorpsRow[] {
        return org.corps.filter(c => this.selectedCorpsIds.includes(c.corpsId));
    }
    visibleRanks(org: CorpsOrgBlock): MotherUnitRankColumn[] {
        return org.ranks.filter(r => this.selectedRankIds.includes(r.rankId));
    }

    rowTotal(org: CorpsOrgBlock, c: CorpsRow): number {
        return this.visibleRanks(org).reduce((s, r) => s + this.cellValue(c, r.rankId), 0);
    }
    colSubtotal(org: CorpsOrgBlock, rankId: number): number {
        return this.visibleCorps(org).reduce((s, c) => s + this.cellValue(c, rankId), 0);
    }
    orgGrandTotal(org: CorpsOrgBlock): number {
        return this.visibleCorps(org).reduce((s, c) => s + this.rowTotal(org, c), 0);
    }
    get visibleGrandTotal(): number {
        return this.filteredOrgs.reduce((s, o) => s + this.orgGrandTotal(o), 0);
    }

    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;
    accessibleMemberTypeNames: string[] | null = null;
    accessibleMemberTypeNamesBN: string[] | null = null;

    private static readonly EN_MONTHS = [
        'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
        'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
    ];
    private static readonly BN_MONTHS = [
        'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
        'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'
    ];

    private http = inject(HttpClient);

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService,
        private rabPrint: RabReportPrintService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    onOrgTreeFilter(e: { codeId: number | null; label: string | null }): void {
        this.filterRabCodeId = e.codeId;
        this.filterLabel = e.label;
        this.onOrgFilterChange();
    }

    private buildCriteriaItems(): { label: string; value: string }[] {
        const bn = this.lang === 'bn';
        const items: { label: string; value: string }[] = [];
        const orgNames = this.filteredOrgs.map(o => this.orgLabel(o));
        if (orgNames.length) items.push({ label: bn ? 'বাহিনী' : 'ORGANIZATION', value: orgNames.join(', ') });
        if (this.filterLabel) items.push({ label: bn ? 'অফিস' : 'OFFICE', value: this.filterLabel });
        const unitNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames) ?? this.accessibleRabUnitNames;
        if (unitNames && unitNames.length > 0) items.push({ label: bn ? 'ইউনিট' : 'UNITS', value: unitNames.join(', ') });
        const mtNames = (bn ? this.accessibleMemberTypeNamesBN : this.accessibleMemberTypeNames) ?? this.accessibleMemberTypeNames;
        if (mtNames && mtNames.length > 0) items.push({ label: bn ? 'সদস্য ধরণ' : 'MEMBER TYPES', value: mtNames.join(', ') });
        if (items.length === 0) items.push({ label: bn ? 'পরিসর' : 'SCOPE', value: bn ? 'সকল ইউনিট' : 'All Unit' });
        return items;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadOrgOptions();
    }

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

    onOrgFilterChange(): void {
        const ids = this.selectedOrgIds ?? [];
        if (ids.length === 0) {
            this.filteredOrgs = [];
            this.grandTotal = 0;
            this.selectedCorpsIds = [];
            this.selectedRankIds = [];
            this.accessibleRabUnitNames = null;
            this.accessibleRabUnitNamesBN = null;
            this.accessibleMemberTypeNames = null;
            this.accessibleMemberTypeNamesBN = null;
            return;
        }
        this.loading = true;
        forkJoin(
            ids.map(id =>
                this.statisticsService.getCorpsWiseManpowerByEquivalentName(id, this.filterRabCodeId).pipe(
                    catchError(() => of(null as CorpsWiseManpowerResponse | null))
                )
            )
        ).subscribe({
            next: (results) => {
                this.filteredOrgs = (results ?? [])
                    .filter((r): r is CorpsWiseManpowerResponse => r != null);
                const first = this.filteredOrgs[0];
                this.accessibleRabUnitNames      = first?.accessibleRabUnitNames      ?? null;
                this.accessibleRabUnitNamesBN    = first?.accessibleRabUnitNamesBN    ?? null;
                this.accessibleMemberTypeNames   = first?.accessibleMemberTypeNames   ?? null;
                this.accessibleMemberTypeNamesBN = first?.accessibleMemberTypeNamesBN ?? null;
                this.grandTotal = this.filteredOrgs.reduce((sum, o) => sum + (o.grandTotal ?? 0), 0);
                this.resetVisibilitySelections();
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    get scopeLine(): string | null {
        const bn = this.lang === 'bn';
        const unitNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames)
            ?? this.accessibleRabUnitNames;
        const memberTypeNames = (bn ? this.accessibleMemberTypeNamesBN : this.accessibleMemberTypeNames)
            ?? this.accessibleMemberTypeNames;

        const parts: string[] = [];
        if (unitNames && unitNames.length > 0) {
            parts.push(unitNames.join(', '));
        }
        if (memberTypeNames && memberTypeNames.length > 0) {
            const label = bn ? 'সদস্য ধরণ' : 'Member Types';
            parts.push(`${label}: ${memberTypeNames.join(', ')}`);
        }
        return parts.length === 0 ? null : parts.join('  |  ');
    }

    toggleLang(): void { this.lang = this.lang === 'en' ? 'bn' : 'en'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        const scope = this.scopeLine;
        const sectionedConfig = {
            title: this.titleLabel,
            lang: this.lang,
            columns: [],
            sections: this.filteredOrgs.map(org => ({
                title: this.orgLabel(org),
                columns: [
                    this.serLabel,
                    this.corpsColLabel,
                    ...this.visibleRanks(org).map(r => this.rankLabel(r)),
                    this.totalLabel
                ],
                rows: this.visibleCorps(org).map((c, i) => [
                    this.fmt(i + 1),
                    this.corpsNameLabel(c),
                    ...this.visibleRanks(org).map(r => this.fmt(this.cellValue(c, r.rankId))),
                    this.fmt(this.rowTotal(org, c))
                ]),
                subtotalRow: [
                    '',
                    this.totalLabel,
                    ...this.visibleRanks(org).map(r => this.fmt(this.colSubtotal(org, r.rankId))),
                    this.fmt(this.orgGrandTotal(org))
                ]
            })),
            grandTotalRow: ['', this.grandTotalLabel, this.fmt(this.visibleGrandTotal)],
            showPageNumbers: true,
            filename: 'corps-wise-equivalent-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true,
            rabLetterhead: true,
            criteriaItems: this.buildCriteriaItems()
        };

        if (type === 'print') {
            this.rabPrint.print({
                lang: this.lang,
                reportTitle: this.titleLabel,
                criteriaItems: this.buildCriteriaItems(),
                columns: [],
                sections: this.filteredOrgs.map(org => {
                    const cols = [
                        { label: this.serLabel, align: 'center' as const },
                        { label: this.corpsColLabel, align: 'left' as const },
                        ...this.visibleRanks(org).map(r => ({ label: this.rankLabel(r), align: 'center' as const, mono: true })),
                        { label: this.totalLabel, align: 'center' as const, mono: true }
                    ];
                    return {
                        title: this.orgLabel(org),
                        columns: cols,
                        rows: this.visibleCorps(org).map((c, i) => [
                            this.fmt(i + 1),
                            this.corpsNameLabel(c),
                            ...this.visibleRanks(org).map(r => this.fmt(this.cellValue(c, r.rankId))),
                            this.fmt(this.rowTotal(org, c))
                        ]),
                        totalRow: [
                            '',
                            this.totalLabel,
                            ...this.visibleRanks(org).map(r => this.fmt(this.colSubtotal(org, r.rankId))),
                            this.fmt(this.orgGrandTotal(org))
                        ]
                    };
                })
            });
            return;
        }

        try {
            this.exporting = true;
            switch (type) {
                case 'word':
                    await this.exportService.exportWordSectioned(sectionedConfig);
                    break;
                case 'excel':
                    this.exportService.exportExcelSectioned(sectionedConfig);
                    break;
                case 'pdf': {
                    const doc = this.exportService.buildSectionedWordDoc(sectionedConfig);
                    const docxBlob = await Packer.toBlob(doc);
                    const pdfBlob = await this.convertDocxToPdf(docxBlob);
                    const pdfUrl = URL.createObjectURL(pdfBlob);
                    window.open(pdfUrl, '_blank');
                    break;
                }
            }
        } catch (err) {
            console.error(`${type} export failed`, err);
        } finally {
            this.exporting = false;
        }
    }

    private async convertDocxToPdf(docxBlob: Blob): Promise<Blob> {
        const form = new FormData();
        form.append('file', docxBlob, 'document.docx');
        return await firstValueFrom(
            this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
        );
    }

    // ── Computed labels ──────────────────────────────────────────────────

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'REGIMENT & EQUIVALENT NAME WISE MANPOWER STATE'
            : 'রেজিমেন্ট ও সমতুল্য নাম ভিত্তিক জনবলের সারাংশ';
    }

    get dateLine(): string {
        const now = new Date();
        const day = now.getDate(), mon = now.getMonth(), year = now.getFullYear();
        if (this.lang === 'en') return `${day} ${CorpsWiseEquivalentManpowerComponent.EN_MONTHS[mon]} ${year}`;
        return `${BanglaNumerals.toBangla(String(day))} ${CorpsWiseEquivalentManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get serLabel(): string { return this.lang === 'en' ? 'Ser' : 'ক্রমিক'; }
    get corpsColLabel(): string { return this.lang === 'en' ? 'Regiment / Corps' : 'রেজিমেন্ট / কোর'; }
    get totalLabel(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }
    get grandTotalLabel(): string { return this.lang === 'en' ? 'GRAND TOTAL' : 'সর্ব মোট'; }

    rankLabel(rank: MotherUnitRankColumn): string {
        return this.lang === 'en' ? rank.rankName : (rank.rankNameBN || rank.rankName);
    }

    corpsNameLabel(c: CorpsRow): string {
        return this.lang === 'en' ? c.corpsName : (c.corpsNameBN || c.corpsName);
    }

    orgLabel(org: CorpsOrgBlock): string {
        return this.lang === 'en'
            ? org.orgName.toUpperCase()
            : (org.orgNameBN || org.orgName);
    }

    cellValue(c: CorpsRow, rankId: number): number { return c.rankCounts?.[rankId] ?? 0; }
    columnTotal(org: CorpsOrgBlock, rankId: number): number { return org.totals?.[rankId] ?? 0; }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }
}
