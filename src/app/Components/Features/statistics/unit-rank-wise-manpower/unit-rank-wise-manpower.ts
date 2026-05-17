import { Component, HostListener, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { firstValueFrom } from 'rxjs';
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

type Lang = 'en' | 'bn';

const EMPTY_CELL: UnitRankCell = { auth: 0, held: 0 };

@Component({
    selector: 'app-unit-rank-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule, MultiSelectModule],
    templateUrl: './unit-rank-wise-manpower.html',
    styleUrl: './unit-rank-wise-manpower.scss'
})
export class UnitRankWiseManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    ranks: UnitRankColumn[] = [];
    units: UnitRankRow[] = [];
    columnTotals: Record<number, UnitRankCell> = {};
    grandTotal: UnitRankCell = { auth: 0, held: 0 };

    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    /** Comma-separated EquivalentName.codeValueEN list to drop from the columns. */
    private readonly excludeRanks = 'Officer,DAD';

    /** RAB Unit drill-down: null = top-level RAB Units; a CodeId = wings under that unit. */
    selectedRabUnitId: number | null = null;
    rabUnitOptions: { label: string; value: number | null }[] = [];
    private rabUnits: CommonCode[] = [];

    /** Member-type CodeIds the user picked to MERGE. Default = empty = every rank shown as its
     *  own column; selecting a member type collapses every rank under it into one column. */
    selectedMergeMemberTypeIds: number[] = [];
    memberTypeOptions: { label: string; value: number }[] = [];
    private memberTypes: CommonCode[] = [];

    private http = inject(HttpClient);

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService,
        private masterBasicSetup: MasterBasicSetupService
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
        const allLabel = this.lang === 'en' ? 'All RAB Units' : 'সকল র‍্যাব ইউনিট';
        this.rabUnitOptions = [
            { label: allLabel, value: null },
            ...this.rabUnits.map(u => ({
                label: this.lang === 'en' ? (u.codeValueEN ?? '') : (u.codeValueBN || u.codeValueEN || ''),
                value: u.codeId
            }))
        ];
    }

    onRabUnitChange(): void {
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService
            .getUnitRankWiseManpower(this.excludeRanks, this.selectedRabUnitId, this.selectedMergeMemberTypeIds)
            .subscribe({
            next: (res: UnitRankWiseManpowerResponse) => {
                this.ranks        = res.ranks ?? [];
                this.units        = res.units ?? [];
                this.columnTotals = res.columnTotals ?? {};
                this.grandTotal   = res.grandTotal ?? { auth: 0, held: 0 };
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
        this.rebuildRabUnitOptions();
        this.rebuildMemberTypeOptions();
    }

    private get selectedRabUnit(): CommonCode | undefined {
        return this.selectedRabUnitId == null
            ? undefined
            : this.rabUnits.find(u => u.codeId === this.selectedRabUnitId);
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    cell(row: UnitRankRow, eqId: number): UnitRankCell {
        return row.cells?.[eqId] ?? EMPTY_CELL;
    }

    colTotal(eqId: number): UnitRankCell {
        return this.columnTotals?.[eqId] ?? EMPTY_CELL;
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
        const sel = this.selectedRabUnit;
        const rowEN = sel ? 'WING' : 'UNIT';
        const rowBN = sel ? 'উইং'   : 'ইউনিট';
        const suffix = sel
            ? (this.lang === 'en'
                ? ` — ${(sel.codeValueEN ?? '').toUpperCase()}`
                : ` — ${sel.codeValueBN || sel.codeValueEN || ''}`)
            : '';
        return this.lang === 'en'
            ? `${rowEN}-WISE MANPOWER STATE BY RAB RANK${suffix}`
            : `${rowBN} অনুযায়ী র‍্যাব পদবী ভিত্তিক জনবলের পরিসংখ্যান${suffix}`;
    }

    get unitHeader(): string {
        if (this.selectedRabUnit) return this.lang === 'en' ? 'Wing' : 'উইং';
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
        const matrixConfig = {
            title: this.titleLabel,
            lang: this.lang,
            leadingColumns: [this.unitHeader],
            groupColumns: [...this.ranks.map(c => this.rankLabel(c)), this.totalHeader],
            subHeaders: [this.authHeader, this.heldHeader],
            rows: this.getMatrixRows(),
            filename: 'unit-rank-wise-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true,
            showPageNumbers: true
        };

        try {
            this.exporting = true;
            switch (type) {
                case 'word':
                    await this.exportService.exportWordMatrix(matrixConfig);
                    break;
                case 'excel':
                    this.exportService.exportExcelMatrix(matrixConfig);
                    break;
                case 'pdf':
                case 'print': {
                    // PDF opens as a preview tab; Print opens a popup with the PDF
                    // in an iframe and auto-triggers the browser's print dialog.
                    const doc = this.exportService.buildMatrixWordDoc(matrixConfig);
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

    /** Matrix-shaped rows used by the Excel exporter — one row per unit + a totals row. */
    private getMatrixRows(): string[][] {
        const dataRows: string[][] = this.units.map(row => {
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
            const t = this.colTotal(col.equivalentNameId);
            totalRow.push(this.fmt(t.auth));
            totalRow.push(this.fmt(t.held));
        }
        totalRow.push(this.fmt(this.grandTotal.auth));
        totalRow.push(this.fmt(this.grandTotal.held));
        dataRows.push(totalRow);

        return dataRows;
    }
}
