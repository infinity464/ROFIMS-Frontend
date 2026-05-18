import { Component, HostListener, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { forkJoin, firstValueFrom } from 'rxjs';
import { Packer } from 'docx';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { environment } from '@/Core/Environments/environment';
import {
    StatisticsService,
    type RankWiseOrgBlock,
    type RankWiseRankRow,
    type RankWiseManpowerResponse
} from '@/services/statistics.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-rank-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule, CheckboxModule],
    templateUrl: './rank-wise-manpower.html',
    styleUrl: './rank-wise-manpower.scss'
})
export class RankWiseManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exportDropdownOpen = false;
    exporting = false;

    allOrgs: RankWiseOrgBlock[] = [];
    filteredOrgs: RankWiseOrgBlock[] = [];
    grandTotal: RankWiseRankRow = this.emptyRow();

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    /** Options for p-multiselect */
    orgOptions: { label: string; value: number }[] = [];
    /** Currently selected org IDs (empty = show all) */
    selectedOrgIds: number[] = [];

    /** When true, the equivalent-name (basic-setup/rank-equivalent) is appended in parens after each rank name. */
    showEquivalentRanks = false;

    /** When true, an extra "Posting Out" column (in-flight PermanentPostingMORecord count) is rendered. */
    showPostingOut = false;

    /** rankId -> equivalent-name label(s) it maps to (EN + BN). */
    private equivalentNamesByRankId: Map<number, { en: string; bn: string }[]> = new Map();

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
        private masterBasicSetup: MasterBasicSetupService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadData();
        this.loadEquivalentRanks();
    }

    /**
     * Builds rankId -> equivalent-name label(s) by joining the rank-equivalent table with the
     * `EquivalentName` CommonCode set. E.g. rank "Lt Col" (Army) maps to equivalent-name
     * "Director/CO", so the report can render "Lt Col (Director/CO)".
     */
    private loadEquivalentRanks(): void {
        forkJoin({
            equivalents: this.masterBasicSetup.getAllRankEquivalents(),
            equivalentNames: this.masterBasicSetup.getAllByType('EquivalentName')
        }).subscribe({
            next: ({ equivalents, equivalentNames }) => {
                const nameById = new Map<number, { en: string; bn: string }>();
                (equivalentNames ?? []).forEach(c => {
                    nameById.set(c.codeId, {
                        en: c.codeValueEN ?? '',
                        bn: c.codeValueBN ?? ''
                    });
                });

                const map = new Map<number, { en: string; bn: string }[]>();
                (equivalents ?? []).forEach(eq => {
                    const label = nameById.get(eq.equivalentNameID);
                    if (!label) return;
                    const existing = map.get(eq.motherOrgRankId) ?? [];
                    if (!existing.some(p => p.en === label.en)) existing.push(label);
                    map.set(eq.motherOrgRankId, existing);
                });

                this.equivalentNamesByRankId = map;
            },
            error: () => { /* silent — checkbox just won't append anything */ }
        });
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getRankWiseManpower().subscribe({
            next: (res: RankWiseManpowerResponse) => {
                this.allOrgs = res.orgs ?? [];
                this.filteredOrgs = [...this.allOrgs];
                this.grandTotal = res.grandTotal ?? this.emptyRow();
                this.orgOptions = this.allOrgs.map(o => ({
                    label: o.orgName,
                    value: o.orgId
                }));
                this.accessibleRabUnitNames   = res.accessibleRabUnitNames ?? null;
                this.accessibleRabUnitNamesBN = res.accessibleRabUnitNamesBN ?? null;
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    /** Comma-separated unit-scope line shown under the report title; null when unrestricted. */
    get scopeLine(): string | null {
        const names = this.lang === 'bn'
            ? (this.accessibleRabUnitNamesBN ?? this.accessibleRabUnitNames)
            : this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
    }

    onOrgFilterChange(): void {
        if (!this.selectedOrgIds || this.selectedOrgIds.length === 0) {
            this.filteredOrgs = [...this.allOrgs];
        } else {
            this.filteredOrgs = this.allOrgs.filter(o => this.selectedOrgIds.includes(o.orgId));
        }
        this.grandTotal = this.computeGrandTotal(this.filteredOrgs);
    }

    toggleLang(): void { this.lang = this.lang === 'en' ? 'bn' : 'en'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        const scope = this.scopeLine;
        const includePO = this.showPostingOut;
        const sectionedConfig = {
            title: this.titleLabel,
            lang: this.lang,
            columns: this.colHeaders,
            sections: this.filteredOrgs.map(org => ({
                title: this.orgLabel(org),
                rows: org.rows.map((row, i) => {
                    const cells = [
                        this.fmt(i + 1),
                        this.rankLabel(row),
                        this.fmt(row.auth),
                        this.fmt(row.held),
                        this.fmt(row.def),
                        this.fmt(row.sur),
                        this.fmtPct(row.defPct)
                    ];
                    if (includePO) cells.push(this.fmt(row.postedOut));
                    return cells;
                }),
                subtotalRow: (() => {
                    const cells = [
                        '',
                        this.subtotalLabel,
                        this.fmt(org.subtotal.auth),
                        this.fmt(org.subtotal.held),
                        this.fmt(org.subtotal.def),
                        this.fmt(org.subtotal.sur),
                        this.fmtPct(org.subtotal.defPct)
                    ];
                    if (includePO) cells.push(this.fmt(org.subtotal.postedOut));
                    return cells;
                })()
            })),
            grandTotalRow: (() => {
                const cells = [
                    '',
                    this.grandTotalLabel,
                    this.fmt(this.grandTotal.auth),
                    this.fmt(this.grandTotal.held),
                    this.fmt(this.grandTotal.def),
                    this.fmt(this.grandTotal.sur),
                    this.fmtPct(this.grandTotal.defPct)
                ];
                if (includePO) cells.push(this.fmt(this.grandTotal.postedOut));
                return cells;
            })(),
            showPageNumbers: true,
            filename: 'rank-wise-manpower',
            filterLines: scope ? [scope] : undefined
        };

        try {
            this.exporting = true;
            switch (type) {
                case 'word':
                    await this.exportService.exportWordSectioned(sectionedConfig);
                    break;
                case 'excel':
                    this.exportService.exportExcelSectioned(sectionedConfig);
                    break;
                case 'pdf':
                case 'print': {
                    // PDF opens as a preview tab; Print opens a popup with the PDF
                    // in an iframe and auto-triggers the browser's print dialog.
                    const doc = this.exportService.buildSectionedWordDoc(sectionedConfig);
                    const docxBlob = await Packer.toBlob(doc);
                    const pdfBlob = await this.convertDocxToPdf(docxBlob);
                    const pdfUrl = URL.createObjectURL(pdfBlob);
                    if (type === 'pdf') {
                        window.open(pdfUrl, '_blank');
                    } else {
                        this.exportService.openPdfPrintPopup(pdfUrl);
                    }
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

    // ── Computed labels ───────────────────────────────────────────────────────

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'ORGANIZATION & RANK WISE MANPOWER STATE'
            : 'বাহিনী এবং পদবী অনুযায়ী জনবলের সারাংশ';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${RankWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `${BanglaNumerals.toBangla(String(day))} ${RankWiseManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get colHeaders(): string[] {
        const base = this.lang === 'en'
            ? ['Ser', 'Rank', 'Auth', 'Held', 'Def', 'Sur', 'Def %']
            : ['ক্রমিক', 'পদবী', 'প্রাধিকার', 'বিদ্যমান', 'ঘাটতি', 'অতিরিক্ত', 'ঘাটতি %'];
        if (!this.showPostingOut) return base;
        return [...base, this.lang === 'en' ? 'Posted Out' : 'প্রেষণাদেশ বাতিল'];
    }

    get subtotalLabel(): string { return this.lang === 'en' ? 'Subtotal' : 'উপ-মোট'; }
    get grandTotalLabel(): string { return this.lang === 'en' ? 'Grand Total' : 'সর্ব মোট'; }

    orgLabel(org: RankWiseOrgBlock): string {
        return this.lang === 'en' ? org.orgName : (org.orgNameBN || org.orgName);
    }

    rankLabel(row: RankWiseRankRow): string {
        const base = this.lang === 'en' ? row.rankName : (row.rankNameBN || row.rankName);
        if (!this.showEquivalentRanks) return base;
        const equivNames = this.equivalentNamesByRankId.get(row.rankId);
        if (!equivNames || equivNames.length === 0) return base;
        const names = equivNames.map(p => this.lang === 'en' ? p.en : (p.bn || p.en)).filter(n => !!n);
        if (names.length === 0) return base;
        return `${base} (${names.join(', ')})`;
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    fmtPct(n: number | undefined | null): string {
        const val = n ?? 0;
        const s = val === 0 ? '0' : val.toFixed(1);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) + '%' : s + '%';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private emptyRow(): RankWiseRankRow {
        return { rankId: 0, rankName: '', rankNameBN: '', auth: 0, held: 0, def: 0, sur: 0, defPct: 0, postedOut: 0 };
    }

    private computeGrandTotal(orgs: RankWiseOrgBlock[]): RankWiseRankRow {
        const auth      = orgs.reduce((s, o) => s + o.subtotal.auth, 0);
        const held      = orgs.reduce((s, o) => s + o.subtotal.held, 0);
        const def       = orgs.reduce((s, o) => s + o.subtotal.def,  0);
        const sur       = orgs.reduce((s, o) => s + o.subtotal.sur,  0);
        const postedOut = orgs.reduce((s, o) => s + (o.subtotal.postedOut ?? 0), 0);
        return {
            rankId: 0, rankName: '', rankNameBN: '',
            auth, held, def, sur,
            defPct: auth > 0 ? Math.round(def / auth * 1000) / 10 : 0,
            postedOut
        };
    }

}
