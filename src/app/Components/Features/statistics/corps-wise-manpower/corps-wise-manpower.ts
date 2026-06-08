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

/** One mother org's data block; alias of the per-org backend response for clarity. */
type CorpsOrgBlock = CorpsWiseManpowerResponse;

@Component({
    selector: 'app-corps-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule, OrgTreeFilterComponent],
    templateUrl: './corps-wise-manpower.html',
    styleUrl: './corps-wise-manpower.scss'
})
export class CorpsWiseManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    loadingOrgs = false;
    exporting = false;
    exportDropdownOpen = false;

    /** All mother orgs available to the user (raw dropdown options). */
    orgOptions: MotherUnitOrgOption[] = [];
    /** Multi-select binding: empty array = nothing loaded yet (shows empty state). */
    selectedOrgIds: number[] = [];

    /** Currently displayed blocks — only orgs the user explicitly selected. */
    filteredOrgs: CorpsOrgBlock[] = [];

    /** Sum of every filtered org's grandTotal — single number because rank columns vary per org. */
    grandTotal = 0;

    /** Org-tree node filter (Unit/Wing/Branch/…) — scopes Held server-side. */
    filterRabCodeId: number | null = null;
    filterLabel: string | null = null;

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;
    /** Names of the Member Types the user is restricted to. null/empty = full access on this axis. */
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
        if (this.filterLabel) items.push({ label: bn ? 'অফিস' : 'OFFICE', value: this.filterLabel });
        const unitNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames) ?? this.accessibleRabUnitNames;
        if (unitNames && unitNames.length > 0) items.push({ label: bn ? 'ইউনিট' : 'UNITS', value: unitNames.join(', ') });
        const mtNames = (bn ? this.accessibleMemberTypeNamesBN : this.accessibleMemberTypeNames) ?? this.accessibleMemberTypeNames;
        if (mtNames && mtNames.length > 0) items.push({ label: bn ? 'সদস্য ধরণ' : 'MEMBER TYPES', value: mtNames.join(', ') });
        const orgNames = this.filteredOrgs.map(o => this.orgLabel(o));
        if (orgNames.length) items.push({ label: bn ? 'বাহিনী' : 'ORGANIZATIONS', value: orgNames.join(', ') });
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

    /** Loads the dropdown options only — data is fetched on-demand when the user selects orgs. */
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

    /**
     * Multi-select changed: fetch data only for the currently selected orgs.
     * Empty selection clears the report (no auto-load-all).
     */
    onOrgFilterChange(): void {
        const ids = this.selectedOrgIds ?? [];
        if (ids.length === 0) {
            this.filteredOrgs = [];
            this.grandTotal = 0;
            this.accessibleRabUnitNames = null;
            this.accessibleRabUnitNamesBN = null;
            this.accessibleMemberTypeNames = null;
            this.accessibleMemberTypeNamesBN = null;
            return;
        }
        this.loading = true;
        forkJoin(
            ids.map(id =>
                this.statisticsService.getCorpsWiseManpower(id, this.filterRabCodeId).pipe(
                    catchError(() => of(null as CorpsWiseManpowerResponse | null))
                )
            )
        ).subscribe({
            next: (results) => {
                this.filteredOrgs = (results ?? [])
                    .filter((r): r is CorpsWiseManpowerResponse => r != null);
                // RAB-unit scope is the same across calls — take it from the first non-null response.
                const first = this.filteredOrgs[0];
                this.accessibleRabUnitNames      = first?.accessibleRabUnitNames      ?? null;
                this.accessibleRabUnitNamesBN    = first?.accessibleRabUnitNamesBN    ?? null;
                this.accessibleMemberTypeNames   = first?.accessibleMemberTypeNames   ?? null;
                this.accessibleMemberTypeNamesBN = first?.accessibleMemberTypeNamesBN ?? null;
                this.grandTotal = this.filteredOrgs.reduce((sum, o) => sum + (o.grandTotal ?? 0), 0);
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    /**
     * Combined scope line shown under the report title when EITHER axis is
     * restricted. Either side is omitted when that axis is unrestricted.
     * Returns null when the caller has no restrictions at all.
     */
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

        // All four formats share one source-of-truth: the same sectioned-Word config.
        // PDF + Print follow movement-preview/mo's pattern — build the docx, send
        // it to /Document/ConvertToPdf, then save (PDF) or open in a new tab (Print).
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
                    ...org.ranks.map(r => this.rankLabel(r)),
                    this.totalLabel
                ],
                rows: org.corps.map((c, i) => [
                    this.fmt(i + 1),
                    this.corpsNameLabel(c),
                    ...org.ranks.map(r => this.fmt(this.cellValue(c, r.rankId))),
                    this.fmt(c.total)
                ]),
                subtotalRow: [
                    '',
                    this.totalLabel,
                    ...org.ranks.map(r => this.fmt(this.columnTotal(org, r.rankId))),
                    this.fmt(org.grandTotal)
                ]
            })),
            grandTotalRow: ['', this.grandTotalLabel, this.fmt(this.grandTotal)],
            showPageNumbers: true,
            filename: 'corps-wise-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true
        };

        // Print uses the shared RAB letterhead (frontend only). Matrix mode: each
        // org renders its own table (its rank columns differ).
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
                        ...org.ranks.map(r => ({ label: this.rankLabel(r), align: 'center' as const, mono: true })),
                        { label: this.totalLabel, align: 'center' as const, mono: true }
                    ];
                    return {
                        title: this.orgLabel(org),
                        columns: cols,
                        rows: org.corps.map((c, i) => [
                            this.fmt(i + 1),
                            this.corpsNameLabel(c),
                            ...org.ranks.map(r => this.fmt(this.cellValue(c, r.rankId))),
                            this.fmt(c.total)
                        ]),
                        totalRow: [
                            '',
                            this.totalLabel,
                            ...org.ranks.map(r => this.fmt(this.columnTotal(org, r.rankId))),
                            this.fmt(org.grandTotal)
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

    /** POST the in-memory docx to the backend's LibreOffice-based conversion endpoint. */
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
            ? 'REGIMENT & RANK WISE MANPOWER STATE'
            : 'রেজিমেন্ট ভিত্তিক জনবলের সারাংশ';
    }

    get dateLine(): string {
        const now = new Date();
        const day = now.getDate(), mon = now.getMonth(), year = now.getFullYear();
        if (this.lang === 'en') return `${day} ${CorpsWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        return `${BanglaNumerals.toBangla(String(day))} ${CorpsWiseManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
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
