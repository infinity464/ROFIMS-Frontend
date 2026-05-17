import { Component, HostListener, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Packer } from 'docx';
import { saveAs } from 'file-saver';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { environment } from '@/Core/Environments/environment';
import {
    StatisticsService,
    type ManpowerSummaryRow,
    type ManpowerSummaryTotals,
    type ManpowerSummaryResponse
} from '@/services/statistics.service';

type Lang = 'en' | 'bn';

interface ColDef {
    field: keyof ManpowerSummaryRow | 'ser';
    labelEn: string;
    labelBn: string;
}

const COLUMNS: ColDef[] = [
    { field: 'ser',        labelEn: 'Ser',          labelBn: 'ক্রমিক' },
    { field: 'orgName',    labelEn: 'Organization',  labelBn: 'বাহিনী' },
    { field: 'auth',       labelEn: 'Auth',          labelBn: 'প্রাধিকার' },
    { field: 'held',       labelEn: 'Held',          labelBn: 'বিদ্যমান' },
    { field: 'def',        labelEn: 'Def',           labelBn: 'ঘাটতি' },
    { field: 'sur',        labelEn: 'Sur',           labelBn: 'অতিরিক্ত' },
    { field: 'postingIn',  labelEn: 'Posting In',    labelBn: 'বদলী আদেশ প্রাপ্ত' },
    { field: 'postingOut', labelEn: 'Posting Out',   labelBn: 'প্রেষণাদেশ বাতিল' },
    { field: 'remark',     labelEn: 'Remark',        labelBn: 'মন্তব্য' }
];

@Component({
    selector: 'app-manpower-summary',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './manpower-summary.html',
    styleUrl: './manpower-summary.scss'
})
export class ManpowerSummaryComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    rows: ManpowerSummaryRow[] = [];
    totals: ManpowerSummaryTotals = { auth: 0, held: 0, def: 0, sur: 0, postingIn: 0, postingOut: 0 };

    /** Names of the RAB Units the user is restricted to. null/empty = full access (no scope line shown). */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    readonly columns = COLUMNS;

    private http = inject(HttpClient);

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getManpowerSummary().subscribe({
            next: (res: ManpowerSummaryResponse) => {
                this.rows   = res.rows ?? [];
                this.totals = res.totals ?? { auth: 0, held: 0, def: 0, sur: 0, postingIn: 0, postingOut: 0 };
                this.accessibleRabUnitNames   = res.accessibleRabUnitNames ?? null;
                this.accessibleRabUnitNamesBN = res.accessibleRabUnitNamesBN ?? null;
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    /** Returns the comma-separated unit-scope line shown under the report title, or null when unrestricted. */
    get scopeLine(): string | null {
        const names = this.lang === 'bn'
            ? (this.accessibleRabUnitNamesBN ?? this.accessibleRabUnitNames)
            : this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        // All four formats share one source-of-truth: the same Word config.
        // PDF + Print build the docx and convert server-side via /Document/ConvertToPdf.
        const { columns, rows, subtotalRow } = this.getExportData();
        const scope = this.scopeLine;
        const config = {
            title: this.titleLabel,
            lang: this.lang,
            columns,
            rows,
            subtotalRow,
            showPageNumbers: true,
            filename: 'manpower-summary',
            filterLines: scope ? [scope] : undefined
        };

        try {
            this.exporting = true;
            switch (type) {
                case 'word':
                    await this.exportService.exportWord(config);
                    break;
                case 'excel':
                    this.exportService.exportExcel(config);
                    break;
                case 'pdf':
                case 'print': {
                    const doc = this.exportService.buildWordDoc(config);
                    const docxBlob = await Packer.toBlob(doc);
                    const pdfBlob = await this.convertDocxToPdf(docxBlob);
                    const filename = `${config.filename}_${this.lang}.pdf`;
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

    getExportData(): { columns: string[]; rows: string[][]; subtotalRow: string[] } {
        const columns = COLUMNS.map(c => this.lang === 'en' ? c.labelEn : c.labelBn);
        const dataRows = this.rows.map((row, i) => [
            this.fmt(i + 1),
            this.orgLabel(row),
            this.fmt(row.auth),
            this.fmt(row.held),
            this.fmt(row.def),
            this.fmt(row.sur),
            this.fmt(row.postingIn),
            this.fmt(row.postingOut),
            row.remark ?? ''
        ]);
        const totalLabel = this.lang === 'en' ? 'Total' : 'মোট';
        const subtotalRow = [
            '',
            totalLabel,
            this.fmt(this.totals.auth),
            this.fmt(this.totals.held),
            this.fmt(this.totals.def),
            this.fmt(this.totals.sur),
            this.fmt(this.totals.postingIn),
            this.fmt(this.totals.postingOut),
            ''
        ];
        return { columns, rows: dataRows, subtotalRow };
    }

    private static readonly EN_MONTHS = [
        'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
        'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
    ];
    private static readonly BN_MONTHS = [
        'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
        'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'
    ];

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'OVERALL MANPOWER SUMMARY'
            : 'জনবলের পরিসংখ্যান-র‌্যাব ফোর্সেস';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${ManpowerSummaryComponent.EN_MONTHS[mon]} ${year}`;
        }
        const dayBN  = BanglaNumerals.toBangla(String(day));
        const yearBN = BanglaNumerals.toBangla(String(year));
        return `${dayBN} ${ManpowerSummaryComponent.BN_MONTHS[mon]} ${yearBN}`;
    }

    get totalLabel(): string {
        return this.lang === 'en' ? 'Total' : 'মোট';
    }

    colLabel(col: ColDef): string {
        return this.lang === 'en' ? col.labelEn : col.labelBn;
    }

    orgLabel(row: ManpowerSummaryRow): string {
        return this.lang === 'en' ? row.orgName : (row.orgNameBN || row.orgName);
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

}
