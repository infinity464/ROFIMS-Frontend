import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule } from 'primeng/paginator';
import { DatePickerModule } from 'primeng/datepicker';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { PermanentPostingJoineeDetailService } from '@/services/permanent-posting-joinee-detail.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { StayAfterRelieverJoinedReportRow, ReportAccessibleScope, DynamicReportCriterion, DynamicReportRow } from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import { unitScopeLine, memberTypeScopeLine } from '../report-scope.helper';
import { AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { forkJoin } from 'rxjs';

type Lang = 'en' | 'bn';

/**
 * Stay-After-Reliever-Joined Report — RAB-formal layout, dynamic column
 * picker, drag-to-reorder, Print/Word/Excel exports. Uses the existing
 * /GetStayAfterRelieverJoinedReport endpoint (access control is applied
 * server-side via the same access-scope context as the other reports).
 */
@Component({
    selector: 'app-report-stay-after-reliever-joined',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, MultiSelectModule, PaginatorModule, DatePickerModule, Toast],
    providers: [MessageService],
    templateUrl: './report-stay-after-reliever-joined.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-stay-after-reliever-joined.component.scss']
})
export class ReportStayAfterRelieverJoinedComponent implements OnInit {
    lang: Lang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    list: StayAfterRelieverJoinedReportRow[] = [];
    loading = false;
    searched = false;

    /** Report mode — reliever joined (default) vs reliever not yet joined. */
    relieverMode: 'joined' | 'notJoined' | 'standRelease' | 'newPosting' = 'joined';
    /** Mode of the CURRENTLY DISPLAYED results — updated only on Search, so the
        table/columns don't change when the dropdown changes before searching. */
    appliedMode: 'joined' | 'notJoined' | 'standRelease' | 'newPosting' = 'joined';
    relieverModeOptions: { label: string; value: 'joined' | 'notJoined' | 'standRelease' | 'newPosting' }[] = [
        { label: 'Stay After Reliever Joined', value: 'joined' },
        { label: 'Member Stay Reliever Not Joined', value: 'notJoined' },
        { label: 'Stand Release', value: 'standRelease' },
        { label: 'New Posting Person List', value: 'newPosting' }
    ];

    orgOptions: { label: string; labelBn: string; value: number }[] = [];
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    memberTypeOptions: { label: string; labelBn: string; value: number }[] = [];
    corpsOptions: { label: string; labelBn: string; value: number }[] = [];
    tradeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedOrgIds: number[] = [];
    selectedRankId: number | null = null;
    rabUnitOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedMemberTypeIds: number[] = [];
    selectedCorpsIds: number[] = [];
    selectedTradeIds: number[] = [];
    selectedRabUnitIds: number[] = [];
    /** Possible Release Date range — only used in 'standRelease' mode. */
    releaseFrom: Date | null = null;
    releaseTo: Date | null = null;
    /** Possible Joining Date range — only used in 'newPosting' mode. */
    joiningFrom: Date | null = null;
    joiningTo: Date | null = null;
    /** Raw org-scoped MotherOrgRank rows, re-filtered client-side by Member Type. */
    private allRanksForOrg: CommonCodeModel[] = [];

