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
    titleEN: string;
    titleBN: string;
    units: UnitRankRow[];
    columnTotals: Record<number, UnitRankCell>;
    grandTotal: UnitRankCell;
}

type Lang = 'en' | 'bn';

const EMPTY_CELL: UnitRankCell = { auth: 0, held: 0 };

/**
 * Equivalent-name variant of the unit-rank-wise manpower report. Identical to
 * UnitRankWiseManpowerComponent except Auth is sourced from the equivalent-name
 * man-power setup. Reuses the original template/styles via relative paths.
 */
@Component({
    selector: 'app-unit-rank-wise-equivalent-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule],
    templateUrl: '../unit-rank-wise-manpower/unit-rank-wise-manpower.html',
    styleUrl: '../unit-rank-wise-manpower/unit-rank-wise-manpower.scss'
})
export class UnitRankWiseEquivalentManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    /** Rank columns — shared across every section. Picked from the first response. */
    ranks: UnitRankColumn[] = [];

    sections: UnitRankSection[] = [];

    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    /** Comma-separated EquivalentName.codeValueEN list to drop from the columns. */
    private readonly excludeRanks = 'Officer,DAD';

    /** Multi-select drill-down. Empty array = show top-level RAB Units in a single section. */
    selectedRabUnitIds: number[] = [];
    rabUnitOptions: { label: string; value: number }[] = [];
    private rabUnits: CommonCode[] = [];

    /** Member-type CodeIds the user picked to MERGE. */
    selectedMergeMemberTypeIds: number[] = [];
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

    private buildCriteriaItems(): { label: string; value: string }[] {
        const bn = this.lang === 'bn';
        const items: { label: string; value: string }[] = [];
        if (this.selectedRabUnitIds.length > 0) {
            const names = this.rabUnitOptions.filter(o => this.selectedRabUnitIds.includes(o.value)).map(o => o.label);
            if (names.length) items.push({ label: bn ? 'ইউনিট' : 'UNIT', value: names.join(', ') });
        }
        const accessNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames) ?? this.accessibleRabUnitNames;
        if (accessNames && accessNames.length > 0) items.push({ label: bn ? 'এক্সেস ইউনিট' : 'ACCESS UNITS', value: accessNames.join(', ') });
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
            this.statisticsService
                .getUnitRankWiseManpowerByEquivalentName(this.excludeRanks, null, this.selectedMergeMemberTypeIds)
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

        forkJoin(
            ids.map(id =>
                this.statisticsService
                    .getUnitRankWiseManpowerByEquivalentName(this.excludeRanks, id, this.selectedMergeMemberTypeIds)
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

    get hasSectionBanners(): boolean {
        return this.sections.some(s => !!s.titleEN);
    }

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
        const isWingMode = this.selectedRabUnitIds.length > 0;
        const rowEN = isWingMode ? 'WING' : 'UNIT';
        const rowBN = isWingMode ? 'উইং'   : 'ইউনিট';
        return this.lang === 'en'
            ? `${rowEN}-WISE MANPOWER STATE BY RAB RANK (EQUIVALENT NAME)`
            : `${rowBN} অনুযায়ী র‍্যাব পদবী ভিত্তিক জনবলের পরিসংখ্যান (সমতুল্য নাম)`;
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
            return `${day} ${UnitRankWiseEquivalentManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        const dayBN  = BanglaNumerals.toBangla(String(day));
        const yearBN = BanglaNumerals.toBangla(String(year));
        return `${dayBN} ${UnitRankWiseEquivalentManpowerComponent.BN_MONTHS[mon]} ${yearBN}`;
    }

    get authHeader(): string { return this.lang === 'en' ? 'Auth' : 'প্রাধিকার'; }
    get heldHeader(): string { return this.lang === 'en' ? 'Held' : 'বিদ্যমান'; }
    get totalHeader(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        const scope = this.scopeLine;
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
            rows: matrixSections.length === 1 ? matrixSections[0].rows : [],
            sections: matrixSections.length > 1 ? matrixSections : undefined,
            filename: 'unit-rank-wise-equivalent-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true,
            showPageNumbers: true
        };

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

    private async convertDocxToPdf(docxBlob: Blob): Promise<Blob> {
        const form = new FormData();
        form.append('file', docxBlob, 'document.docx');
        return await firstValueFrom(
            this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
        );
    }

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
