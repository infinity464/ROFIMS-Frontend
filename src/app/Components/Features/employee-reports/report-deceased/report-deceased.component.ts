import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule } from 'primeng/paginator';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    DeceasedReportRow,
    DynamicReportCriterion,
    DynamicReportRow,
} from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Packer,
    PageNumber,
    PageOrientation,
    Paragraph,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

type Lang = 'en' | 'bn';

/**
 * Deceased Report — RAB-formal layout, dynamic column picker, drag-to-
 * reorder, Print/Word/Excel exports. Filters: Date of Death range, Mother
 * Org → Rank cascade. Pulls from the existing /GetDeceasedReport endpoint
 * (no access control on this list — deceased rosters are typically
 * org-wide visible).
 */
@Component({
    selector: 'app-report-deceased',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        DatePickerModule,
        SelectModule,
        MultiSelectModule,
        PaginatorModule,
        Toast,
    ],
    providers: [MessageService],
    templateUrl: './report-deceased.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-deceased.component.scss'],
})
export class ReportDeceasedComponent implements OnInit {
    lang: Lang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    list: DeceasedReportRow[] = [];
    loading = false;
    searched = false;

    fromDate: Date | null = null;
    toDate: Date | null = null;

    orgOptions: { label: string; labelBn: string; value: number }[] = [];
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedOrgId: number | null = null;
    selectedRankId: number | null = null;

    first = 0;
    rows = 20;
    rowsPerPageOptions = [20, 50, 100];
    totalRecords = 0;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    filterOpen = true;

