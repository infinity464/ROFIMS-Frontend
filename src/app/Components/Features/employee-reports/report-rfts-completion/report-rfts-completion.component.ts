import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { MultiSelectModule } from 'primeng/multiselect';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    RftsCompletionReportRow,
    DynamicReportCriterion,
    DynamicReportRow,
} from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';

@Component({
    selector: 'app-report-rfts-completion',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, InputTextModule, DatePickerModule, MultiSelectModule, Toast],
    providers: [MessageService],
    templateUrl: './report-rfts-completion.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-rfts-completion.component.scss'],
})
export class ReportRftsCompletionComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    /** Primary filter — switches the report between the two lists. */
    statusOptions: { label: string; labelBn: string; value: 'Completed' | 'NotCompleted' }[] = [
        { label: 'Completed RFTS', labelBn: 'আরএফটিএস সম্পন্ন', value: 'Completed' },
        { label: 'Not Completed RFTS', labelBn: 'আরএফটিএস সম্পন্ন হয়নি', value: 'NotCompleted' },
    ];
    selectedCompletionStatus: 'Completed' | 'NotCompleted' = 'Completed';

    /** Org / role dropdowns — loaded from CommonCode + MotherOrg endpoints. */
    motherOrgOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedMotherOrgId: number | null = null;
    memberTypeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedMemberTypeId: number | null = null;
    /** Full rank list — kept so we can re-derive the visible options when Member Type changes. */
    private allRankOptions: { label: string; labelBn: string; value: number; parentCodeId: number | null }[] = [];
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedRankId: number | null = null;

    /** Course-specific filters. */
    searchCourseNo: string = '';
    /** Duration filter — RFTS course start/end window. */
    dateFrom: Date | null = null;
    dateTo: Date | null = null;

    list: RftsCompletionReportRow[] = [];
    loading = false;
    first = 0;
    rows = 20;
    totalRecords = 0;

    // ── Dynamic column picker ─────────────────────────────────────────────
    /** RFTS course columns — only meaningful in the "Completed" view. */
    private static readonly courseKeys = ['latestCourseNo', 'latestCourseDateFrom', 'latestCourseDateTo', 'coursesCompleted'];

    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: 'Serial' | 'Name' | 'Date' | 'Plain'; defaultVisible: boolean; courseOnly?: boolean }[] = [
        { key: 'ser',                  labelEN: 'Ser',              labelBN: 'ক্রঃ',            hint: 'Serial', defaultVisible: true  },
        { key: 'name',                 labelEN: 'Name',             labelBN: 'নাম',             hint: 'Name',   defaultVisible: true  },
        { key: 'rabId',                labelEN: 'RAB ID',           labelBN: 'র‍্যাব আইডি',     hint: 'Plain',  defaultVisible: true  },
        { key: 'serviceId',            labelEN: 'Service ID',       labelBN: 'সার্ভিস আইডি',    hint: 'Plain',  defaultVisible: true  },
        { key: 'rank',                 labelEN: 'Rank',             labelBN: 'পদবী',            hint: 'Plain',  defaultVisible: true  },
        { key: 'corps',                labelEN: 'Corps',            labelBN: 'কোর',             hint: 'Plain',  defaultVisible: true  },
        { key: 'trade',                labelEN: 'Trade',            labelBN: 'ট্রেড',           hint: 'Plain',  defaultVisible: true  },
        { key: 'orgName',              labelEN: 'Mother Org',       labelBN: 'মাতৃ সংস্থা',     hint: 'Plain',  defaultVisible: true  },
        { key: 'latestCourseNo',       labelEN: 'Latest Course No', labelBN: 'সর্বশেষ কোর্স নং', hint: 'Plain', defaultVisible: true,  courseOnly: true },
        { key: 'latestCourseDateFrom', labelEN: 'From',             labelBN: 'হইতে',            hint: 'Date',   defaultVisible: true,  courseOnly: true },
        { key: 'latestCourseDateTo',   labelEN: 'To',               labelBN: 'পর্যন্ত',         hint: 'Date',   defaultVisible: true,  courseOnly: true },
        // ── Opt-in extras (registry FieldKeys) ────────────────────────────
        { key: 'coursesCompleted',     labelEN: 'Courses Completed',labelBN: 'সম্পন্ন কোর্স',   hint: 'Plain',  defaultVisible: false, courseOnly: true },
        { key: 'nameBangla',           labelEN: 'Name (Bangla)',    labelBN: 'নাম (বাংলা)',     hint: 'Plain',  defaultVisible: false },
        { key: 'nid',                  labelEN: 'NID',              labelBN: 'এনআইডি',          hint: 'Plain',  defaultVisible: false },
        { key: 'prefix',               labelEN: 'Prefix',           labelBN: 'প্রিফিক্স',       hint: 'Plain',  defaultVisible: false },
        { key: 'appointment',          labelEN: 'Appointment',      labelBN: 'নিয়োগ',          hint: 'Plain',  defaultVisible: false },
        { key: 'memberType',           labelEN: 'Member Type',      labelBN: 'সদস্য ধরন',       hint: 'Plain',  defaultVisible: false },
        { key: 'gender',               labelEN: 'Gender',           labelBN: 'লিঙ্গ',           hint: 'Plain',  defaultVisible: false },
        { key: 'motherUnit',           labelEN: 'Mother Unit',      labelBN: 'মাতৃ ইউনিট',      hint: 'Plain',  defaultVisible: false },
        { key: 'rabUnit',              labelEN: 'RAB Unit',         labelBN: 'র‍্যাব ইউনিট',    hint: 'Plain',  defaultVisible: false },
        { key: 'dateOfCommission',     labelEN: 'Commission Date',  labelBN: 'কমিশন তারিখ',     hint: 'Date',   defaultVisible: false },
        { key: 'joiningInRab',         labelEN: 'RAB Joining Date', labelBN: 'র‍্যাবে যোগদান',   hint: 'Date',   defaultVisible: false },
        { key: 'officerType',          labelEN: 'Officer Type',     labelBN: 'অফিসার ধরণ',      hint: 'Plain',  defaultVisible: false },
        { key: 'postingStatus',        labelEN: 'Posting Status',   labelBN: 'নিয়োগ অবস্থা',    hint: 'Plain',  defaultVisible: false },
        { key: 'dob',                  labelEN: 'Date of Birth',    labelBN: 'জন্ম তারিখ',      hint: 'Date',   defaultVisible: false },
        { key: 'religion',             labelEN: 'Religion',         labelBN: 'ধর্ম',            hint: 'Plain',  defaultVisible: false },
        { key: 'bloodGroup',           labelEN: 'Blood Group',      labelBN: 'রক্তের গ্রুপ',     hint: 'Plain',  defaultVisible: false },
        { key: 'maritalStatus',        labelEN: 'Marital Status',   labelBN: 'বৈবাহিক অবস্থা',   hint: 'Plain',  defaultVisible: false },
        { key: 'mobileNo',             labelEN: 'Mobile',           labelBN: 'মোবাইল',          hint: 'Plain',  defaultVisible: false },
        { key: 'email',                labelEN: 'Email',            labelBN: 'ইমেইল',           hint: 'Plain',  defaultVisible: false },
    ];

    /** Legacy column key → RftsReportFieldRegistry FieldKey for the request. */
    private static readonly colKeyToBackend: Record<string, string> = {
        ser: 'ser', name: 'personnel', rank: 'armyRank', orgName: 'motherOrganization',
        rabId: 'rabId', serviceId: 'serviceId', corps: 'corps', trade: 'trade',
        latestCourseNo: 'latestCourseNo', latestCourseDateFrom: 'latestCourseDateFrom',
        latestCourseDateTo: 'latestCourseDateTo', coursesCompleted: 'coursesCompleted',
    };
    private static readonly extraDateKeys = new Set(['dateOfCommission', 'joiningInRab', 'dob']);
    private static readonly extraPlainKeys = new Set(['nameBangla', 'nid', 'bloodGroup', 'mobileNo', 'email', 'postingStatus']);

    selectedColumnKeys: string[] = this.defaultColumnsFor('Completed');
    draggingColumnKey: string | null = null;

    /** Default visible columns for a view — drops course columns in NotCompleted. */
    private defaultColumnsFor(status: 'Completed' | 'NotCompleted'): string[] {
        return this.columnCatalog
            .filter(c => c.defaultVisible && (status === 'Completed' || !c.courseOnly))
            .map(c => c.key);
    }

    /** Picker options — hide course-only fields in the NotCompleted view. */
    get columnPickerOptions(): { label: string; value: string }[] {
        return this.columnCatalog
            .filter(c => this.isCompletedView || !c.courseOnly)
            .map(c => ({ label: this.lang === 'bn' ? c.labelBN : c.labelEN, value: c.key }));
    }
    get visibleColumns(): typeof this.columnCatalog {
        const map = new Map(this.columnCatalog.map(c => [c.key, c]));
        return this.selectedColumnKeys
            .map(k => map.get(k))
            .filter((c): c is typeof this.columnCatalog[number] => c != null);
    }

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

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];
    filterOpen = true;

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
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

        this.loadMotherOrgOptions();
        this.loadMemberTypeOptions();
        this.loadRankOptions();
    }

    private loadMotherOrgOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs: MotherOrganizationModel[]) => {
                this.motherOrgOptions = (orgs ?? []).map((o) => ({
                    label: o.orgNameEN || String(o.orgId),
                    labelBn: o.orgNameBN || o.orgNameEN || String(o.orgId),
                    value: o.orgId,
                }));
            },
            error: () => { this.motherOrgOptions = []; },
        });
    }

    /**
     * Mother Org changed — reload ranks scoped to that org (each org
     * has its own MotherOrgRank table), then re-apply the member-type
     * sub-filter. When no org is selected, fall back to the global
     * MotherOrgRank list so the dropdown isn't empty by default.
     */
    onMotherOrgChange(): void {
        this.loadRankOptions();
        if (this.selectedRankId != null) this.selectedRankId = null;
    }

    private loadMemberTypeOptions(): void {
        // "Member Type" in business language === "EmployeeType" CodeType in the DB.
        // getAccessibleMemberTypes() is the access-scoped variant — returns
        // ONLY the EmployeeType rows the caller can see, matching the
        // member-type access scope this report enforces.
        this.commonCodeService.getAccessibleMemberTypes().subscribe({
            next: (codes: any[]) => {
                this.memberTypeOptions = (Array.isArray(codes) ? codes : []).map((c: any) => this.toOption(c));
            },
            error: () => { this.memberTypeOptions = []; },
        });
    }

    private loadRankOptions(): void {
        // EmployeeInfo.Rank is a CommonCode CodeId of CodeType
        // 'MotherOrgRank' (per-org). Each rank's parentCodeId points to
        // its owning Member Type (EmployeeType) — that's the cascade.
        // When a Mother Org is picked, scope ranks to that org; when
        // none is picked, fall back to the global MotherOrgRank list so
        // the dropdown isn't empty.
        const source$ = this.selectedMotherOrgId != null
            ? this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(this.selectedMotherOrgId, 'MotherOrgRank')
            : this.commonCodeService.getAllActiveCommonCodesType('MotherOrgRank');
        source$.subscribe({
            next: (codes: any[]) => {
                const list = Array.isArray(codes) ? codes : [];
                this.allRankOptions = list.map((c: any) => ({
                    ...this.toOption(c),
                    parentCodeId: c?.parentCodeId ?? c?.ParentCodeId ?? null,
                }));
                this.applyRankMemberTypeFilter();
            },
            error: () => { this.allRankOptions = []; this.rankOptions = []; },
        });
    }

    /**
     * Show only ranks whose owning Member Type matches the selected
     * Member Type. When no Member Type is picked, show all ranks. If
     * the previously selected rank doesn't survive the filter, clear it
     * so the request doesn't carry a stale, no-longer-valid id.
     */
    onMemberTypeChange(): void {
        this.applyRankMemberTypeFilter();
        if (this.selectedRankId != null && !this.rankOptions.some((r) => r.value === this.selectedRankId)) {
            this.selectedRankId = null;
        }
    }

    private applyRankMemberTypeFilter(): void {
        const memberType = this.selectedMemberTypeId;
        const filtered = memberType == null
            ? this.allRankOptions
            : this.allRankOptions.filter((r) => r.parentCodeId === memberType);
        // Strip parentCodeId before exposing to the dropdown — keeps the
        // template's option type narrow.
        this.rankOptions = filtered.map((r) => ({ label: r.label, labelBn: r.labelBn, value: r.value }));
    }

    /**
     * Maps a CommonCode-shaped object to the { label, labelBn, value }
     * shape the p-select dropdowns expect. Falls back through camelCase
     * and PascalCase property names since the .NET serializer convention
     * isn't uniform across all CommonCode-returning endpoints.
     */
    private toOption(c: any): { label: string; labelBn: string; value: number } {
        const id = c?.codeId ?? c?.CodeId ?? 0;
        const en = c?.codeValueEN ?? c?.CodeValueEN ?? c?.displayCodeValueEN ?? c?.DisplayCodeValueEN ?? String(id);
        const bn = c?.codeValueBN ?? c?.CodeValueBN ?? c?.displayCodeValueBN ?? c?.DisplayCodeValueBN ?? en;
        return { label: en, labelBn: bn, value: id };
    }

    /** YYYY-MM-DD from local date parts — avoids the UTC shift that toISOString does. */
    private toLocalDateStr(d: Date | null): string | null {
        if (!d) return null;
        const x = new Date(d);
        if (isNaN(x.getTime())) return null;
        const y = x.getFullYear();
        const m = String(x.getMonth() + 1).padStart(2, '0');
        const day = String(x.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    get reportTitle(): string {
        const base = this.L[this.lang]['report.title.rftsCompletion'];
        const status = this.statusOptions.find((o) => o.value === this.selectedCompletionStatus);
        const statusLabel = this.lang === 'bn' ? status?.labelBn : status?.label;
        return statusLabel ? `${base} (${statusLabel})` : base;
    }

    get dateLine(): string {
        const now = new Date();
        if (this.lang === 'en') {
            return now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        return now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    /** Caption fragment showing the active completion filter — used inside the heading and the export footer. */
    private statusCaption(): string {
        const s = this.statusOptions.find((o) => o.value === this.selectedCompletionStatus);
        return this.lang === 'bn' ? (s?.labelBn ?? '') : (s?.label ?? '');
    }

    buildFilterLines(): string[] {
        const L = this.L[this.lang];
        const lines: string[] = [];
        lines.push(`${L['report.search.completionStatus']}: ${this.statusCaption()}`);
        if (this.selectedMotherOrgId != null) {
            const o = this.motherOrgOptions.find((x) => x.value === this.selectedMotherOrgId);
            const val = this.lang === 'bn' ? o?.labelBn : o?.label;
            if (val) lines.push(`${L['report.search.motherOrg']}: ${val}`);
        }
        if (this.selectedMemberTypeId != null) {
            const o = this.memberTypeOptions.find((x) => x.value === this.selectedMemberTypeId);
            const val = this.lang === 'bn' ? o?.labelBn : o?.label;
            if (val) lines.push(`${L['report.search.memberType']}: ${val}`);
        }
        if (this.selectedRankId != null) {
            const o = this.rankOptions.find((x) => x.value === this.selectedRankId);
            const val = this.lang === 'bn' ? o?.labelBn : o?.label;
            if (val) lines.push(`${L['report.search.rank']}: ${val}`);
        }
        if (this.isCompletedView) {
            if (this.searchCourseNo.trim()) lines.push(`Course No: ${this.searchCourseNo.trim()}`);
            const df = this.toLocalDateStr(this.dateFrom);
            const dt = this.toLocalDateStr(this.dateTo);
            if (df) lines.push(`${L['report.search.fromDate']}: ${df}`);
            if (dt) lines.push(`${L['report.search.toDate']}: ${dt}`);
        }
        return lines;
    }

    /** Export reflects the visible column picker (labels + values, in order). */
    getExportData(): { columns: string[]; rows: string[][] } {
        const cols = this.visibleColumns;
        const columns = cols.map(c => this.lang === 'bn' ? c.labelBN : c.labelEN);
        const rows = this.list.map(row => cols.map(c => this.cellValue(row, c.key)));
        return { columns, rows };
    }

    /** Resolve a cell's display value by column key. */
    cellValue(row: RftsCompletionReportRow, key: string): string {
        switch (key) {
            case 'name':                 return this.codeValue(row.name, row.nameBN);
            case 'rabId':                return row.rabid ?? '—';
            case 'serviceId':            return this.displayNum(row.serviceId);
            case 'rank':                 return this.codeValue(row.rank, row.rankBN);
            case 'corps':                return this.codeValue(row.corps, row.corpsBN);
            case 'trade':                return this.codeValue(row.trade, row.tradeBN);
            case 'orgName':              return this.codeValue(row.orgName, row.orgNameBN);
            case 'latestCourseNo':       return row.latestCourseNo ?? '—';
            case 'latestCourseDateFrom': return this.fmtDate(row.latestCourseDateFrom);
            case 'latestCourseDateTo':   return this.fmtDate(row.latestCourseDateTo);
            case 'coursesCompleted':     return this.displayNum(row.coursesCompleted);
            default:                     return this.extraCellValue(row, key);
        }
    }

    /** Resolve an opt-in (registry-keyed) column from the spread property bag. */
    private extraCellValue(row: RftsCompletionReportRow, key: string): string {
        const anyRow = row as any;
        if (ReportRftsCompletionComponent.extraDateKeys.has(key)) return this.fmtDate(anyRow[key]);
        if (ReportRftsCompletionComponent.extraPlainKeys.has(key)) return this.displayNum(anyRow[key]);
        return this.codeValue(anyRow[key], anyRow[key + 'BN']);
    }

    /** Translate a dynamic-backend property bag into the row shape. */
    private adaptDynamicRow(d: DynamicReportRow, ser: number): RftsCompletionReportRow {
        return {
            ...d,
            ser,
            employeeId:           d['employeeId']           as number,
            name:                 d['nameEnglish']          as string,
            nameBN:               d['nameBangla']           as string,
            rabid:                d['rabId']                as string,
            serviceId:            d['serviceId']            as string,
            rank:                 d['armyRank']             as string,
            rankBN:               d['armyRankBN']           as string,
            corps:                d['corps']                as string,
            corpsBN:              d['corpsBN']              as string,
            trade:                d['trade']                as string,
            tradeBN:              d['tradeBN']              as string,
            orgName:              d['motherOrganization']   as string,
            orgNameBN:            d['motherOrganizationBN'] as string,
            coursesCompleted:     d['coursesCompleted']     as number,
            latestCourseNo:       d['latestCourseNo']       as string,
            latestCourseDateFrom: d['latestCourseDateFrom'] as string,
            latestCourseDateTo:   d['latestCourseDateTo']   as string,
        } as RftsCompletionReportRow;
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        const { columns, rows } = this.getExportData();
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            filterLines: this.appliedFilterLines,
            landscape: true,
            marginMm: 5,
        };
        if (type === 'pdf') {
            this.exporting = true;
            try { await this.exportService.generatePDF(config); } finally { this.exporting = false; }
        } else if (type === 'print') {
            this.exportService.exportPDF(config);
        } else if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    get activeFilterCount(): number {
        let c = 1; // completion status is always set
        if (this.selectedMotherOrgId != null) c++;
        if (this.selectedMemberTypeId != null) c++;
        if (this.selectedRankId != null) c++;
        if (this.isCompletedView) {
            if (this.searchCourseNo.trim()) c++;
            if (this.dateFrom) c++;
            if (this.dateTo) c++;
        }
        return c;
    }

    /**
     * Course No / duration filters only make sense for "Completed RFTS"
     * (they pivot the membership filter on a specific course / window).
     * Clear them when switching to the Not Completed view so a stale value
     * doesn't silently come back when the user switches back.
     */
    onCompletionStatusChange(): void {
        if (!this.isCompletedView) {
            this.searchCourseNo = '';
            this.dateFrom = null;
            this.dateTo = null;
        }
        // Reset the visible columns to the view's defaults (course columns are
        // dropped for NotCompleted, restored for Completed).
        this.selectedColumnKeys = this.defaultColumnsFor(this.selectedCompletionStatus);
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    filterSubtitle(): string {
        const L = this.L['en'];
        if (this.activeFilterCount === 0) return L['report.search.panelSubtitle'];
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' ' + L['report.search.panelSubtitleApplied'];
    }

    clearFilters(): void {
        this.selectedCompletionStatus = 'Completed';
        this.selectedMotherOrgId = null;
        this.selectedMemberTypeId = null;
        this.selectedRankId = null;
        this.searchCourseNo = '';
        this.dateFrom = null;
        this.dateTo = null;
        this.selectedColumnKeys = this.defaultColumnsFor('Completed');
        this.first = 0;
        this.list = [];
        this.totalRecords = 0;
    }

    onPage(event: { first: number; rows: number }): void {
        this.first = event.first;
        this.rows = event.rows;
        this.load();
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    load(): void {
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const page_no = Math.floor(this.first / this.rows) + 1;

        // Map UI filters → dynamic-backend criteria (registry FieldKeys).
        const criteria: DynamicReportCriterion[] = [];
        if (this.selectedMotherOrgId != null)
            criteria.push({ fieldKey: 'motherOrganization', idValue: this.selectedMotherOrgId });
        if (this.selectedMemberTypeId != null)
            criteria.push({ fieldKey: 'memberType', idValue: this.selectedMemberTypeId });
        if (this.selectedRankId != null)
            criteria.push({ fieldKey: 'armyRank', idValue: this.selectedRankId });

        const columns = this.selectedColumnKeys.map(
            k => ReportRftsCompletionComponent.colKeyToBackend[k] ?? k,
        );

        this.reportService
            .runDynamicRftsReport({
                columns,
                criteria,
                rftsCompletionStatus: this.selectedCompletionStatus,
                rftsCourseNo: this.isCompletedView ? (this.searchCourseNo.trim() || null) : null,
                rftsDateFrom: this.isCompletedView ? this.toLocalDateStr(this.dateFrom) : null,
                rftsDateTo: this.isCompletedView ? this.toLocalDateStr(this.dateTo) : null,
                pagination: { page_no, row_per_page: this.rows },
            })
            .subscribe({
                next: (res) => {
                    const startSer = (page_no - 1) * this.rows + 1;
                    this.list = (res.datalist ?? []).map((d, i) => this.adaptDynamicRow(d, startSer + i));
                    this.totalRecords = res.pages?.Rows ?? res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    console.error(err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load report',
                    });
                    this.loading = false;
                },
            });
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

    /**
     * Backend emits ISO yyyy-MM-dd; the report displays dd-MM-yyyy.
     * Done as pure string rearrange — passing through new Date() would
     * parse the ISO string as UTC midnight and shift the calendar day
     * for any timezone offset, e.g. 2026-05-01 → 30 Apr 2026 in UTC-X.
     */
    fmtDate(iso: string | null | undefined): string {
        if (!iso) return '—';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
        if (!m) return iso;
        const yyyy = m[1];
        const mm = m[2];
        const dd = m[3];
        return this.lang === 'bn'
            ? `${BanglaNumerals.toBangla(dd)}-${BanglaNumerals.toBangla(mm)}-${BanglaNumerals.toBangla(yyyy)}`
            : `${dd}-${mm}-${yyyy}`;
    }

    /** Convenience for the template — completion view shows extra columns. */
    get isCompletedView(): boolean {
        return this.selectedCompletionStatus === 'Completed';
    }
}
