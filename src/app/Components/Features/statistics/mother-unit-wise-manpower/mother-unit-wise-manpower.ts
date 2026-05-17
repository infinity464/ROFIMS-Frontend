import { Component, HostListener, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { forkJoin, of, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Packer } from 'docx';
import { saveAs } from 'file-saver';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { environment } from '@/Core/Environments/environment';
import {
    StatisticsService,
    type MotherUnitOrgOption,
    type MotherUnitRankColumn,
    type MotherUnitRow,
    type MotherUnitWiseManpowerResponse
} from '@/services/statistics.service';

type Lang = 'en' | 'bn';

/** One mother org's data block; alias of the per-org backend response for clarity. */
type MotherUnitOrgBlock = MotherUnitWiseManpowerResponse;

@Component({
    selector: 'app-mother-unit-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule],
    templateUrl: './mother-unit-wise-manpower.html',
    styleUrl: './mother-unit-wise-manpower.scss'
})
export class MotherUnitWiseManpowerComponent implements OnInit {
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
    filteredOrgs: MotherUnitOrgBlock[] = [];

    /** Sum of every filtered org's grandTotal — single number because rank columns vary per org. */
    grandTotal = 0;

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

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
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

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
            return;
        }
        this.loading = true;
        forkJoin(
            ids.map(id =>
                this.statisticsService.getMotherUnitWiseManpower(id).pipe(
                    catchError(() => of(null as MotherUnitWiseManpowerResponse | null))
                )
            )
        ).subscribe({
            next: (results) => {
                this.filteredOrgs = (results ?? [])
                    .filter((r): r is MotherUnitWiseManpowerResponse => r != null);
                // RAB-unit scope is the same across calls — take it from the first non-null response.
                const first = this.filteredOrgs[0];
                this.accessibleRabUnitNames   = first?.accessibleRabUnitNames   ?? null;
                this.accessibleRabUnitNamesBN = first?.accessibleRabUnitNamesBN ?? null;
                this.grandTotal = this.filteredOrgs.reduce((sum, o) => sum + (o.grandTotal ?? 0), 0);
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

    toggleLang(): void { this.lang = this.lang === 'en' ? 'bn' : 'en'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        // All four formats share one source-of-truth: the same sectioned-Word config.
        // PDF + Print follow movement-preview/mo's pattern — generate the docx, send
        // it to /Document/ConvertToPdf, then save (PDF) or open in a new tab (Print).
        const scope = this.scopeLine;
        const sectionedConfig = {
            title: this.titleLabel,
            lang: this.lang,
            // Top-level columns are unused — per-section column headers below override them.
            columns: [],
            sections: this.filteredOrgs.map(org => ({
                title: this.orgLabel(org),
                columns: [
                    this.serLabel,
                    this.unitLabel,
                    ...org.ranks.map(r => this.rankLabel(r)),
                    this.totalLabel
                ],
                rows: org.units.map((unit, i) => [
                    this.fmt(i + 1),
                    this.unitNameLabel(unit),
                    ...org.ranks.map(r => this.fmt(this.cellValue(unit, r.rankId))),
                    this.fmt(unit.total)
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
            filename: 'mother-unit-wise-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true
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
                    // Build the docx once, convert server-side, then either save or open.
                    const doc = this.exportService.buildSectionedWordDoc(sectionedConfig);
                    const docxBlob = await Packer.toBlob(doc);
                    const pdfBlob = await this.convertDocxToPdf(docxBlob);
                    const filename = `${sectionedConfig.filename}_${this.lang}.pdf`;
                    if (type === 'pdf') {
                        saveAs(pdfBlob, filename);
                    } else {
                        window.open(URL.createObjectURL(pdfBlob), '_blank');
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

    // ── Computed labels ──────────────────────────────────────────────────

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'MOTHER UNIT WISE MANPOWER STATE'
            : 'মাতৃ ইউনিট ভিত্তিক জনবলের সারাংশ';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${MotherUnitWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `${BanglaNumerals.toBangla(String(day))} ${MotherUnitWiseManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get serLabel(): string { return this.lang === 'en' ? 'Ser' : 'ক্রমিক'; }
    get unitLabel(): string { return this.lang === 'en' ? 'Mother Unit Name' : 'মাতৃ ইউনিটের নাম'; }
    get totalLabel(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }
    get grandTotalLabel(): string { return this.lang === 'en' ? 'GRAND TOTAL' : 'সর্ব মোট'; }

    rankLabel(rank: MotherUnitRankColumn): string {
        return this.lang === 'en' ? rank.rankName : (rank.rankNameBN || rank.rankName);
    }

    unitNameLabel(unit: MotherUnitRow): string {
        return this.lang === 'en' ? unit.unitName : (unit.unitNameBN || unit.unitName);
    }

    orgLabel(org: MotherUnitOrgBlock): string {
        return this.lang === 'en'
            ? org.orgName.toUpperCase()
            : (org.orgNameBN || org.orgName);
    }

    cellValue(unit: MotherUnitRow, rankId: number): number {
        return unit.rankCounts?.[rankId] ?? 0;
    }

    columnTotal(org: MotherUnitOrgBlock, rankId: number): number {
        return org.totals?.[rankId] ?? 0;
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

}