    /**
     * Column catalog. The default set mirrors the legacy Death Member report;
     * the opt-in extras below are pulled from the dynamic backend's
     * DeceasedReportFieldRegistry so the user can add ANY employee/service/
     * personal field — same field-picker UX as report-address-location.
     *
     * Default-column keys are the legacy names (`rank`, `name`, …) the render
     * + export code already understands; `colKeyToBackend` maps them to the
     * registry FieldKey when building the request. Opt-in extras use the
     * registry FieldKey directly and resolve through `extraCellValue`.
     */
    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: 'Serial' | 'Personnel' | 'Date' | 'Plain' | 'Remarks'; defaultVisible: boolean }[] = [
        { key: 'ser',            labelEN: 'Ser',                  labelBN: 'ক্রঃ',                   hint: 'Serial',     defaultVisible: true  },
        { key: 'serviceId',      labelEN: 'Service ID',           labelBN: 'সার্ভিস আইডি',           hint: 'Plain',      defaultVisible: true  },
        { key: 'rank',           labelEN: 'Rank',                 labelBN: 'পদবী',                   hint: 'Plain',      defaultVisible: true  },
        { key: 'corps',          labelEN: 'Corps',                labelBN: 'কোর',                    hint: 'Plain',      defaultVisible: true  },
        { key: 'trade',          labelEN: 'Trade',                labelBN: 'ট্রেড',                  hint: 'Plain',      defaultVisible: true  },
        { key: 'name',           labelEN: 'Name',                 labelBN: 'নাম',                    hint: 'Personnel',  defaultVisible: true  },
        { key: 'joiningInRab',   labelEN: 'RAB Joining Date',     labelBN: 'র‍্যাবে যোগদানের তারিখ',  hint: 'Date',       defaultVisible: true  },
        { key: 'lastUnit',       labelEN: 'Last Bn/Wg',           labelBN: 'সর্বশেষ ইউনিট',          hint: 'Plain',      defaultVisible: true  },
        { key: 'dateOfDeath',    labelEN: 'Date of Death',        labelBN: 'মৃত্যুবরণের তারিখ',       hint: 'Date',       defaultVisible: true  },
        { key: 'deceasedReason', labelEN: 'Death Reason',         labelBN: 'মৃত্যুর কারণ',           hint: 'Plain',      defaultVisible: true  },
        { key: 'rmks',           labelEN: 'Remarks',              labelBN: 'মন্তব্য',                hint: 'Remarks',    defaultVisible: true  },
        // ── Opt-in extras (registry FieldKeys) — hidden by default ────────
        { key: 'rabId',          labelEN: 'RAB ID',               labelBN: 'র‍্যাব আইডি',            hint: 'Plain',      defaultVisible: false },
        { key: 'nameBangla',     labelEN: 'Name (Bangla)',        labelBN: 'নাম (বাংলা)',            hint: 'Plain',      defaultVisible: false },
        { key: 'nid',            labelEN: 'NID',                  labelBN: 'এনআইডি',                hint: 'Plain',      defaultVisible: false },
        { key: 'prefix',         labelEN: 'Prefix',               labelBN: 'প্রিফিক্স',              hint: 'Plain',      defaultVisible: false },
        { key: 'appointment',    labelEN: 'Appointment',          labelBN: 'নিয়োগ',                 hint: 'Plain',      defaultVisible: false },
        { key: 'memberType',     labelEN: 'Member Type',          labelBN: 'সদস্য ধরন',              hint: 'Plain',      defaultVisible: false },
        { key: 'motherOrganization', labelEN: 'Mother Org',       labelBN: 'মাতৃ সংস্থা',            hint: 'Plain',      defaultVisible: false },
        { key: 'gender',         labelEN: 'Gender',               labelBN: 'লিঙ্গ',                  hint: 'Plain',      defaultVisible: false },
        { key: 'motherUnit',     labelEN: 'Mother Unit',          labelBN: 'মাতৃ ইউনিট',             hint: 'Plain',      defaultVisible: false },
        { key: 'rabUnit',        labelEN: 'RAB Unit',             labelBN: 'র‍্যাব ইউনিট',           hint: 'Plain',      defaultVisible: false },
        { key: 'dateOfCommission', labelEN: 'Commission Date',    labelBN: 'কমিশন তারিখ',            hint: 'Date',       defaultVisible: false },
        { key: 'rabServiceFrom', labelEN: 'RAB Service From',     labelBN: 'র‍্যাব স্থিতিকাল হইতে',   hint: 'Date',       defaultVisible: false },
        { key: 'rabServiceTo',   labelEN: 'RAB Service To',       labelBN: 'র‍্যাব স্থিতিকাল পর্যন্ত', hint: 'Date',      defaultVisible: false },
        { key: 'postingStatus',  labelEN: 'Posting Status',       labelBN: 'নিয়োগ অবস্থা',          hint: 'Plain',      defaultVisible: false },
        { key: 'officerType',    labelEN: 'Officer Type',         labelBN: 'অফিসার ধরণ',             hint: 'Plain',      defaultVisible: false },
        { key: 'dob',            labelEN: 'Date of Birth',        labelBN: 'জন্ম তারিখ',             hint: 'Date',       defaultVisible: false },
        { key: 'religion',       labelEN: 'Religion',             labelBN: 'ধর্ম',                   hint: 'Plain',      defaultVisible: false },
        { key: 'bloodGroup',     labelEN: 'Blood Group',          labelBN: 'রক্তের গ্রুপ',            hint: 'Plain',      defaultVisible: false },
        { key: 'maritalStatus',  labelEN: 'Marital Status',       labelBN: 'বৈবাহিক অবস্থা',          hint: 'Plain',      defaultVisible: false },
        { key: 'mobileNo',       labelEN: 'Mobile',               labelBN: 'মোবাইল',                 hint: 'Plain',      defaultVisible: false },
        { key: 'email',          labelEN: 'Email',                labelBN: 'ইমেইল',                  hint: 'Plain',      defaultVisible: false },
    ];

    /**
     * Maps a legacy default-column key to its DeceasedReportFieldRegistry
     * FieldKey for the request `columns` list. Opt-in extras already use the
     * registry key, so they map to themselves (identity via the fallback).
     */
    private static readonly colKeyToBackend: Record<string, string> = {
        ser: 'ser',
        name: 'personnel',
        rank: 'armyRank',
        serviceId: 'serviceId',
        corps: 'corps',
        trade: 'trade',
        joiningInRab: 'joiningInRab',
        lastUnit: 'lastUnit',
        dateOfDeath: 'dateOfDeath',
        deceasedReason: 'deceasedReason',
        rmks: 'rmks',
    };

    /** Extra (registry-keyed) columns that should render as formatted dates. */
    private static readonly extraDateKeys = new Set([
        'dateOfCommission', 'rabServiceFrom', 'rabServiceTo', 'dob',
    ]);
    /** Extra columns that are plain identifiers/text (no BN mirror). */
    private static readonly extraPlainKeys = new Set([
        'rabId', 'nameBangla', 'nid', 'bloodGroup', 'mobileNo', 'email', 'postingStatus',
    ]);

    selectedColumnKeys: string[] = this.columnCatalog.filter(c => c.defaultVisible).map(c => c.key);

    get columnPickerOptions(): { label: string; value: string }[] {
        return this.columnCatalog.map(c => ({ label: this.lang === 'bn' ? c.labelBN : c.labelEN, value: c.key }));
    }

    get visibleColumns(): typeof this.columnCatalog {
        const map = new Map(this.columnCatalog.map(c => [c.key, c]));
        return this.selectedColumnKeys
            .map(k => map.get(k))
            .filter((c): c is typeof this.columnCatalog[number] => c != null);
    }

    draggingColumnKey: string | null = null;

    onColumnDragStart(key: string, event: DragEvent): void {
        this.draggingColumnKey = key;
        event.dataTransfer?.setData('text/plain', key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }
    onColumnDragOver(event: DragEvent): void {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }
    onColumnDrop(targetKey: string, event: DragEvent): void {
        event.preventDefault();
        const sourceKey = this.draggingColumnKey;
        this.draggingColumnKey = null;
        if (!sourceKey || sourceKey === targetKey) return;
        const arr = [...this.selectedColumnKeys];
        const fromIdx = arr.indexOf(sourceKey);
        const toIdx   = arr.indexOf(targetKey);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        this.selectedColumnKeys = arr;
    }
    onColumnDragEnd(): void { this.draggingColumnKey = null; }
    removeColumn(key: string): void { this.selectedColumnKeys = this.selectedColumnKeys.filter(k => k !== key); }

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
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

        this.loadMotherOrgs();
        // Auto-run with no filters so the user lands on a populated list.
        this.search();
    }

    private loadMotherOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs: MotherOrganizationModel[]) => {
                this.orgOptions = (orgs || []).map((o) => ({
                    label: o.orgNameEN || String(o.orgId),
                    labelBn: o.orgNameBN || o.orgNameEN || String(o.orgId),
                    value: o.orgId,
                }));
            },
            error: () => (this.orgOptions = []),
        });
    }

    onOrgChange(): void {
        this.selectedRankId = null;
        this.rankOptions = [];
        if (this.selectedOrgId == null) return;
        this.commonCodeService
            .getAllActiveCommonCodesByOrgIdAndType(this.selectedOrgId, 'MotherOrgRank')
            .subscribe({
                next: (codes: CommonCodeModel[]) => {
                    this.rankOptions = (codes || []).map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                        value: c.codeId,
                    }));
                },
                error: () => (this.rankOptions = []),
            });
    }

    onFilterChange(): void {}

    get reportTitle(): string {
        return this.lang === 'en'
            ? 'List of Death Members Serving in RAB'
            : 'র‍্যাবে কর্মরত মৃত সদস্যদের তালিকা';
    }

    get dateLine(): string {
        const now = new Date();
        return this.lang === 'en'
            ? now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
            : now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    private fmtDate(d: Date | null | undefined): string | null {
        if (!d) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    private buildFilterLines(): string[] {
        return this.criteriaItems.map(it => `${it.label}: ${it.value}`);
    }

    get criteriaItems(): { label: string; value: string }[] {
        const items: { label: string; value: string }[] = [];
        if (this.fromDate) {
            const lbl = this.lang === 'en' ? 'Date of Death From' : 'মৃত্যু তারিখ হইতে';
            items.push({ label: lbl, value: this.formatDateLabel(this.fmtDate(this.fromDate)!) });
        }
        if (this.toDate) {
            const lbl = this.lang === 'en' ? 'Date of Death To' : 'মৃত্যু তারিখ পর্যন্ত';
            items.push({ label: lbl, value: this.formatDateLabel(this.fmtDate(this.toDate)!) });
        }
        if (this.selectedOrgId != null) {
            const opt = this.orgOptions.find(o => o.value === this.selectedOrgId);
            const lbl = this.lang === 'en' ? 'Mother Org' : 'মাতৃ সংস্থা';
            if (opt) items.push({ label: lbl, value: this.lang === 'bn' ? opt.labelBn : opt.label });
        }
        if (this.selectedRankId != null) {
            const opt = this.rankOptions.find(o => o.value === this.selectedRankId);
            const lbl = this.lang === 'en' ? 'Rank' : 'পদবী';
            if (opt) items.push({ label: lbl, value: this.lang === 'bn' ? opt.labelBn : opt.label });
        }
        return items;
    }

    get activeFilterCount(): number {
        let c = 0;
        if (this.fromDate) c++;
        if (this.toDate) c++;
        if (this.selectedOrgId != null) c++;
        if (this.selectedRankId != null) c++;
        return c;
    }

    toggleFilter(): void { this.filterOpen = !this.filterOpen; }

    filterSubtitle(): string {
        if (this.activeFilterCount === 0) {
            return this.lang === 'en' ? 'Select fields to search on' : 'খোঁজার জন্য ক্ষেত্র নির্বাচন করুন';
        }
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return this.lang === 'en' ? `${n} filters applied` : `${n} ফিল্টার প্রয়োগকৃত`;
    }

    clearFilters(): void {
        this.fromDate = null;
        this.toDate = null;
        this.selectedOrgId = null;
        this.selectedRankId = null;
        this.rankOptions = [];
        this.first = 0;
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    search(): void {
        this.first = 0;
        this.searched = true;
        this.appliedFilterLines = this.buildFilterLines();
        this.loadPage();
    }

    onPage(event: { first?: number; rows?: number }): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.loadPage();
    }

    private loadPage(): void {
        this.loading = true;
        const pageNo = Math.floor(this.first / this.rows) + 1;

        // ── Map UI filters → dynamic-backend criteria (registry FieldKeys) ──
        const criteria: DynamicReportCriterion[] = [];
        const dateFrom = this.fmtDate(this.fromDate);
        const dateTo = this.fmtDate(this.toDate);
        if (dateFrom || dateTo) {
            criteria.push({ fieldKey: 'dateOfDeath', dateFrom: dateFrom, dateTo: dateTo });
        }
        if (this.selectedOrgId != null && this.selectedOrgId > 0)
            criteria.push({ fieldKey: 'motherOrganization', idValue: this.selectedOrgId });
        if (this.selectedRankId != null && this.selectedRankId > 0)
            criteria.push({ fieldKey: 'armyRank', idValue: this.selectedRankId });

        // Translate selected column keys to registry FieldKeys. The backend
        // ignores unknown keys (e.g. the synthetic `ser`) and auto-expands the
        // `personnel` composite's underlying atoms, so the projection covers
        // every curated cell regardless of which atoms the user also picked.
        const columns = this.selectedColumnKeys.map(
            k => ReportDeceasedComponent.colKeyToBackend[k] ?? k,
        );

        this.reportService.runDynamicDeceasedReport({
            columns,
            criteria,
            pagination: { page_no: pageNo, row_per_page: this.rows },
        }).subscribe({
            next: (res) => {
                const startSer = (pageNo - 1) * this.rows + 1;
                this.list = (res.datalist ?? []).map((d, i) => this.adaptDynamicRow(d, startSer + i));
                this.totalRecords = res.pages?.Rows ?? res.pages?.rows ?? 0;
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load deceased members list.',
                });
                this.loading = false;
            },
        });
    }

    /**
     * Translate a dynamic-backend property bag (keyed by registry FieldKeys)
     * into the legacy DeceasedReportRow shape the renderers + exports already
     * consume. The spread keeps every raw registry key on the object too, so
     * opt-in extra columns resolve through `extraCellValue` (which reads
     * `row[key]` / `row[key]BN`).
     */
    private adaptDynamicRow(d: DynamicReportRow, ser: number): DeceasedReportRow {
        return {
            ...d,
            ser,
            serviceId:      d['serviceId']       as string,
            name:           d['nameEnglish']     as string,
            nameBN:         d['nameBangla']      as string,
            rank:           d['armyRank']        as string,
            rankBN:         d['armyRankBN']      as string,
            corps:          d['corps']           as string,
            corpsBN:        d['corpsBN']         as string,
            trade:          d['trade']           as string,
            tradeBN:        d['tradeBN']         as string,
            joiningInRab:   d['joiningInRab']    as string,
            lastUnit:       d['lastUnit']        as string,
            lastUnitBN:     d['lastUnitBN']      as string,
            dateOfDeath:    d['dateOfDeath']     as string,
            deceasedReason: d['deceasedReason']  as string,
            rmks:           null,
        } as DeceasedReportRow;
    }

    paddedSer(n: number | string | null | undefined): string {
        const s = n == null ? '' : String(n);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s.padStart(2, '0')) : s.padStart(2, '0');
    }

    /** Secondary line for the Personnel cell — "SVC · Rank". */
    personnelMetaText(row: DeceasedReportRow): string {
        const bits: string[] = [];
        if (row.serviceId) bits.push(`SVC ${this.displayNum(row.serviceId)}`);
        const rank = this.codeValue(row.rank, row.rankBN);
        if (rank && rank !== '—') bits.push(rank);
        return bits.join(' · ');
    }

    /** Resolve a row's value for a column. */
    cellValue(row: DeceasedReportRow, key: string): string {
        switch (key) {
            case 'serviceId':       return this.displayNum(row.serviceId);
            case 'rank':            return this.codeValue(row.rank, row.rankBN);
            case 'corps':           return this.codeValue(row.corps, row.corpsBN);
            case 'trade':           return this.codeValue(row.trade, row.tradeBN);
            case 'name':            return this.codeValue(row.name, row.nameBN);
            case 'joiningInRab':    return this.formatDateLabel(row.joiningInRab);
            case 'lastUnit':        return this.codeValue(row.lastUnit, row.lastUnitBN);
            case 'dateOfDeath':     return this.formatDateLabel(row.dateOfDeath);
            case 'deceasedReason':  return row.deceasedReason ?? '—';
            case 'rmks':            return row.rmks ?? '';
            default:                return this.extraCellValue(row, key);
        }
    }

    /**
     * Resolve an opt-in (registry-keyed) column. The adapted row spreads the
     * raw dynamic property bag, so a column key `k` reads `row[k]` (+ `row[kBN]`
     * for bilingual coded fields). Dates are formatted; plain identifiers pass
     * through; everything else uses the EN/BN code-value fallback.
     */
    private extraCellValue(row: DeceasedReportRow, key: string): string {
        const anyRow = row as any;
        if (ReportDeceasedComponent.extraDateKeys.has(key)) return this.formatDateLabel(anyRow[key]);
        if (ReportDeceasedComponent.extraPlainKeys.has(key)) return this.displayNum(anyRow[key]);
        return this.codeValue(anyRow[key], anyRow[key + 'BN']);
    }

    get rabOverlineText(): string {
        return this.lang === 'bn'
            ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার'
            : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH";
    }
    get rabOrgTitle(): string { return this.lang === 'bn' ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION'; }
    get rabOrgSubtitle(): string {
        return this.lang === 'bn'
            ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা'
            : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka';
    }
    get rabSectionTitle(): string { return this.reportTitle; }
    get rabCriteriaTitle(): string { return this.lang === 'bn' ? 'নির্বাচন মানদণ্ড' : 'SELECTION CRITERIA'; }
    get rabGeneratedLabel(): string { return this.lang === 'bn' ? 'উৎপন্ন' : 'GENERATED'; }
    get rabFormattedDate(): string {
        const now = new Date();
        return this.lang === 'bn'
            ? now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
            : now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    }
    get rabConfidentialLabel(): string { return this.lang === 'bn' ? 'গোপনীয়' : 'CONFIDENTIAL'; }
    get rabWarningLabel(): string { return this.lang === 'bn' ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED'; }
    get rabPageOfLabel(): string { return this.lang === 'bn' ? 'পৃষ্ঠা ১ / ১' : 'PAGE 1 OF 1'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (!this.list?.length) return;
        if (type === 'print') {
            this.openRabPrintWindow();
            return;
        }
        if (type === 'word') {
            await this.exportRabWord();
        } else {
            this.exportRabExcel();
        }
    }

    private async exportRabWord(): Promise<void> {
        const isBn = this.lang === 'bn';
        const bnFont = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const sans = isBn ? (bnFont as any) : 'Calibri';
        const serif = isBn ? (bnFont as any) : 'Cambria';
        const mono = isBn ? (bnFont as any) : 'Consolas';
        const bnRunExtras = (size: number) => isBn ? { language: bnLang, sizeComplexScript: size } : {};
        const wsafe = (s: string | null | undefined): string => s ?? '';

        const S = { overline: 15, title: 44, subtitle: 20, sectionTitle: 26, sectionSub: 20, stripLabel: 16, stripDate: 16, critLabel: 14, critValue: 20, tableHeader: 14, name: 20, meta: 14, body: 16, footer: 13 };
        const C = { black: '0B0B0B', mutedText: '555555', gray: '6B6B6B', labelGray: '8A8A8A', zebra: 'FAFAF6', border: 'BFBFBF', innerBorder: 'D9D9D9' };
        const innerCellBorder = { top: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, bottom: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, left: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, right: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder } };
        const headerCellBorder = { top: { style: BorderStyle.SINGLE, size: 8, color: C.black }, bottom: { style: BorderStyle.SINGLE, size: 8, color: C.black }, left: { style: BorderStyle.SINGLE, size: 4, color: C.border }, right: { style: BorderStyle.SINGLE, size: 4, color: C.border } };

        const headerPars: Paragraph[] = [];
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: wsafe(this.rabOverlineText), font: sans, size: S.overline, ...bnRunExtras(S.overline), color: C.mutedText, characterSpacing: isBn ? 0 : 60, allCaps: !isBn })] }));
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: wsafe(this.rabOrgTitle), font: serif, size: S.title, ...bnRunExtras(S.title), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24 })] }));
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabOrgSubtitle), font: serif, size: S.subtitle, ...bnRunExtras(S.subtitle), italics: true, color: C.mutedText })] }));
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabSectionTitle), font: serif, size: S.sectionTitle, ...bnRunExtras(S.sectionTitle), bold: true, color: C.black, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }));

        const colsPerCritRow = 4;
        const critCellPct = 100 / colsPerCritRow;
        const stripCell = (runs: TextRun[], alignment: typeof AlignmentType.LEFT | typeof AlignmentType.RIGHT) =>
            new TableCell({ columnSpan: 2, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border }, left: { style: BorderStyle.SINGLE, size: 4, color: C.border }, right: { style: BorderStyle.SINGLE, size: 4, color: C.border } }, margins: { top: 80, bottom: 80, left: 140, right: 140 }, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment, children: runs })] });
        const stripRow = new TableRow({ cantSplit: true, children: [stripCell([new TextRun({ text: wsafe(this.rabCriteriaTitle), font: sans, size: S.stripLabel, ...bnRunExtras(S.stripLabel), bold: true, color: C.black, characterSpacing: isBn ? 0 : 40, allCaps: !isBn })], AlignmentType.LEFT), stripCell([new TextRun({ text: wsafe(`${this.rabGeneratedLabel} · ${this.rabFormattedDate}`), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.mutedText, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })], AlignmentType.RIGHT)] });
        const items = this.criteriaItems;
        const critRows: TableRow[] = [stripRow];
        for (let i = 0; i < items.length; i += colsPerCritRow) {
            const cells: TableCell[] = [];
            for (let j = 0; j < colsPerCritRow; j++) {
                const it = items[i + j];
                cells.push(new TableCell({ borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: critCellPct, type: WidthType.PERCENTAGE }, children: it ? [new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: wsafe(it.label), font: sans, size: S.critLabel, ...bnRunExtras(S.critLabel), bold: true, color: C.labelGray, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }), new Paragraph({ children: [new TextRun({ text: wsafe(it.value), font: serif, size: S.critValue, ...bnRunExtras(S.critValue), bold: true, color: C.black })] })] : [new Paragraph({ children: [new TextRun({ text: ' ', font: sans, size: S.critValue, ...bnRunExtras(S.critValue) })] })] }));
            }
            critRows.push(new TableRow({ cantSplit: true, children: cells }));
        }
        const criteriaTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: critRows });

        const visibleCols = this.visibleColumns;
        const headerLabels = visibleCols.map(c => this.lang === 'bn' ? c.labelBN : c.labelEN);
        const dataColPct = visibleCols.length > 0 ? (100 / visibleCols.length) : 100;
        const headerCells: TableCell[] = headerLabels.map(label => new TableCell({ borders: headerCellBorder, margins: { top: 120, bottom: 120, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: wsafe(label), font: sans, size: S.tableHeader, ...bnRunExtras(S.tableHeader), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })] })] }));
        const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: headerCells });

        const dataRows: TableRow[] = this.list.map((row, idx) => {
            const isEven = idx % 2 === 1;
            const shading = isEven ? { type: 'clear' as const, fill: C.zebra, color: 'auto' } : undefined;
            const cellOpts = { borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, shading };
            const cells: TableCell[] = visibleCols.map(col => {
                const run = (text: string, opts: { fontKey?: any; sz?: number; bold?: boolean; color?: string; chSp?: number } = {}) => new TextRun({ text: wsafe(text), font: opts.fontKey ?? sans, size: opts.sz ?? S.body, ...bnRunExtras(opts.sz ?? S.body), bold: opts.bold ?? false, color: opts.color ?? C.black, ...(opts.chSp != null ? { characterSpacing: opts.chSp } : {}) });
                switch (col.hint) {
                    case 'Serial':
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run(this.paddedSer((row as any).ser ?? idx + 1), { fontKey: mono, sz: S.name, bold: true, color: C.gray, chSp: isBn ? 0 : 8 })] })] });
                    case 'Personnel': {
                        const meta = this.personnelMetaText(row);
                        const children: Paragraph[] = [new Paragraph({ spacing: { after: meta ? 40 : 0 }, children: [run(this.cellValue(row, 'name'), { sz: S.name, bold: true })] })];
                        if (meta) children.push(new Paragraph({ children: [new TextRun({ text: meta, font: mono, size: S.meta, ...bnRunExtras(S.meta), color: C.gray, characterSpacing: isBn ? 0 : 16, allCaps: !isBn })] }));
                        return new TableCell({ ...cellOpts, children });
                    }
                    case 'Date':
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(this.cellValue(row, col.key), { fontKey: mono, chSp: isBn ? 0 : 4 })] })] });
                    case 'Remarks':
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(row.rmks || '', { color: C.gray })] })] });
                    case 'Plain':
                    default:
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(this.cellValue(row, col.key))] })] });
                }
            });
            return new TableRow({ cantSplit: true, children: cells });
        });
        const dataTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: [headerRow, ...dataRows] });

        const footerCellBorder = { top: { style: BorderStyle.SINGLE, size: 6, color: C.black }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
        const footerCellMargins = { top: 80, bottom: 0, left: 0, right: 0 };
        const footer = new Footer({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3000, 3000, 3000], rows: [new TableRow({ cantSplit: true, children: [new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: wsafe(this.rabConfidentialLabel), font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })] })] }), new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ children: [] })] }), new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${isBn ? 'পৃষ্ঠা' : 'PAGE'} `, PageNumber.CURRENT, ` ${isBn ? '/' : 'OF'} `, PageNumber.TOTAL_PAGES], font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24, allCaps: !isBn })] })] })] })] })] });

        const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 680, bottom: 1247, left: 680, right: 680 } } }, footers: { default: footer }, children: [...headerPars, criteriaTable, new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: '', font: sans, size: 4 })] }), dataTable] }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `deceased-report_${this.lang}.docx`);
    }

    private exportRabExcel(): void {
        const isBn = this.lang === 'bn';
        const wsafe = (s: string | null | undefined): string => s ?? '';
        const visibleCols = this.visibleColumns;
        const headers: string[] = visibleCols.map(c => isBn ? c.labelBN : c.labelEN);
        const totalCols = headers.length || 1;

        const aoa: any[][] = [];
        const pad = (n: number) => Array.from({ length: n }, () => '');
        aoa.push([wsafe(this.rabOverlineText), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgTitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgSubtitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabSectionTitle), ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabCriteriaTitle}  ·  ${this.rabGeneratedLabel}: ${this.rabFormattedDate}`, ...pad(totalCols - 1)]);
        for (const it of this.criteriaItems) aoa.push([`${it.label}: ${it.value}`, ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push(headers);
        for (let i = 0; i < this.list.length; i++) {
            const row = this.list[i];
            const cells = visibleCols.map(col => {
                switch (col.hint) {
                    case 'Serial': return this.paddedSer((row as any).ser ?? i + 1);
                    case 'Personnel': {
                        const name = this.cellValue(row, 'name');
                        const meta = this.personnelMetaText(row);
                        return meta ? `${name}\n${meta}` : name;
                    }
                    case 'Remarks': return row.rmks || '';
                    case 'Date':
                    case 'Plain':
                    default: return this.cellValue(row, col.key);
                }
            });
            aoa.push(cells);
        }
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabConfidentialLabel}  ·  ${this.rabWarningLabel}`, ...pad(totalCols - 1)]);

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = ws['!merges'] ?? [];
        const titleRows = [0, 1, 2, 3, 4];
        for (const r of titleRows) ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
        const lastRow = aoa.length - 1;
        ws['!merges'].push({ s: { r: lastRow, c: 0 }, e: { r: lastRow, c: totalCols - 1 } });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isBn ? 'প্রতিবেদন' : 'Report');
        XLSX.writeFile(wb, `deceased-report_${this.lang}.xlsx`);
    }

    private openRabPrintWindow(): void {
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) { this.messageService.add({ severity: 'warn', summary: 'Popup blocked', detail: 'Allow popups for this site to use Print.', life: 6000 }); return; }
        const html = this.buildRabPrintHtml();
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => { try { win.focus(); win.print(); } catch { /* user can Ctrl+P from the open window */ } }, 700);
    }

    private buildRabPrintHtml(): string {
        const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const isBn = this.lang === 'bn';
        const serif = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', serif" : "'Playfair Display', Georgia, 'Times New Roman', serif";
        const sans = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', sans-serif" : "'DM Sans', 'Segoe UI', Arial, sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const visibleCols = this.visibleColumns;
        const tableHeaderHtml = `<tr>${visibleCols.map(c => `<th>${esc(this.lang === 'bn' ? c.labelBN : c.labelEN)}</th>`).join('')}</tr>`;

        const renderCell = (row: DeceasedReportRow, col: { key: string; hint: string }, idx: number): string => {
            switch (col.hint) {
                case 'Serial': return `<td class="td-ser"><span class="ser">${esc(this.paddedSer((row as any).ser ?? idx + 1))}</span></td>`;
                case 'Personnel': {
                    const meta = this.personnelMetaText(row);
                    const metaHtml = meta ? `<div class="personnel-meta">${esc(meta)}</div>` : '';
                    return `<td class="td-personnel"><div class="personnel-name">${esc(this.cellValue(row, 'name'))}</div>${metaHtml}</td>`;
                }
                case 'Date': return `<td class="td-date">${esc(this.cellValue(row, col.key))}</td>`;
                case 'Remarks': return `<td class="td-rmks">${esc(row.rmks || '')}</td>`;
                case 'Plain':
                default: return `<td>${esc(this.cellValue(row, col.key))}</td>`;
            }
        };

        const tableBodyHtml = this.list.map((row, i) => `<tr>${visibleCols.map(c => renderCell(row, c, i)).join('')}</tr>`).join('');
        const items = this.criteriaItems;
        const criteriaGridHtml = items.length ? `<div class="criteria-grid">${items.map(item => `<div class="cell"><div class="cell-label">${esc(item.label)}</div><div class="cell-value">${esc(item.value)}</div></div>`).join('')}</div>` : '';
        const confidential = this.rabConfidentialLabel;
        const warning = this.rabWarningLabel;
        const pageWord = isBn ? 'পৃষ্ঠা' : 'PAGE';
        const ofWord = isBn ? '/' : 'OF';
        const cssStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        return `<!DOCTYPE html><html lang="${isBn ? 'bn' : 'en'}"><head><meta charset="UTF-8" /><title>${esc(this.rabSectionTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
    @counter-style bn-digits { system: numeric; symbols: '\\09E6' '\\09E7' '\\09E8' '\\09E9' '\\09EA' '\\09EB' '\\09EC' '\\09ED' '\\09EE' '\\09EF'; }
    @page {
        margin: 12mm 5mm 22mm 5mm;
        @bottom-left { content: "● " "${cssStr(confidential)}"; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 0 0 8mm; background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5)); background-position: 8mm 1.5mm; background-size: calc(100% - 8mm) 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
        @bottom-center { content: "${cssStr(pageWord)} " counter(page${isBn ? ', bn-digits' : ''}) " ${cssStr(ofWord)} " counter(pages${isBn ? ', bn-digits' : ''}); font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.25em; text-transform: uppercase; color: #4a4a4a; padding-top: 5mm; background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5)); background-position: 0 1.5mm; background-size: 100% 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
        @bottom-right { content: "${cssStr(warning)}"; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 8mm 0 0; background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5)); background-position: 0 1.5mm; background-size: calc(100% - 8mm) 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0b0b0b; font-family: ${sans}; font-size: 10pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .paper { padding: 4mm 8mm; }
    .paper-head { text-align: center; margin-bottom: 6mm; }
    .overline { font-size: 7.5pt; letter-spacing: 0.3em; color: #555; text-transform: uppercase; margin-bottom: 3mm; font-weight: 500; ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';font-size:9pt;' : ''} }
    .paper-title { font-family: ${serif}; font-weight: 700; font-size: 22pt; margin: 0 0 2mm 0; letter-spacing: 0.12em; color: #0b0b0b; ${isBn ? 'letter-spacing:0;' : ''} }
    .paper-sub { font-family: ${serif}; font-style: italic; color: #555; font-size: 10pt; margin-bottom: 4mm; }
    .orn-divider { display: flex; justify-content: center; align-items: center; gap: 6mm; margin: 4mm auto; max-width: 65%; }
    .orn-line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, #b78b3b, transparent); }
    .orn-diamond { color: #b78b3b; font-size: 9pt; }
    .paper-section { font-family: ${serif}; font-size: 13pt; font-weight: 700; letter-spacing: 0.16em; color: #0b0b0b; margin: 0 0 1mm 0; text-transform: uppercase; ${isBn ? 'letter-spacing:0;' : ''} }
    .criteria { margin: 5mm 0 6mm; border: 1px solid #d8d6d0; border-radius: 1mm; overflow: hidden; }
    .criteria-strip { display: flex; justify-content: space-between; align-items: center; padding: 1.5mm 3mm; background: #f4f4f2; border-bottom: 1px solid #d8d6d0; font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase; color: #4a4a4a; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .criteria-strip-title { display: inline-flex; gap: 1.5mm; align-items: center; color: #0b0b0b; }
    .diamond-bullet { color: #b78b3b; }
    .criteria-strip-date { opacity: 0.75; font-weight: 500; }
    .criteria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr)); }
    .cell { padding: 2mm 3mm; border-right: 1px solid #e6e4de; border-top: 1px solid #e6e4de; }
    .cell-label { font-size: 7pt; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 1mm; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .cell-value { font-family: ${serif}; font-size: 10pt; font-weight: 700; color: #0b0b0b; line-height: 1.2; ${isBn ? 'font-family:' + sans + ';' : ''} }
    table { width: 100%; border-collapse: collapse; table-layout: auto; font-family: ${sans}; font-size: 8pt; }
    thead { display: table-header-group; }
    thead th { background: #0b0b0b; color: #d9c79a; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; padding: 1.8mm 2mm; text-align: left; vertical-align: middle; white-space: nowrap; border: 1px solid rgba(11,11,11,0.05); ${isBn ? 'letter-spacing:0.04em;font-family:' + sans + ';' : ''} }
    tbody td { padding: 2mm 2mm; font-size: 8pt; color: #0b0b0b; border: 1px solid rgba(11,11,11,0.05); vertical-align: top; background: #fff; word-break: break-word; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }
    .td-ser { white-space: nowrap; }
    .ser { font-family: ${mono}; font-size: 9pt; font-weight: 600; color: #6b6b6b; letter-spacing: 0.04em; white-space: nowrap; }
    .td-personnel { min-width: 56mm; }
    .personnel-name { font-family: ${sans}; font-weight: 600; font-size: 10pt; color: #0b0b0b; line-height: 1.2; }
    .personnel-meta { margin-top: 0.7mm; font-family: ${mono}; font-size: 7pt; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b6b; ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';' : ''} }
    .td-date { font-family: ${mono}; letter-spacing: 0.02em; white-space: nowrap; }
</style></head><body><div class="paper">
    <header class="paper-head">
        <div class="overline">${esc(this.rabOverlineText)}</div>
        <h1 class="paper-title">${esc(this.rabOrgTitle)}</h1>
        <div class="paper-sub"><em>${esc(this.rabOrgSubtitle)}</em></div>
        <div class="orn-divider"><span class="orn-line"></span><span class="orn-diamond">&#9670;</span><span class="orn-line"></span></div>
        <h2 class="paper-section">${esc(this.rabSectionTitle)}</h2>
    </header>
    <div class="criteria">
        <div class="criteria-strip"><span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${esc(this.rabCriteriaTitle)}</span><span class="criteria-strip-date">${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span></div>
        ${criteriaGridHtml}
    </div>
    <table><thead>${tableHeaderHtml}</thead><tbody>${tableBodyHtml}</tbody></table>
</div></body></html>`;
    }

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
    }

    formatDateLabel(v: string | null | undefined): string {
        if (v == null || v === '') return '—';
        try {
            const d = new Date(v);
            if (isNaN(d.getTime())) return v;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = String(d.getFullYear());
            const s = `${day}-${month}-${year}`;
            return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
        } catch { return v; }
    }
}
