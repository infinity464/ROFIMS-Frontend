import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExportService } from '@/services/export.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
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
    lang: Lang = 'en';
    loading = false;
    exportDropdownOpen = false;

    rows: ManpowerSummaryRow[] = [];
    totals: ManpowerSummaryTotals = { auth: 0, held: 0, def: 0, sur: 0, postingIn: 0, postingOut: 0 };

    readonly columns = COLUMNS;

    constructor(
        private statisticsService: StatisticsService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getManpowerSummary().subscribe({
            next: (res: ManpowerSummaryResponse) => {
                this.rows   = res.rows ?? [];
                this.totals = res.totals ?? { auth: 0, held: 0, def: 0, sur: 0, postingIn: 0, postingOut: 0 };
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'word' | 'excel'): Promise<void> {
        const { columns, rows } = this.getExportData();
        const config = {
            title: this.titleLabel,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true
        };
        if (type === 'pdf') {
            this.exportService.exportPDF(config);
        } else if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
        this.exportDropdownOpen = false;
    }

    getExportData(): { columns: string[]; rows: string[][] } {
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
        // Totals row
        const totalLabel = this.lang === 'en' ? 'Total' : 'মোট';
        dataRows.push([
            '',
            totalLabel,
            this.fmt(this.totals.auth),
            this.fmt(this.totals.held),
            this.fmt(this.totals.def),
            this.fmt(this.totals.sur),
            this.fmt(this.totals.postingIn),
            this.fmt(this.totals.postingOut),
            ''
        ]);
        return { columns, rows: dataRows };
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
