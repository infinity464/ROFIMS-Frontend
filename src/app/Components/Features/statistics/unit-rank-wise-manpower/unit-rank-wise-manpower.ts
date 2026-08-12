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
    type UnitRankColumn,
    type UnitRankRow,
    type UnitRankCell,
    type UnitRankWiseManpowerResponse
} from '@/services/statistics.service';
import { RabReportPrintService } from '../shared/rab-report-print.service';

/** One block in the report — wings of a selected RAB Unit, or top-level units
 *  when nothing is selected. The banner is rendered only when titleEN is non-empty. */
interface UnitRankSection {
    /** Banner text shown above the table; empty for the "no-selection / top-level" block. */
    titleEN: string;
    titleBN: string;
    units: UnitRankRow[];
    columnTotals: Record<number, UnitRankCell>;
    grandTotal: UnitRankCell;
}

type Lang = 'en' | 'bn';

const EMPTY_CELL: UnitRankCell = { auth: 0, held: 0 };

@Component({
    selector: 'app-unit-rank-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule],
    templateUrl: './unit-rank-wise-manpower.html',
    styleUrl: './unit-rank-wise-manpower.scss'
})
export class UnitRankWiseManpowerComponent implements OnInit {
    /** The equivalent-name variant enables the pinned Unit column. */
    readonly stickyUnitColumn = false;
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    /** Rank columns — shared across every section. Picked from the first response. */
    ranks: UnitRankColumn[] = [];

    /**
     * One block per drill-down target. Empty selection → one section (top-level RAB Units, no banner).
     * Selected N units → N sections, each banner = unit name, table = that unit's wings.
     */
    sections: UnitRankSection[] = [];

    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    /** Comma-separated EquivalentName.codeValueEN list to drop from the columns. */
    private readonly excludeRanks = 'Officer,DAD';

    /** Multi-select drill-down. Empty array = show top-level RAB Units in a single section. */
    selectedRabUnitIds: number[] = [];
    rabUnitOptions: { label: string; value: number }[] = [];
    private rabUnits: CommonCode[] = [];

    /** Member-type CodeIds the user picked to MERGE. Default = empty = every rank shown as its
     *  own column; selecting a member type collapses every rank under it into one column. */
    selectedMergeMemberTypeIds: number[] = [];

    /** Member-type CodeIds the user picked to FILTER BY. Default = empty = every rank column is
     *  shown; selecting member types narrows the columns to the ranks under them. */
    selectedFilterMemberTypeIds: number[] = [];

    memberTypeOptions: { label: string; value: number }[] = [];
    private memberTypes: CommonCode[] = [];