    first = 0;
    rows = 100;
    rowsPerPageOptions = [100, 500, 1000, 5000];
    totalRecords = 0;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];
    filterOpen = true;

    accessibleScope: ReportAccessibleScope | null = null;
    get unitScopeLine(): string | null {
        return unitScopeLine(this.accessibleScope, this.lang);
    }
    get memberTypeScopeLine(): string | null {
        return memberTypeScopeLine(this.accessibleScope, this.lang);
    }

    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: 'Serial' | 'Personnel' | 'Date' | 'Plain' | 'Remarks' | 'Duration'; defaultVisible: boolean }[] = [
        { key: 'ser', labelEN: 'Ser', labelBN: 'ক্রঃ', hint: 'Serial', defaultVisible: true },
        { key: 'serviceId', labelEN: 'Service ID', labelBN: 'ব্যক্তিগত নম্বর', hint: 'Plain', defaultVisible: true },
        { key: 'rank', labelEN: 'Rank', labelBN: 'পদবী', hint: 'Plain', defaultVisible: true },
        { key: 'corps', labelEN: 'Corps', labelBN: 'কোর', hint: 'Plain', defaultVisible: true },
        { key: 'trade', labelEN: 'Trade', labelBN: 'ট্রেড', hint: 'Plain', defaultVisible: true },
        { key: 'name', labelEN: 'Name', labelBN: 'নাম', hint: 'Personnel', defaultVisible: true },
        { key: 'joiningInRab', labelEN: 'RAB Joining Date', labelBN: 'র‍্যাবে যোগদানের তারিখ', hint: 'Date', defaultVisible: true },
        { key: 'durationOfStay', labelEN: 'Duration of Stay', labelBN: 'অবস্থানের মেয়াদকাল', hint: 'Duration', defaultVisible: true },
        { key: 'presentUnit', labelEN: 'Battalion', labelBN: 'ব্যাটালিয়ন', hint: 'Plain', defaultVisible: true },
        { key: 'postedOutUnit', labelEN: 'Posted-out Unit', labelBN: 'বদলিকৃত ইউনিট', hint: 'Plain', defaultVisible: true },
        { key: 'relieverYesNo', labelEN: 'Reliever (Yes/No)', labelBN: 'প্রতিস্থাপক (হ্যাঁ/না)', hint: 'Plain', defaultVisible: false },
        { key: 'relieverJoiningDate', labelEN: 'Reliever Joining Date', labelBN: 'প্রতিস্থাপক যোগদানের তারিখ', hint: 'Date', defaultVisible: true },
        { key: 'rmks', labelEN: 'Remarks', labelBN: 'মন্তব্য', hint: 'Remarks', defaultVisible: true },
        // ── Opt-in extras (registry FieldKeys) — hidden by default ────────
        { key: 'relieverServiceId', labelEN: 'Reliever Service ID', labelBN: 'প্রতিস্থাপক সার্ভিস আইডি', hint: 'Plain', defaultVisible: false },
        { key: 'relieverName', labelEN: 'Reliever Name', labelBN: 'প্রতিস্থাপক নাম', hint: 'Plain', defaultVisible: false },
        { key: 'relieverRank', labelEN: 'Reliever Rank', labelBN: 'প্রতিস্থাপক পদবী', hint: 'Plain', defaultVisible: false },
        { key: 'relieverCorps', labelEN: 'Reliever Corps', labelBN: 'প্রতিস্থাপক কোর', hint: 'Plain', defaultVisible: false },
        { key: 'relieverTrade', labelEN: 'Reliever Trade', labelBN: 'প্রতিস্থাপক ট্রেড', hint: 'Plain', defaultVisible: false },
        { key: 'possibleJoiningDate', labelEN: 'Possible Joining Date', labelBN: 'সম্ভাব্য যোগদানের তারিখ', hint: 'Date', defaultVisible: false },
        { key: 'postingOrderDate', labelEN: 'Posting Order Date', labelBN: 'প্রেষনাদেশের তারিখ', hint: 'Date', defaultVisible: false },
        { key: 'motherUnit', labelEN: 'Mother Unit', labelBN: 'মাতৃ ইউনিট', hint: 'Plain', defaultVisible: false },
        { key: 'rabRank', labelEN: 'RAB Rank', labelBN: 'র‍্যাব র‍্যাঙ্ক', hint: 'Plain', defaultVisible: false },
        { key: 'rabId', labelEN: 'RAB ID', labelBN: 'র‍্যাব আইডি', hint: 'Plain', defaultVisible: false },
        { key: 'nameBangla', labelEN: 'Name (Bangla)', labelBN: 'নাম (বাংলা)', hint: 'Plain', defaultVisible: false },
        { key: 'nid', labelEN: 'NID', labelBN: 'এনআইডি', hint: 'Plain', defaultVisible: false },
        { key: 'prefix', labelEN: 'Prefix', labelBN: 'প্রিফিক্স', hint: 'Plain', defaultVisible: false },
        { key: 'appointment', labelEN: 'Appointment', labelBN: 'নিয়োগ', hint: 'Plain', defaultVisible: false },
        { key: 'memberType', labelEN: 'Member Type', labelBN: 'সদস্য ধরন', hint: 'Plain', defaultVisible: false },
        { key: 'motherOrganization', labelEN: 'Mother Org', labelBN: 'মাতৃ সংস্থা', hint: 'Plain', defaultVisible: false },
        { key: 'gender', labelEN: 'Gender', labelBN: 'লিঙ্গ', hint: 'Plain', defaultVisible: false },
        { key: 'rabUnit', labelEN: 'RAB Unit', labelBN: 'র‍্যাব ইউনিট', hint: 'Plain', defaultVisible: false },
        { key: 'dateOfCommission', labelEN: 'Commission Date', labelBN: 'কমিশন তারিখ', hint: 'Date', defaultVisible: false },
        { key: 'rabServiceFrom', labelEN: 'RAB Service From', labelBN: 'র‍্যাব স্থিতিকাল হইতে', hint: 'Date', defaultVisible: false },
        { key: 'rabServiceTo', labelEN: 'RAB Service To', labelBN: 'র‍্যাব স্থিতিকাল পর্যন্ত', hint: 'Date', defaultVisible: false },
        { key: 'postingStatus', labelEN: 'Posting Status', labelBN: 'নিয়োগ অবস্থা', hint: 'Plain', defaultVisible: false },
        { key: 'officerType', labelEN: 'Officer Type', labelBN: 'অফিসার ধরণ', hint: 'Plain', defaultVisible: false },
        { key: 'dob', labelEN: 'Date of Birth', labelBN: 'জন্ম তারিখ', hint: 'Date', defaultVisible: false },
        { key: 'religion', labelEN: 'Religion', labelBN: 'ধর্ম', hint: 'Plain', defaultVisible: false },
        { key: 'bloodGroup', labelEN: 'Blood Group', labelBN: 'রক্তের গ্রুপ', hint: 'Plain', defaultVisible: false },
        { key: 'maritalStatus', labelEN: 'Marital Status', labelBN: 'বৈবাহিক অবস্থা', hint: 'Plain', defaultVisible: false },
        { key: 'mobileNo', labelEN: 'Mobile', labelBN: 'মোবাইল', hint: 'Plain', defaultVisible: false },
        { key: 'email', labelEN: 'Email', labelBN: 'ইমেইল', hint: 'Plain', defaultVisible: false }
    ];

    /** Fixed column set for 'newPosting' mode — mirrors the new-joining-person-list page
        (one row per joinee). Rendered via joineeCellValue(), not the long-stay row. */
    joineeColumnCatalog: { key: string; labelEN: string; labelBN: string; hint: 'Serial' | 'Personnel' | 'Date' | 'Plain' | 'Remarks' | 'Duration'; defaultVisible: boolean }[] = [
        { key: 'ser', labelEN: 'Ser', labelBN: 'ক্রঃ', hint: 'Serial', defaultVisible: true },
        { key: 'serviceId', labelEN: 'Service ID', labelBN: 'সার্ভিস আইডি', hint: 'Plain', defaultVisible: true },
        { key: 'rank', labelEN: 'Rank', labelBN: 'পদবী', hint: 'Plain', defaultVisible: true },
        { key: 'corps', labelEN: 'Corps', labelBN: 'কোর', hint: 'Plain', defaultVisible: true },
        { key: 'trade', labelEN: 'Trade', labelBN: 'ট্রেড', hint: 'Plain', defaultVisible: true },
        { key: 'name', labelEN: 'Name', labelBN: 'নাম', hint: 'Plain', defaultVisible: true },
        { key: 'motherOrg', labelEN: 'Mother Org', labelBN: 'মাতৃ সংস্থা', hint: 'Plain', defaultVisible: true },
        { key: 'motherOrgUnit', labelEN: 'Mother Org Unit', labelBN: 'মাতৃ সংস্থা ইউনিট', hint: 'Plain', defaultVisible: true },
        // "Replace" = the posted-out person this new joinee is replacing.
        { key: 'isReplace', labelEN: 'Is Replace', labelBN: 'প্রতিস্থাপন', hint: 'Plain', defaultVisible: true },
        { key: 'replaceId', labelEN: 'Replace ID', labelBN: 'প্রতিস্থাপিত আইডি', hint: 'Plain', defaultVisible: true },
        { key: 'replaceRank', labelEN: 'Replace Rank', labelBN: 'প্রতিস্থাপিত পদবী', hint: 'Plain', defaultVisible: true },
        { key: 'replaceName', labelEN: 'Replace Name', labelBN: 'প্রতিস্থাপিত নাম', hint: 'Plain', defaultVisible: true },
        { key: 'rabUnit', labelEN: 'RAB Unit', labelBN: 'র‍্যাব ইউনিট', hint: 'Plain', defaultVisible: true }
    ];

    selectedColumnKeys: string[] = this.columnCatalog.filter((c) => c.defaultVisible).map((c) => c.key);

    /** Legacy column key → LongStayReportFieldRegistry FieldKey for the request. */
    private static readonly colKeyToBackend: Record<string, string> = {
        ser: 'ser',
        name: 'personnel',
        rank: 'armyRank',
        durationOfStay: 'durationOfStay',
        serviceId: 'serviceId',
        joiningInRab: 'joiningInRab',
        presentUnit: 'presentUnit',
        postedOutUnit: 'postedOutUnit',
        relieverJoiningDate: 'relieverJoiningDate',
        rmks: 'rmks',
        // Derived Yes/No — needs the reliever ServiceId from the backend.
        relieverYesNo: 'relieverServiceId'
    };
    /** Extra (registry-keyed) columns rendered as formatted dates. */
    private static readonly extraDateKeys = new Set(['postingOrderDate', 'dateOfCommission', 'rabServiceFrom', 'rabServiceTo', 'dob', 'possibleJoiningDate']);
    /** Extra columns that are plain identifiers/text (no BN mirror). */
    private static readonly extraPlainKeys = new Set(['relieverServiceId', 'rabId', 'nameBangla', 'nid', 'bloodGroup', 'mobileNo', 'email', 'postingStatus']);
    draggingColumnKey: string | null = null;

    /** New Posting has its own column selection (joinee columns only). */
    joineeSelectedColumnKeys: string[] = this.joineeColumnCatalog.map((c) => c.key);

    /** Catalog + selected-keys for the CURRENTLY DISPLAYED mode (so the picker
        shows joinee columns in New Posting, long-stay columns otherwise). */
    private get activeColumnCatalog(): typeof this.columnCatalog {
        return this.appliedMode === 'newPosting' ? this.joineeColumnCatalog : this.columnCatalog;
    }
    get activeColumnKeys(): string[] {
        return this.appliedMode === 'newPosting' ? this.joineeSelectedColumnKeys : this.selectedColumnKeys;
    }
    set activeColumnKeys(v: string[]) {
        if (this.appliedMode === 'newPosting') this.joineeSelectedColumnKeys = v;
        else this.selectedColumnKeys = v;
    }

    get columnPickerOptions(): { label: string; value: string }[] {
        return this.activeColumnCatalog.map((c) => ({ label: this.lang === 'bn' ? c.labelBN : c.labelEN, value: c.key }));
    }
    get visibleColumns(): typeof this.columnCatalog {
        const map = new Map(this.activeColumnCatalog.map((c) => [c.key, c]));
        return this.activeColumnKeys.map((k) => map.get(k)).filter((c): c is (typeof this.columnCatalog)[number] => c != null);
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
        const arr = [...this.activeColumnKeys];
        const fromIdx = arr.indexOf(sourceKey);
        const toIdx = arr.indexOf(targetKey);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        this.activeColumnKeys = arr;
    }
    onColumnDragEnd(): void {
        this.draggingColumnKey = null;
    }
    removeColumn(key: string): void {
        this.activeColumnKeys = this.activeColumnKeys.filter((k) => k !== key);
    }
    /** Picker selection changed. Long-stay modes need a reload (the backend only
        returns the requested columns); New Posting already has every joinee field,
        so show/hide is purely client-side — no refetch. */
    onColumnsChange(): void {
        if (this.searched && this.appliedMode !== 'newPosting') this.loadPage();
    }

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private joineeService: PermanentPostingJoineeDetailService
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

        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => {
                this.accessibleScope = scope ?? null;
            },
            error: () => {
                /* silent */
            }
        });

        this.loadMotherOrgs();
        this.loadMemberTypes();
        this.loadRabUnits();
        // Do not auto-run; the list loads only after the user clicks Search.
    }

    private loadMotherOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs: MotherOrganizationModel[]) => {
                this.orgOptions = (orgs || []).map((o) => ({
                    label: o.orgNameEN || String(o.orgId),
                    labelBn: o.orgNameBN || o.orgNameEN || String(o.orgId),
                    value: o.orgId
                }));
            },
            error: () => (this.orgOptions = [])
        });
    }
    private mapCodes(codes: CommonCodeModel[]): { label: string; labelBn: string; value: number }[] {
        return (codes || []).map((c) => ({
            label: c.codeValueEN || String(c.codeId),
            labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
            value: c.codeId
        }));
    }
    private loadMemberTypes(): void {
        this.commonCodeService.getAccessibleMemberTypes().subscribe({
            next: (codes: CommonCodeModel[]) => (this.memberTypeOptions = this.mapCodes(codes)),
            error: () => (this.memberTypeOptions = [])
        });
    }
    private loadRabUnits(): void {
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (codes: CommonCodeModel[]) => (this.rabUnitOptions = this.mapCodes(codes)),
            error: () => (this.rabUnitOptions = [])
        });
    }
    /** Dedupe CommonCode rows by codeId, preserving first-seen order. */
    private dedupeByCodeId(rows: CommonCodeModel[]): CommonCodeModel[] {
        const byId = new Map<number, CommonCodeModel>();
        for (const r of rows || []) if (!byId.has(r.codeId)) byId.set(r.codeId, r);
        return Array.from(byId.values());
    }

    /** Mother Org changed → reload its org-scoped Ranks and Corps; reset Trade. */
    onOrgChange(): void {
        this.selectedRankId = null;
        this.rankOptions = [];
        this.allRanksForOrg = [];
        this.selectedCorpsIds = [];
        this.corpsOptions = [];
        this.selectedTradeIds = [];
        this.tradeOptions = [];
        if (!this.selectedOrgIds.length) return;
        forkJoin(this.selectedOrgIds.map((orgId) => this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank'))).subscribe({
            next: (results: CommonCodeModel[][]) => {
                this.allRanksForOrg = this.dedupeByCodeId(results.flat());
                this.applyRankMemberTypeFilter();
            },
            error: () => {
                this.allRanksForOrg = [];
                this.rankOptions = [];
            }
        });
        forkJoin(this.selectedOrgIds.map((orgId) => this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps'))).subscribe({
            next: (results: CommonCodeModel[][]) => {
                this.corpsOptions = this.mapCodes(this.dedupeByCodeId(results.flat()));
            },
            error: () => (this.corpsOptions = [])
        });
    }

    /** Member Type changed → re-filter the org-scoped ranks by parentCodeId. */
    onMemberTypeChange(): void {
        this.applyRankMemberTypeFilter();
    }

    /** Rank = org-scoped MotherOrgRank rows whose parentCodeId is a selected Member Type. */
    private applyRankMemberTypeFilter(): void {
        let rows = this.allRanksForOrg;
        if (this.selectedMemberTypeIds.length) rows = rows.filter((r) => r.parentCodeId != null && this.selectedMemberTypeIds.includes(r.parentCodeId));
        this.rankOptions = this.mapCodes(rows);
        if (this.selectedRankId != null && !this.rankOptions.some((o) => o.value === this.selectedRankId)) this.selectedRankId = null;
    }

    /** Corps changed → reload Trades (children of the selected Corps rows). */
    onCorpsChange(): void {
        this.selectedTradeIds = [];
        this.tradeOptions = [];
        if (!this.selectedCorpsIds.length) return;
        forkJoin(this.selectedCorpsIds.map((corpsId) => this.commonCodeService.getAllActiveCommonCodesByParentId(corpsId))).subscribe({
            next: (results: CommonCodeModel[][]) => {
                this.tradeOptions = this.mapCodes(this.dedupeByCodeId(results.flat()));
            },
            error: () => (this.tradeOptions = [])
        });
    }

    onFilterChange(): void {}
    /** Report Type changed — no immediate effect on the displayed table; results
        (columns/data) only change on Search via appliedMode. */
    onModeChange(): void {}

    /** Show the derived "Reliever (Yes/No)" column only when Stand Release is the
        applied (searched) mode. Called from search() after appliedMode is set. */
    private syncStandReleaseColumn(): void {
        const key = 'relieverYesNo';
        if (this.appliedMode === 'standRelease') {
            if (!this.selectedColumnKeys.includes(key)) {
                const arr = [...this.selectedColumnKeys];
                const at = arr.indexOf('relieverJoiningDate');
                arr.splice(at >= 0 ? at : arr.length, 0, key);
                this.selectedColumnKeys = arr;
            }
        } else {
            this.selectedColumnKeys = this.selectedColumnKeys.filter((k) => k !== key);
        }
    }
    private fmtDate(d: Date | null | undefined): string | null {
        if (!d) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    get activeFilterCount(): number {
        let c = 0;
        // Member filters apply to every mode except New Posting (joinee list has none).
        if (this.relieverMode !== 'newPosting') {
            if (this.selectedOrgIds.length > 0) c++;
            if (this.selectedRankId != null) c++;
            if (this.selectedMemberTypeIds.length > 0) c++;
            if (this.selectedCorpsIds.length > 0) c++;
            if (this.selectedTradeIds.length > 0) c++;
            if (this.selectedRabUnitIds.length > 0) c++;
        }
        if (this.relieverMode === 'standRelease' && this.releaseFrom) c++;
        if (this.relieverMode === 'standRelease' && this.releaseTo) c++;
        if (this.relieverMode === 'newPosting' && this.joiningFrom) c++;
        if (this.relieverMode === 'newPosting' && this.joiningTo) c++;
        return c;
    }
    filterSubtitle(): string {
        if (this.activeFilterCount === 0) return this.lang === 'en' ? 'Select fields to search on' : 'খোঁজার জন্য ক্ষেত্র নির্বাচন করুন';
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return this.lang === 'en' ? `${n} filters applied` : `${n} ফিল্টার প্রয়োগকৃত`;
    }

    get criteriaItems(): { label: string; value: string }[] {
        const items: { label: string; value: string }[] = [];
        const multi = (ids: number[], opts: { label: string; labelBn: string; value: number }[], en: string, bn: string) => {
            if (!ids.length) return;
            const names = ids
                .map((id) => opts.find((o) => o.value === id))
                .filter((o): o is (typeof opts)[number] => o != null)
                .map((o) => (this.lang === 'bn' ? o.labelBn : o.label));
            if (names.length) items.push({ label: this.lang === 'en' ? en : bn, value: names.join(', ') });
        };
        if (this.appliedMode !== 'newPosting') {
            multi(this.selectedOrgIds, this.orgOptions, 'Mother Org', 'মাতৃ সংস্থা');
            multi(this.selectedMemberTypeIds, this.memberTypeOptions, 'Member Type', 'সদস্য ধরন');
            if (this.selectedRankId != null) {
                const opt = this.rankOptions.find((o) => o.value === this.selectedRankId);
                const lbl = this.lang === 'en' ? 'Rank' : 'পদবী';
                if (opt) items.push({ label: lbl, value: this.lang === 'bn' ? opt.labelBn : opt.label });
            }
            multi(this.selectedCorpsIds, this.corpsOptions, 'Corps', 'কোর');
            multi(this.selectedTradeIds, this.tradeOptions, 'Trade', 'ট্রেড');
            multi(this.selectedRabUnitIds, this.rabUnitOptions, 'RAB Unit', 'র‍্যাব ইউনিট');
        }
        if (this.appliedMode === 'standRelease') {
            if (this.releaseFrom) items.push({ label: this.lang === 'en' ? 'Possible Release From' : 'সম্ভাব্য রিলিজ হইতে', value: this.formatDateLabel(this.fmtDate(this.releaseFrom)!) });
            if (this.releaseTo) items.push({ label: this.lang === 'en' ? 'Possible Release To' : 'সম্ভাব্য রিলিজ পর্যন্ত', value: this.formatDateLabel(this.fmtDate(this.releaseTo)!) });
        }
        if (this.appliedMode === 'newPosting') {
            if (this.joiningFrom) items.push({ label: this.lang === 'en' ? 'Possible Joining From' : 'সম্ভাব্য যোগদান হইতে', value: this.formatDateLabel(this.fmtDate(this.joiningFrom)!) });
            if (this.joiningTo) items.push({ label: this.lang === 'en' ? 'Possible Joining To' : 'সম্ভাব্য যোগদান পর্যন্ত', value: this.formatDateLabel(this.fmtDate(this.joiningTo)!) });
        }
        return items;
    }
    private buildFilterLines(): string[] {
        return this.criteriaItems.map((it) => `${it.label}: ${it.value}`);
    }

    clearFilters(): void {
        this.selectedOrgIds = [];
        this.selectedRankId = null;
        this.rankOptions = [];
        this.allRanksForOrg = [];
        this.selectedMemberTypeIds = [];
        this.selectedCorpsIds = [];
        this.corpsOptions = [];
        this.selectedTradeIds = [];
        this.tradeOptions = [];
        this.selectedRabUnitIds = [];
        this.releaseFrom = null;
        this.releaseTo = null;
        this.joiningFrom = null;
        this.joiningTo = null;
        this.first = 0;
    }
    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    search(): void {
        this.first = 0;
        this.searched = true;
        // Lock the displayed mode to what was searched (so the table doesn't
        // change when the Report Type dropdown changes before the next Search).
        this.appliedMode = this.relieverMode;
        this.syncStandReleaseColumn();
        this.appliedFilterLines = this.buildFilterLines();
        this.loadPage();
    }
    onPage(event: { first?: number; rows?: number }): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.loadPage();
    }

    private loadPage(): void {
        // New Posting mode draws from the joinee-detail list (one row per joinee),
        // exactly like the posting/new-joining-person-list page.
        if (this.appliedMode === 'newPosting') {
            this.loadNewPostingPage();
            return;
        }

        this.loading = true;
        const pageNo = Math.floor(this.first / this.rows) + 1;

        const criteria: DynamicReportCriterion[] = [];
        if (this.selectedOrgIds.length > 0) criteria.push({ fieldKey: 'motherOrganization', idValues: this.selectedOrgIds });
        if (this.selectedRankId != null && this.selectedRankId > 0) criteria.push({ fieldKey: 'armyRank', idValue: this.selectedRankId });
        if (this.selectedMemberTypeIds.length > 0) criteria.push({ fieldKey: 'memberType', idValues: this.selectedMemberTypeIds });
        if (this.selectedCorpsIds.length > 0) criteria.push({ fieldKey: 'corps', idValues: this.selectedCorpsIds });
        if (this.selectedTradeIds.length > 0) criteria.push({ fieldKey: 'trade', idValues: this.selectedTradeIds });
        // RAB Unit applies to all (long-stay) modes. New Posting is handled by
        // loadNewPostingPage() above, so relieverMode is never 'newPosting' here.
        if (this.selectedRabUnitIds.length > 0) criteria.push({ fieldKey: 'rabUnit', idValues: this.selectedRabUnitIds });
        if (this.appliedMode === 'standRelease') {
            const rFrom = this.fmtDate(this.releaseFrom);
            const rTo = this.fmtDate(this.releaseTo);
            if (rFrom || rTo) criteria.push({ fieldKey: 'possibleReleaseDate', dateFrom: rFrom, dateTo: rTo });
        }

        // Map column keys → registry FieldKeys; always include joiningInRab so
        // the client-computed Duration of Stay has a source even if its column
        // is hidden.
        const columns = Array.from(new Set([...this.selectedColumnKeys.map((k) => ReportStayAfterRelieverJoinedComponent.colKeyToBackend[k] ?? k), 'joiningInRab']));

        this.reportService
            .runDynamicLongStayReport({
                columns,
                criteria,
                postingStatusFilter: 'Servings',
                relieverJoinedOnly: this.appliedMode === 'joined',
                relieverNotJoinedOnly: this.appliedMode === 'notJoined',
                postedOutAllOnly: this.appliedMode === 'standRelease',
                pagination: { page_no: pageNo, row_per_page: this.rows }
            })
            .subscribe({
                next: (res) => {
                    const startSer = (pageNo - 1) * this.rows + 1;
                    this.list = (res.datalist ?? []).map((d, i) => this.adaptDynamicRow(d, startSer + i));
                    this.totalRecords = res.pages?.Rows ?? res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    console.error(err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load nominal roll.' });
                    this.loading = false;
                }
            });
    }

    /** New Posting Person mode — same data as posting/new-joining-person-list
        (pending joinee-detail rows, filtered by Possible Joining Date). */
    private loadNewPostingPage(): void {
        this.loading = true;
        const pageNo = Math.floor(this.first / this.rows) + 1;
        this.joineeService
            .getPaginatedFiltered({
                pagination: { page_no: pageNo, row_per_page: this.rows },
                filter: {
                    isAddedInNewJoineeDataEntry: false,
                    possibleJoiningDateFrom: this.fmtDate(this.joiningFrom),
                    possibleJoiningDateTo: this.fmtDate(this.joiningTo)
                }
            })
            .subscribe({
                next: (res: any) => {
                    const startSer = (pageNo - 1) * this.rows + 1;
                    this.list = (res?.datalist ?? []).map((d: any, i: number) => ({ ...d, ser: startSer + i })) as any;
                    this.totalRecords = res?.pages?.Rows ?? res?.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    console.error(err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load new posting persons.' });
                    this.loading = false;
                }
            });
    }

    /** Cell resolver for the fixed joinee-list columns (newPosting mode). */
    private joineeCellValue(row: any, key: string): string {
        switch (key) {
            // New joinee (incoming person).
            case 'serviceId': {
                const id = row.serviceId ?? '';
                if (!id) return '—';
                const pre = row.prefixName ? `${row.prefixName}-` : '';
                return `${pre}${this.displayNum(id)}`;
            }
            case 'rank':
                return this.codeValue(row.rankName, row.rankNameBN);
            case 'corps':
                return this.codeValue(row.corpsName, row.corpsNameBN);
            case 'trade':
                return this.codeValue(row.tradeName, row.tradeNameBN);
            case 'name':
                return row.nameBangla?.trim() ? row.nameBangla : '—';
            case 'motherOrg':
                return this.codeValue(row.motherOrgName, row.motherOrgNameBN);
            case 'motherOrgUnit':
                return this.codeValue(row.motherOrgUnitName, row.motherOrgUnitNameBN);
            // "Replace" = the posted-out person being replaced.
            case 'isReplace':
                return row.postedOutEmployeeId != null ? (this.lang === 'en' ? 'Yes' : 'হ্যাঁ') : this.lang === 'en' ? 'No' : 'না';
            case 'replaceId':
                return this.displayNum(row.postedOutServiceId);
            case 'replaceRank':
                return this.codeValue(row.postedOutRank, row.postedOutRankBN);
            case 'replaceName':
                return this.codeValue(row.postedOutNameEN, row.postedOutNameBN);
            case 'rabUnit':
                return this.codeValue(row.postedOutRabUnit, row.postedOutRabUnitBN);
            // (kept for completeness if added back to the catalog)
            case 'memberType':
                return this.codeValue(row.memberTypeName, row.memberTypeNameBN);
            case 'joiningOrderNo':
                return row.joiningOrderNo ?? '—';
            case 'joiningOrderDate':
                return this.formatDateLabel(row.joiningOrderDate);
            case 'possibleJoiningDate':
                return this.formatDateLabel(row.possibleJoiningDate);
            default:
                return '';
        }
    }

    get reportTitle(): string {
        if (this.appliedMode === 'newPosting') {
            return this.lang === 'en' ? 'New Posting Person Report' : 'নতুন পোস্টিং ব্যক্তির প্রতিবেদন';
        }
        if (this.appliedMode === 'standRelease') {
            return this.lang === 'en' ? 'Nominal Roll of Stand Release' : 'স্ট্যান্ড রিলিজ এর নামীয় তালিকা';
        }
        if (this.appliedMode === 'notJoined') {
            return this.lang === 'en' ? 'Nominal Roll of Stay in RAB though Reliever Not Joined' : 'প্রতিস্থাপক যোগদান না করা সত্ত্বেও র‍্যাবে অবস্থানরত সদস্যের নামীয় তালিকা';
        }
        return this.lang === 'en' ? 'Nominal Roll of Stay in RAB after Reliever Joined' : 'প্রতিস্থাপক যোগদানের পর র‍্যাবে অবস্থানরত সদস্যের নামীয় তালিকা';
    }

    // ── RAB paper getters ─────────────────────────────────────────────
    get rabOverlineText(): string {
        return this.lang === 'bn' ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার' : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH";
    }
    get rabOrgTitle(): string {
        return this.lang === 'bn' ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION';
    }
    get rabOrgSubtitle(): string {
        return this.lang === 'bn' ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা' : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka';
    }
    get rabSectionTitle(): string {
        return this.reportTitle;
    }
    get rabCriteriaTitle(): string {
        return this.lang === 'bn' ? 'নির্বাচন মানদণ্ড' : 'SELECTION CRITERIA';
    }
    get rabGeneratedLabel(): string {
        return this.lang === 'bn' ? 'তারিখ' : 'GENERATED';
    }
    get rabFormattedDate(): string {
        const now = new Date();
        return this.lang === 'bn' ? now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    }
    get rabConfidentialLabel(): string {
        return this.lang === 'bn' ? 'গোপনীয়' : 'CONFIDENTIAL';
    }
    get rabWarningLabel(): string {
        return this.lang === 'bn' ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED';
    }
    get rabPageOfLabel(): string {
        return this.lang === 'bn' ? 'পৃষ্ঠা ১ / ১' : 'PAGE 1 OF 1';
    }
    /** Total DB-filtered result count, localized (shown in the criteria strip,
        so it appears on screen + Print + Word + Excel). */
    get rabTotalText(): string {
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.totalRecords)) : String(this.totalRecords);
        return this.lang === 'bn' ? `মোট · ${n} রেকর্ড` : `Total · ${n} records`;
    }

    paddedSer(n: number | string | null | undefined): string {
        const s = n == null ? '' : String(n);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s.padStart(2, '0')) : s.padStart(2, '0');
    }
    personnelMetaText(_row: StayAfterRelieverJoinedReportRow): string {
        // Name column shows the name only — Service ID and Rank already have
        // their own columns, so the meta sub-line is intentionally empty.
        return '';
    }
    cellValue(row: StayAfterRelieverJoinedReportRow, key: string): string {
        if (this.appliedMode === 'newPosting') return this.joineeCellValue(row as any, key);
        switch (key) {
            case 'serviceId':
                return this.displayNum(row.serviceId);
            case 'rank':
                return this.codeValue(row.rank, row.rankBN);
            case 'name':
                return this.codeValue(row.name, row.nameBN);
            case 'joiningInRab':
                return this.formatDateLabel(row.joiningInRab);
            case 'durationOfStay':
                return this.formatDuration(this.computeDurationString(row.joiningInRab));
            case 'presentUnit':
                return this.codeValue(row.presentUnit, row.presentUnitBN);
            case 'postedOutUnit':
                return this.codeValue(row.postedOutUnit, row.postedOutUnitBN);
            case 'relieverJoiningDate':
                return this.formatDateLabel(row.relieverJoiningDate);
            case 'relieverYesNo': {
                const has = !!(row as any).relieverServiceId;
                return this.lang === 'en' ? (has ? 'Yes' : 'No') : has ? 'হ্যাঁ' : 'না';
            }
            case 'rmks':
                return row.rmks ?? '';
            default:
                return this.extraCellValue(row, key);
        }
    }

    /** Total RAB tenure as a "Yy Mm" string (mirrors backend FormatYearsMonths),
        computed from joiningInRab. Empty when joiningInRab is missing. */
    private computeDurationString(joining: string | null | undefined): string {
        if (!joining) return '';
        const f = new Date(joining);
        if (isNaN(f.getTime())) return '';
        const today = new Date();
        let years = today.getFullYear() - f.getFullYear();
        let months = today.getMonth() - f.getMonth();
        if (today.getDate() < f.getDate()) months--;
        if (months < 0) {
            years--;
            months += 12;
        }
        if (years < 0) {
            years = 0;
            months = 0;
        }
        return `${years}y ${months}m`;
    }

    /** Resolve an opt-in (registry-keyed) column from the spread property bag. */
    private extraCellValue(row: StayAfterRelieverJoinedReportRow, key: string): string {
        const anyRow = row as any;
        if (ReportStayAfterRelieverJoinedComponent.extraDateKeys.has(key)) return this.formatDateLabel(anyRow[key]);
        if (ReportStayAfterRelieverJoinedComponent.extraPlainKeys.has(key)) return this.displayNum(anyRow[key]);
        return this.codeValue(anyRow[key], anyRow[key + 'BN']);
    }

    /** Translate a dynamic-backend property bag into the legacy row shape. */
    private adaptDynamicRow(d: DynamicReportRow, ser: number): StayAfterRelieverJoinedReportRow {
        return {
            ...d,
            ser,
            serviceId: d['serviceId'] as string,
            name: d['nameEnglish'] as string,
            nameBN: d['nameBangla'] as string,
            rank: d['armyRank'] as string,
            rankBN: d['armyRankBN'] as string,
            joiningInRab: d['joiningInRab'] as string,
            presentUnit: d['presentUnit'] as string,
            presentUnitBN: d['presentUnitBN'] as string,
            postedOutUnit: d['postedOutUnit'] as string,
            postedOutUnitBN: d['postedOutUnitBN'] as string,
            relieverServiceId: d['relieverServiceId'] as string,
            relieverJoiningDate: d['relieverJoiningDate'] as string,
            durationOfStay: null,
            rmks: null
        } as StayAfterRelieverJoinedReportRow;
    }

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
        if (type === 'word') await this.exportRabWord();
        else this.exportRabExcel();
    }

    private async exportRabWord(): Promise<void> {
        const isBn = this.lang === 'bn';
        const bnFont = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const sans = isBn ? (bnFont as any) : 'Calibri';
        const serif = isBn ? (bnFont as any) : 'Cambria';
        const mono = isBn ? (bnFont as any) : 'Consolas';
        const bnRunExtras = (size: number) => (isBn ? { language: bnLang, sizeComplexScript: size } : {});
        const wsafe = (s: string | null | undefined): string => s ?? '';
        const S = { overline: 15, title: 44, subtitle: 20, sectionTitle: 26, sectionSub: 20, stripLabel: 16, stripDate: 16, critLabel: 14, critValue: 20, tableHeader: 14, name: 20, meta: 14, body: 16, footer: 13 };
        const C = { black: '0B0B0B', mutedText: '555555', gray: '6B6B6B', labelGray: '8A8A8A', zebra: 'FAFAF6', border: 'BFBFBF', innerBorder: 'D9D9D9' };
        const innerCellBorder = {
            top: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder },
            left: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder },
            right: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }
        };
        const headerCellBorder = {
            top: { style: BorderStyle.SINGLE, size: 8, color: C.black },
            bottom: { style: BorderStyle.SINGLE, size: 8, color: C.black },
            left: { style: BorderStyle.SINGLE, size: 4, color: C.border },
            right: { style: BorderStyle.SINGLE, size: 4, color: C.border }
        };
        const headerPars: Paragraph[] = [];
        headerPars.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 80 },
                children: [new TextRun({ text: wsafe(this.rabOverlineText), font: sans, size: S.overline, ...bnRunExtras(S.overline), color: C.mutedText, characterSpacing: isBn ? 0 : 60, allCaps: !isBn })]
            })
        );
        headerPars.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [new TextRun({ text: wsafe(this.rabOrgTitle), font: serif, size: S.title, ...bnRunExtras(S.title), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24 })]
            })
        );
        headerPars.push(
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabOrgSubtitle), font: serif, size: S.subtitle, ...bnRunExtras(S.subtitle), italics: true, color: C.mutedText })] })
        );
        headerPars.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [new TextRun({ text: wsafe(this.rabSectionTitle), font: serif, size: S.sectionTitle, ...bnRunExtras(S.sectionTitle), bold: true, color: C.black, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })]
            })
        );
        const colsPerCritRow = 4;
        const critCellPct = 100 / colsPerCritRow;
        const stripCell = (runs: TextRun[], alignment: typeof AlignmentType.LEFT | typeof AlignmentType.RIGHT) =>
            new TableCell({
                columnSpan: 2,
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: C.border },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border },
                    left: { style: BorderStyle.SINGLE, size: 4, color: C.border },
                    right: { style: BorderStyle.SINGLE, size: 4, color: C.border }
                },
                margins: { top: 80, bottom: 80, left: 140, right: 140 },
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ alignment, children: runs })]
            });
        const stripRow = new TableRow({
            cantSplit: true,
            children: [
                stripCell([new TextRun({ text: wsafe(this.rabCriteriaTitle), font: sans, size: S.stripLabel, ...bnRunExtras(S.stripLabel), bold: true, color: C.black, characterSpacing: isBn ? 0 : 40, allCaps: !isBn })], AlignmentType.LEFT),
                stripCell(
                    [
                        new TextRun({ text: wsafe(this.rabTotalText), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn }),
                        new TextRun({ text: wsafe(`${this.rabGeneratedLabel} · ${this.rabFormattedDate}`), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.mutedText, characterSpacing: isBn ? 0 : 30, allCaps: !isBn, break: 1 })
                    ],
                    AlignmentType.RIGHT
                )
            ]
        });
        const items = this.criteriaItems;
        const critRows: TableRow[] = [stripRow];
        for (let i = 0; i < items.length; i += colsPerCritRow) {
            const cells: TableCell[] = [];
            for (let j = 0; j < colsPerCritRow; j++) {
                const it = items[i + j];
                cells.push(
                    new TableCell({
                        borders: innerCellBorder,
                        margins: { top: 100, bottom: 100, left: 140, right: 140 },
                        width: { size: critCellPct, type: WidthType.PERCENTAGE },
                        children: it
                            ? [
                                  new Paragraph({
                                      spacing: { after: 40 },
                                      children: [new TextRun({ text: wsafe(it.label), font: sans, size: S.critLabel, ...bnRunExtras(S.critLabel), bold: true, color: C.labelGray, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })]
                                  }),
                                  new Paragraph({ children: [new TextRun({ text: wsafe(it.value), font: serif, size: S.critValue, ...bnRunExtras(S.critValue), bold: true, color: C.black })] })
                              ]
                            : [new Paragraph({ children: [new TextRun({ text: ' ', font: sans, size: S.critValue, ...bnRunExtras(S.critValue) })] })]
                    })
                );
            }
            critRows.push(new TableRow({ cantSplit: true, children: cells }));
        }
        const criteriaTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: critRows });
        const visibleCols = this.visibleColumns;
        const headerLabels = visibleCols.map((c) => (this.lang === 'bn' ? c.labelBN : c.labelEN));
        const dataColPct = visibleCols.length > 0 ? 100 / visibleCols.length : 100;
        const headerCells: TableCell[] = headerLabels.map(
            (label) =>
                new TableCell({
                    borders: headerCellBorder,
                    margins: { top: 120, bottom: 120, left: 140, right: 140 },
                    width: { size: dataColPct, type: WidthType.PERCENTAGE },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.LEFT,
                            children: [new TextRun({ text: wsafe(label), font: sans, size: S.tableHeader, ...bnRunExtras(S.tableHeader), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })]
                        })
                    ]
                })
        );
        const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: headerCells });
        const dataRows: TableRow[] = this.list.map((row, idx) => {
            const isEven = idx % 2 === 1;
            const shading = isEven ? { type: 'clear' as const, fill: C.zebra, color: 'auto' } : undefined;
            const cellOpts = { borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, shading };
            const cells: TableCell[] = visibleCols.map((col) => {
                const run = (text: string, opts: { fontKey?: any; sz?: number; bold?: boolean; color?: string; chSp?: number } = {}) =>
                    new TextRun({
                        text: wsafe(text),
                        font: opts.fontKey ?? sans,
                        size: opts.sz ?? S.body,
                        ...bnRunExtras(opts.sz ?? S.body),
                        bold: opts.bold ?? false,
                        color: opts.color ?? C.black,
                        ...(opts.chSp != null ? { characterSpacing: opts.chSp } : {})
                    });
                switch (col.hint) {
                    case 'Serial':
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run(this.paddedSer(idx + 1), { fontKey: mono, sz: S.name, bold: true, color: C.gray, chSp: isBn ? 0 : 8 })] })] });
                    case 'Personnel': {
                        const meta = this.personnelMetaText(row);
                        const children: Paragraph[] = [new Paragraph({ spacing: { after: meta ? 40 : 0 }, children: [run(this.cellValue(row, 'name'), { sz: S.name, bold: true })] })];
                        if (meta) children.push(new Paragraph({ children: [new TextRun({ text: meta, font: mono, size: S.meta, ...bnRunExtras(S.meta), color: C.gray, characterSpacing: isBn ? 0 : 16, allCaps: !isBn })] }));
                        return new TableCell({ ...cellOpts, children });
                    }
                    case 'Date':
                    case 'Duration':
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
        const footerCellBorder = {
            top: { style: BorderStyle.SINGLE, size: 6, color: C.black },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
        };
        const footerCellMargins = { top: 80, bottom: 0, left: 0, right: 0 };
        const footer = new Footer({
            children: [
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    layout: TableLayoutType.FIXED,
                    columnWidths: [3000, 3000, 3000],
                    rows: [
                        new TableRow({
                            cantSplit: true,
                            children: [
                                new TableCell({
                                    borders: footerCellBorder,
                                    margins: footerCellMargins,
                                    children: [
                                        new Paragraph({
                                            alignment: AlignmentType.LEFT,
                                            children: [new TextRun({ text: wsafe(this.rabConfidentialLabel), font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })]
                                        })
                                    ]
                                }),
                                new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ children: [] })] }),
                                new TableCell({
                                    borders: footerCellBorder,
                                    margins: footerCellMargins,
                                    children: [
                                        new Paragraph({
                                            alignment: AlignmentType.RIGHT,
                                            children: [
                                                new TextRun({
                                                    children: [`${isBn ? 'পৃষ্ঠা' : 'PAGE'} `, PageNumber.CURRENT, ` ${isBn ? '/' : 'OF'} `, PageNumber.TOTAL_PAGES],
                                                    font: mono,
                                                    size: S.footer,
                                                    ...bnRunExtras(S.footer),
                                                    bold: true,
                                                    color: C.black,
                                                    characterSpacing: isBn ? 0 : 24,
                                                    allCaps: !isBn
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        })
                    ]
                })
            ]
        });
        const doc = new Document({
            sections: [
                {
                    properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 680, bottom: 1247, left: 680, right: 680 } } },
                    footers: { default: footer },
                    children: [...headerPars, criteriaTable, new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: '', font: sans, size: 4 })] }), dataTable]
                }
            ]
        });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `stay-after-reliever-joined-report_${this.lang}.docx`);
    }

    private exportRabExcel(): void {
        const isBn = this.lang === 'bn';
        const wsafe = (s: string | null | undefined): string => s ?? '';
        const visibleCols = this.visibleColumns;
        const headers: string[] = visibleCols.map((c) => (isBn ? c.labelBN : c.labelEN));
        const totalCols = headers.length || 1;
        const aoa: any[][] = [];
        const pad = (n: number) => Array.from({ length: n }, () => '');
        aoa.push([wsafe(this.rabOverlineText), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgTitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgSubtitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabSectionTitle), ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabCriteriaTitle}  ·  ${this.rabTotalText}  ·  ${this.rabGeneratedLabel}: ${this.rabFormattedDate}`, ...pad(totalCols - 1)]);
        for (const it of this.criteriaItems) aoa.push([`${it.label}: ${it.value}`, ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push(headers);
        for (let i = 0; i < this.list.length; i++) {
            const row = this.list[i];
            const cells = visibleCols.map((col) => {
                switch (col.hint) {
                    case 'Serial':
                        return this.paddedSer(i + 1);
                    case 'Personnel': {
                        const name = this.cellValue(row, 'name');
                        const meta = this.personnelMetaText(row);
                        return meta ? `${name}\n${meta}` : name;
                    }
                    case 'Remarks':
                        return row.rmks || '';
                    case 'Date':
                    case 'Duration':
                    case 'Plain':
                    default:
                        return this.cellValue(row, col.key);
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
        XLSX.writeFile(wb, `stay-after-reliever-joined-report_${this.lang}.xlsx`);
    }

    private openRabPrintWindow(): void {
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) {
            this.messageService.add({ severity: 'warn', summary: 'Popup blocked', detail: 'Allow popups for this site to use Print.', life: 6000 });
            return;
        }
        const html = this.buildRabPrintHtml();
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
            try {
                win.focus();
                win.print();
            } catch {
                /* user can Ctrl+P from the open window */
            }
        }, 700);
    }

    private buildRabPrintHtml(): string {
        const esc = (s: unknown) =>
            String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        const isBn = this.lang === 'bn';
        const serif = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', serif" : "'Playfair Display', Georgia, 'Times New Roman', serif";
        const sans = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', sans-serif" : "'DM Sans', 'Segoe UI', Arial, sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";
        const visibleCols = this.visibleColumns;
        const tableHeaderHtml = `<tr>${visibleCols.map((c) => `<th>${esc(this.lang === 'bn' ? c.labelBN : c.labelEN)}</th>`).join('')}</tr>`;
        const renderCell = (row: StayAfterRelieverJoinedReportRow, col: { key: string; hint: string }, idx: number): string => {
            switch (col.hint) {
                case 'Serial':
                    return `<td class="td-ser"><span class="ser">${esc(this.paddedSer(idx + 1))}</span></td>`;
                case 'Personnel': {
                    const meta = this.personnelMetaText(row);
                    const metaHtml = meta ? `<div class="personnel-meta">${esc(meta)}</div>` : '';
                    return `<td class="td-personnel"><div class="personnel-name">${esc(this.cellValue(row, 'name'))}</div>${metaHtml}</td>`;
                }
                case 'Date':
                case 'Duration':
                    return `<td class="td-date">${esc(this.cellValue(row, col.key))}</td>`;
                case 'Remarks':
                    return `<td class="td-rmks">${esc(row.rmks || '')}</td>`;
                case 'Plain':
                default:
                    return `<td>${esc(this.cellValue(row, col.key))}</td>`;
            }
        };
        const tableBodyHtml = this.list.map((row, i) => `<tr>${visibleCols.map((c) => renderCell(row, c, i)).join('')}</tr>`).join('');
        const items = this.criteriaItems;
        const criteriaGridHtml = items.length ? `<div class="criteria-grid">${items.map((item) => `<div class="cell"><div class="cell-label">${esc(item.label)}</div><div class="cell-value">${esc(item.value)}</div></div>`).join('')}</div>` : '';
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
    .criteria-strip-date { opacity: 0.9; font-weight: 500; display: flex; flex-direction: column; align-items: flex-end; gap: 0.4mm; text-align: right; }
    .criteria-strip-total { color: #b78b3b; font-weight: 700; text-transform: none; letter-spacing: normal; }
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
        <div class="criteria-strip"><span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${esc(this.rabCriteriaTitle)}</span><span class="criteria-strip-date"><span class="criteria-strip-total">${esc(this.rabTotalText)}</span><span class="criteria-strip-gen">${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span></span></div>
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
        } catch {
            return v;
        }
    }
    formatDuration(v: string | null | undefined): string {
        if (!v) return '—';
        const m = /^(\d+)y\s+(\d+)m$/.exec(v.trim());
        if (!m) return v;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        if (this.lang === 'en') {
            const parts: string[] = [];
            if (y > 0) parts.push(`${y} ${y === 1 ? 'year' : 'years'}`);
            parts.push(`${mo} ${mo === 1 ? 'month' : 'months'}`);
            return parts.join(' ');
        }
        const yBn = BanglaNumerals.toBangla(String(y));
        const mBn = BanglaNumerals.toBangla(String(mo));
        return `${yBn} বছর ${mBn} মাস`;
    }
}
