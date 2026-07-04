import { Component, HostListener, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Packer } from 'docx';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { environment } from '@/Core/Environments/environment';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import {
    StatisticsService,
    type UnitTradeColumn,
    type UnitTradeRow,
    type UnitTradeWiseManpowerResponse
} from '@/services/statistics.service';
import { RabReportPrintService } from '../shared/rab-report-print.service';

/** One block: wings of a selected RAB Unit, or top-level units when nothing is selected. */
interface UnitTradeSection {
    titleEN: string;
    titleBN: string;
    units: UnitTradeRow[];
    columnTotals: Record<number, number>;
    grandTotal: number;
}

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-unit-trade-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule],
    templateUrl: './unit-trade-wise-manpower.html',
    styleUrl: '../unit-rank-wise-manpower/unit-rank-wise-manpower.scss'
})
export class UnitTradeWiseManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    /** Trade columns (merged by name) — shared across sections; taken from the first response. */
    trades: UnitTradeColumn[] = [];

    /** One block per drill-down target (or a single anonymous block for top-level units). */
    sections: UnitTradeSection[] = [];

    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    /** Multi-select drill-down. Empty = show top-level RAB Units in one section. */
    selectedRabUnitIds: number[] = [];
    rabUnitOptions: { label: string; value: number }[] = [];
    private rabUnits: CommonCode[] = [];

    /** Checked trade column ids (columns shown). Rebuilt when data changes. */
    selectedTradeColIds: number[] = [];

    /** Trade columns as check options — label is language-aware (Bangla shows the
     *  merged comma-separated names, e.g. "কুক(মেস), কুক(ইউনিট)"). */
    get tradeVisOptions(): { label: string; value: number }[] {
        return this.trades.map(t => ({ label: this.tradeLabel(t), value: t.tradeColId }));
    }

    private resetTradeVisibility(): void {
        this.selectedTradeColIds = this.trades.map(t => t.tradeColId);
    }

    /** Trade columns after applying the checkbox filter. */
    visibleTradeCols(): UnitTradeColumn[] {
        return this.trades.filter(t => this.selectedTradeColIds.includes(t.tradeColId));
    }

    /** Row total over the CHECKED trade columns only. */
    rowTotalVisible(row: UnitTradeRow): number {
        return this.visibleTradeCols().reduce((s, c) => s + this.cell(row, c.tradeColId), 0);
    }
    /** Section grand total over the CHECKED trade columns only. */
    sectionGrandTotalVisible(section: UnitTradeSection): number {
        return this.visibleTradeCols().reduce((s, c) => s + this.colTotal(section, c.tradeColId), 0);
    }

    private http = inject(HttpClient);

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService,
        private masterBasicSetup: MasterBasicSetupService,
        private rabPrint: RabReportPrintService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadRabUnitOptions();
        this.loadData();
    }

    private loadRabUnitOptions(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (res) => {
                this.rabUnits = (Array.isArray(res) ? res : [])
                    .filter(u => u.status !== false && u.parentCodeId == null);
                this.rabUnits.sort((a, b) =>
                    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
                );
                this.rebuildRabUnitOptions();
            },
            error: () => { this.rabUnits = []; this.rebuildRabUnitOptions(); }
        });
    }

    private rebuildRabUnitOptions(): void {
        this.rabUnitOptions = this.rabUnits.map(u => ({
            label: this.lang === 'en' ? (u.codeValueEN ?? '') : (u.codeValueBN || u.codeValueEN || ''),
            value: u.codeId
        }));
    }

    onRabUnitChange(): void {
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        const ids = this.selectedRabUnitIds ?? [];

        if (ids.length === 0) {
            this.statisticsService.getUnitTradeWiseManpower(null).subscribe({
                next: (res: UnitTradeWiseManpowerResponse) => {
                    this.trades = res.trades ?? [];
                    this.sections = [{
                        titleEN: '',
                        titleBN: '',
                        units: res.units ?? [],
                        columnTotals: res.columnTotals ?? {},
                        grandTotal: res.grandTotal ?? 0
                    }];
                    this.accessibleRabUnitNames   = res.accessibleRabUnitNames ?? null;
                    this.accessibleRabUnitNamesBN = res.accessibleRabUnitNamesBN ?? null;
                    this.resetTradeVisibility();
                    this.loading = false;
                },
                error: () => { this.loading = false; }
            });
            return;
        }

        forkJoin(
            ids.map(id =>
                this.statisticsService.getUnitTradeWiseManpower(id)
                    .pipe(catchError(() => of(null as UnitTradeWiseManpowerResponse | null)))
            )
        ).subscribe({
            next: (results) => {
                const built: UnitTradeSection[] = [];
                let firstTrades: UnitTradeColumn[] = [];
                let scopeEN: string[] | null = null;
                let scopeBN: string[] | null = null;
                results.forEach((res, i) => {
                    if (!res) return;
                    if (firstTrades.length === 0) firstTrades = res.trades ?? [];
                    if (scopeEN == null) scopeEN = res.accessibleRabUnitNames   ?? null;
                    if (scopeBN == null) scopeBN = res.accessibleRabUnitNamesBN ?? null;
                    const unit = this.rabUnits.find(u => u.codeId === ids[i]);
                    built.push({
                        titleEN: unit?.codeValueEN ?? `Unit ${ids[i]}`,
                        titleBN: unit?.codeValueBN || unit?.codeValueEN || `Unit ${ids[i]}`,
                        units: res.units ?? [],
                        columnTotals: res.columnTotals ?? {},
                        grandTotal: res.grandTotal ?? 0
                    });
                });
                this.trades = firstTrades;
                this.sections = built;
                this.accessibleRabUnitNames   = scopeEN;
                this.accessibleRabUnitNamesBN = scopeBN;
                this.resetTradeVisibility();
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    get scopeLine(): string | null {
        const names = this.lang === 'bn'
            ? (this.accessibleRabUnitNamesBN ?? this.accessibleRabUnitNames)
            : this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.rebuildRabUnitOptions();
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    cell(row: UnitTradeRow, colId: number): number {
        return row.cells?.[colId] ?? 0;
    }

    colTotal(section: UnitTradeSection, colId: number): number {
        return section.columnTotals?.[colId] ?? 0;
    }

    sectionTitle(section: UnitTradeSection): string {
        return this.lang === 'en' ? section.titleEN : (section.titleBN || section.titleEN);
    }

    get hasAnyData(): boolean {
        return this.sections.some(s => s.units.length > 0);
    }

    unitLabel(row: UnitTradeRow): string {
        return this.lang === 'en' ? row.unitNameEN : (row.unitNameBN || row.unitNameEN);
    }

    tradeLabel(col: UnitTradeColumn): string {
        return this.lang === 'en' ? col.tradeNameEN : (col.tradeNameBN || col.tradeNameEN);
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
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
        const isWingMode = this.selectedRabUnitIds.length > 0;
        const rowEN = isWingMode ? 'WING' : 'UNIT';
        const rowBN = isWingMode ? 'উইং'   : 'ইউনিট';
        return this.lang === 'en'
            ? `${rowEN}-WISE MANPOWER STATE BY TRADE`
            : `${rowBN} অনুযায়ী ট্রেড ভিত্তিক জনবলের পরিসংখ্যান`;
    }

    get unitHeader(): string {
        if (this.selectedRabUnitIds.length > 0) return this.lang === 'en' ? 'Wing' : 'উইং';
        return this.lang === 'en' ? 'Unit' : 'ইউনিট';
    }

    get totalHeader(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${UnitTradeWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        const dayBN  = BanglaNumerals.toBangla(String(day));
        const yearBN = BanglaNumerals.toBangla(String(year));
        return `${dayBN} ${UnitTradeWiseManpowerComponent.BN_MONTHS[mon]} ${yearBN}`;
    }

    private buildCriteriaItems(): { label: string; value: string }[] {
        const bn = this.lang === 'bn';
        const items: { label: string; value: string }[] = [];
        if (this.selectedRabUnitIds.length > 0) {
            const names = this.rabUnitOptions.filter(o => this.selectedRabUnitIds.includes(o.value)).map(o => o.label);
            if (names.length) items.push({ label: bn ? 'ইউনিট' : 'UNIT', value: names.join(', ') });
        }
        const accessNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames) ?? this.accessibleRabUnitNames;
        if (accessNames && accessNames.length > 0) items.push({ label: bn ? 'এক্সেস ইউনিট' : 'ACCESS UNITS', value: accessNames.join(', ') });
        if (items.length === 0) items.push({ label: bn ? 'পরিসর' : 'SCOPE', value: bn ? 'সকল ইউনিট' : 'All Unit' });
        return items;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        const scope = this.scopeLine;
        const visibleCols = this.visibleTradeCols();
        const columns = [this.unitHeader, ...visibleCols.map(t => this.tradeLabel(t)), this.totalHeader];
        const sectionedConfig = {
            title: this.titleLabel,
            lang: this.lang,
            columns: [],
            sections: this.sections.map(sec => ({
                title: this.sectionTitle(sec),
                columns,
                rows: sec.units.map(u => [
                    this.unitLabel(u),
                    ...visibleCols.map(t => this.fmt(this.cell(u, t.tradeColId))),
                    this.fmt(this.rowTotalVisible(u))
                ]),
                subtotalRow: [
                    this.totalHeader,
                    ...visibleCols.map(t => this.fmt(this.colTotal(sec, t.tradeColId))),
                    this.fmt(this.sectionGrandTotalVisible(sec))
                ]
            })),
            showPageNumbers: true,
            filename: 'unit-trade-wise-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true,
            rabLetterhead: true,
            criteriaItems: this.buildCriteriaItems()
        };

        if (type === 'print') {
            this.rabPrint.print({
                lang: this.lang,
                reportTitle: this.titleLabel,
                landscape: true,
                criteriaItems: this.buildCriteriaItems(),
                columns: [],
                sections: this.sections.map(sec => ({
                    title: this.sectionTitle(sec),
                    columns: [
                        { label: this.unitHeader, align: 'left' as const },
                        ...visibleCols.map(t => ({ label: this.tradeLabel(t), align: 'center' as const, mono: true })),
                        { label: this.totalHeader, align: 'center' as const, mono: true }
                    ],
                    rows: sec.units.map(u => [
                        this.unitLabel(u),
                        ...visibleCols.map(t => this.fmt(this.cell(u, t.tradeColId))),
                        this.fmt(this.rowTotalVisible(u))
                    ]),
                    totalRow: [
                        this.totalHeader,
                        ...visibleCols.map(t => this.fmt(this.colTotal(sec, t.tradeColId))),
                        this.fmt(this.sectionGrandTotalVisible(sec))
                    ]
                }))
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
}