    private http = inject(HttpClient);

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService,
        private masterBasicSetup: MasterBasicSetupService,
        private rabPrint: RabReportPrintService
    ) {}

    /** Label/value pairs for the print letterhead's SELECTION CRITERIA grid. */
    private buildCriteriaItems(): { label: string; value: string }[] {
        const bn = this.lang === 'bn';
        const items: { label: string; value: string }[] = [];
        if (this.selectedRabUnitIds.length > 0) {
            const names = this.rabUnitOptions.filter(o => this.selectedRabUnitIds.includes(o.value)).map(o => o.label);
            if (names.length) items.push({ label: bn ? 'ইউনিট' : 'UNIT', value: names.join(', ') });
        }
        const accessNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames) ?? this.accessibleRabUnitNames;
        if (accessNames && accessNames.length > 0) items.push({ label: bn ? 'এক্সেস ইউনিট' : 'ACCESS UNITS', value: accessNames.join(', ') });
        if (this.selectedFilterMemberTypeIds.length > 0) {
            const names = this.memberTypeOptions.filter(o => this.selectedFilterMemberTypeIds.includes(o.value)).map(o => o.label);
            if (names.length) items.push({ label: bn ? 'সদস্য ধরণ' : 'MEMBER TYPE', value: names.join(', ') });
        }
        if (this.selectedMergeMemberTypeIds.length > 0) {
            const names = this.memberTypeOptions.filter(o => this.selectedMergeMemberTypeIds.includes(o.value)).map(o => o.label);
            if (names.length) items.push({ label: bn ? 'একীভূত সদস্য ধরণ' : 'MERGED MEMBER TYPES', value: names.join(', ') });
        }
        if (items.length === 0) items.push({ label: bn ? 'পরিসর' : 'SCOPE', value: bn ? 'সকল ইউনিট' : 'All Unit' });
        return items;
    }

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadRabUnitOptions();
        this.loadMemberTypeOptions();
        this.loadData();
    }

    private loadMemberTypeOptions(): void {
        this.masterBasicSetup.getAllByType('EmployeeType').subscribe({
            next: (res) => {
                this.memberTypes = (Array.isArray(res) ? res : []).filter(m => m.status !== false);
                this.memberTypes.sort((a, b) =>
                    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
                );
                this.rebuildMemberTypeOptions();
            },
            error: () => { this.memberTypes = []; this.rebuildMemberTypeOptions(); }
        });
    }

    private rebuildMemberTypeOptions(): void {
        this.memberTypeOptions = this.memberTypes.map(m => ({
            label: this.lang === 'en' ? (m.codeValueEN ?? '') : (m.codeValueBN || m.codeValueEN || ''),
            value: m.codeId
        }));
    }

    onMergeMemberTypesChange(): void {
        this.loadData();
    }

    onFilterMemberTypesChange(): void {
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
            // No selection → single anonymous section (top-level RAB Units).
            this.statisticsService
                .getUnitRankWiseManpower(this.excludeRanks, null, this.selectedMergeMemberTypeIds, this.selectedFilterMemberTypeIds)
                .subscribe({
                    next: (res: UnitRankWiseManpowerResponse) => {
                        this.ranks = res.ranks ?? [];
                        this.sections = [{
                            titleEN: '',
                            titleBN: '',
                            units: res.units ?? [],
                            columnTotals: res.columnTotals ?? {},
                            grandTotal: res.grandTotal ?? { auth: 0, held: 0 }
                        }];
                        this.accessibleRabUnitNames   = res.accessibleRabUnitNames ?? null;
                        this.accessibleRabUnitNamesBN = res.accessibleRabUnitNamesBN ?? null;
                        this.loading = false;
                    },
                    error: () => { this.loading = false; }
                });
            return;
        }

        // 1+ units selected → one section per unit (wings of that unit, with banner).
        forkJoin(
            ids.map(id =>
                this.statisticsService
                    .getUnitRankWiseManpower(this.excludeRanks, id, this.selectedMergeMemberTypeIds, this.selectedFilterMemberTypeIds)
                    .pipe(catchError(() => of(null as UnitRankWiseManpowerResponse | null)))
            )
        ).subscribe({
            next: (results) => {
                const built: UnitRankSection[] = [];
                let firstRanks: UnitRankColumn[] = [];
                let scopeEN: string[] | null = null;
                let scopeBN: string[] | null = null;
                results.forEach((res, i) => {
                    if (!res) return;
                    if (firstRanks.length === 0) firstRanks = res.ranks ?? [];
                    if (scopeEN == null) scopeEN = res.accessibleRabUnitNames   ?? null;
                    if (scopeBN == null) scopeBN = res.accessibleRabUnitNamesBN ?? null;
                    const unit = this.rabUnits.find(u => u.codeId === ids[i]);
                    built.push({
                        titleEN: unit?.codeValueEN ?? `Unit ${ids[i]}`,
                        titleBN: unit?.codeValueBN || unit?.codeValueEN || `Unit ${ids[i]}`,
                        units: res.units ?? [],
                        columnTotals: res.columnTotals ?? {},
                        grandTotal: res.grandTotal ?? { auth: 0, held: 0 }
                    });
                });
                this.ranks = firstRanks;
                this.sections = built;
                this.accessibleRabUnitNames   = scopeEN;
                this.accessibleRabUnitNamesBN = scopeBN;
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
        this.rebuildRabUnitOptions();
        this.rebuildMemberTypeOptions();
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    cell(row: UnitRankRow, eqId: number): UnitRankCell {
        return row.cells?.[eqId] ?? EMPTY_CELL;
    }

    colTotal(section: UnitRankSection, eqId: number): UnitRankCell {
        return section.columnTotals?.[eqId] ?? EMPTY_CELL;
    }

    sectionTitle(section: UnitRankSection): string {
        return this.lang === 'en' ? section.titleEN : (section.titleBN || section.titleEN);
    }

    /** True when at least one section has a banner (i.e. at least one drill-down was selected). */
    get hasSectionBanners(): boolean {
        return this.sections.some(s => !!s.titleEN);
    }

    /** True iff any section has at least one row — gates the Export button. */
    get hasAnyData(): boolean {
        return this.sections.some(s => s.units.length > 0);
    }

    unitLabel(row: UnitRankRow): string {
        return this.lang === 'en' ? row.unitNameEN : (row.unitNameBN || row.unitNameEN);
    }

    rankLabel(col: UnitRankColumn): string {
        return this.lang === 'en' ? col.equivalentNameEN : (col.equivalentNameBN || col.equivalentNameEN);
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
        // 0 selected = listing top-level units; 1+ selected = listing wings (per unit).
        const isWingMode = this.selectedRabUnitIds.length > 0;
        const rowEN = isWingMode ? 'WING' : 'UNIT';
        const rowBN = isWingMode ? 'উইং'   : 'ইউনিট';
        return this.lang === 'en'
            ? `${rowEN}-WISE MANPOWER STATE BY RAB RANK`
            : `${rowBN} অনুযায়ী র‍্যাব পদবী ভিত্তিক জনবলের পরিসংখ্যান`;
    }

    get unitHeader(): string {
        if (this.selectedRabUnitIds.length > 0) return this.lang === 'en' ? 'Wing' : 'উইং';
        return this.lang === 'en' ? 'Unit' : 'ইউনিট';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${UnitRankWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        const dayBN  = BanglaNumerals.toBangla(String(day));
        const yearBN = BanglaNumerals.toBangla(String(year));
        return `${dayBN} ${UnitRankWiseManpowerComponent.BN_MONTHS[mon]} ${yearBN}`;
    }

    get authHeader(): string { return this.lang === 'en' ? 'Auth' : 'প্রাধিকার'; }
    get heldHeader(): string { return this.lang === 'en' ? 'Held' : 'বিদ্যমান'; }
    get totalHeader(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        // All four formats share one source-of-truth: the same matrix-Word config.
        // PDF + Print build the docx and convert server-side via /Document/ConvertToPdf.
        const scope = this.scopeLine;
        // Build one matrix section per drill-down block. The 0-selection case
        // produces a single section with no banner; 1+ selections produce N sections
        // each with a banner = unit name (matches the on-screen layout).
        const matrixSections = this.sections.map(sec => ({
            title: this.sectionTitle(sec),
            rows: this.getMatrixRowsForSection(sec)
        }));
        const matrixConfig = {
            title: this.titleLabel,
            lang: this.lang,
            leadingColumns: [this.unitHeader],
            groupColumns: [...this.ranks.map(c => this.rankLabel(c)), this.totalHeader],
            subHeaders: [this.authHeader, this.heldHeader],
            // Top-level rows is the fallback path; the exporter prefers `sections` when set.
            rows: matrixSections.length === 1 ? matrixSections[0].rows : [],
            sections: matrixSections.length > 1 ? matrixSections : undefined,
            filename: 'unit-rank-wise-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true,
            showPageNumbers: true
        };

        // Print uses the shared RAB letterhead (frontend only), landscape, with the
        // two-row grouped header (each rank → Auth/Held).
        if (type === 'print') {
            this.rabPrint.print({
                lang: this.lang,
                reportTitle: this.titleLabel,
                landscape: true,
                criteriaItems: this.buildCriteriaItems(),
                columns: [],
                groupedHeader: {
                    leading: [{ label: this.unitHeader, align: 'left' }],
                    groups: [...this.ranks.map(c => this.rankLabel(c)), this.totalHeader],
                    subHeaders: [this.authHeader, this.heldHeader]
                },
                sections: matrixSections
            });
            return;
        }

        try {
            this.exporting = true;
            switch (type) {
                case 'word':
                    await this.exportService.exportWordMatrix(matrixConfig);
                    break;
                case 'excel':
                    this.exportService.exportExcelMatrix(matrixConfig);
                    break;
                case 'pdf': {
                    const doc = this.exportService.buildMatrixWordDoc(matrixConfig);
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

    /** Matrix-shaped rows for one section: one row per unit/wing + a trailing totals row. */
    private getMatrixRowsForSection(section: UnitRankSection): string[][] {
        const dataRows: string[][] = section.units.map(row => {
            const cells: string[] = [this.unitLabel(row)];
            for (const col of this.ranks) {
                const c = this.cell(row, col.equivalentNameId);
                cells.push(this.fmt(c.auth));
                cells.push(this.fmt(c.held));
            }
            cells.push(this.fmt(row.total.auth));
            cells.push(this.fmt(row.total.held));
            return cells;
        });

        const totalRow: string[] = [this.totalHeader];
        for (const col of this.ranks) {
            const t = this.colTotal(section, col.equivalentNameId);
            totalRow.push(this.fmt(t.auth));
            totalRow.push(this.fmt(t.held));
        }
        totalRow.push(this.fmt(section.grandTotal.auth));
        totalRow.push(this.fmt(section.grandTotal.held));
        dataRows.push(totalRow);

        return dataRows;
    }
}
