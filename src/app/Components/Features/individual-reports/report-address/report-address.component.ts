import { Component, EventEmitter, HostListener, Input, OnInit, Output, SimpleChanges, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { ReportService } from '@/services/report.service';
import { EmpService } from '@/services/emp-service';
import { FamilyInfoService } from '@/services/family-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { SharedService } from '@/shared/services/shared-service';
import { Router } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { LocationType } from '@/models/enums';
import type {
    ReportAccessibleScope,
    DynamicReportCriterion,
    DynamicReportRow,
} from '@/models/report.model';
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

/**
 * Standalone Address report — one row per (member/family-member × address
 * record). The user searches by RAB ID / Service ID / NID, then chooses an
 * Address Owner scope (Member / Family / both) and whether to include the
 * full address-change history (inactive records) or just the current
 * (Active) address. Mirrors the structure of report-education (sibling under
 * individual-reports): two-step member lookup, Member Details identity card,
 * RAB-letterhead paper + Word/Excel/Print exporters.
 *
 * Data source: empService.getAddressesByEmployeeId() returns ALL address
 * rows for a member — own (FMID = 0, incl. Spouse* location types), family
 * (FMID > 0), Active and inactive. Geographic CommonCode IDs are resolved to
 * names client-side via CommonCodeService (no flat lookup API exists, so we
 * cascade per unique parent id and cache).
 */
type AddressReportRow = {
    ser?: number;
    // Owner / classification
    ownerScope: 'member' | 'family';
    fmid: number;
    owner: string;
    ownerBN: string;
    relationId: number | null;
    relation: string | null;
    relationBN: string | null;
    locationTypeRaw: string;
    isActive: boolean;
    lastUpdated: string | null;
    // Geographic (resolved names — shaped to satisfy the address helpers)
    division: string | null;
    divisionBN: string | null;
    district: string | null;
    districtBN: string | null;
    upazila: string | null;
    upazilaBN: string | null;
    postOffice: string | null;
    postOfficeBN: string | null;
    address: string | null;   // House/Road + Village (EN)
    addressBN: string | null; // House/Road + Village (BN)
    postCode: string | null;
    [extra: string]: unknown;
};

/** Lightweight code-lookup entry. */
interface CodeName { en: string | null; bn: string | null; }

@Component({
    selector: 'app-report-address-individual',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        SelectModule,
        MultiSelectModule,
        PaginatorModule,
        InputTextModule,
        DialogModule,
        Toast,
    ],
    providers: [MessageService],
    templateUrl: './report-address.component.html',
    styleUrls: ['../../employee-reports/report-theme.scss', '../../employee-reports/report-card-mtr.scss', './report-address.component.scss'],
})
export class ReportAddressIndividualComponent implements OnInit, OnChanges {
    L = REPORT_LABELS;
    @Input() lang: ReportLang = 'en';
    @Output() langToggle = new EventEmitter<void>();

    // ── Filter state ──────────────────────────────────────────────────
    searchRabId = '';
    searchServiceId = '';
    searchNid = '';

    /** Address Owner scope: which records to keep. */
    ownerScopeOptions: { label: string; labelBn: string; value: 'member' | 'family' | 'both' }[] = [
        { label: 'Member',          labelBn: 'সদস্য',            value: 'member' },
        { label: 'Family',          labelBn: 'পরিবার',           value: 'family' },
        { label: 'Member & Family', labelBn: 'সদস্য ও পরিবার',   value: 'both' },
    ];
    selectedOwnerScope: 'member' | 'family' | 'both' = 'member';

    /** History mode: 'active' = current address only; 'history' = include
        all (inactive) records too. */
    historyOptions: { label: string; labelBn: string; value: 'active' | 'history' }[] = [
        { label: 'Without Change History',       labelBn: 'পরিবর্তনের ইতিহাস ছাড়া',     value: 'active' },
        { label: 'With Address Change History',  labelBn: 'ঠিকানা পরিবর্তনের ইতিহাসসহ', value: 'history' },
    ];
    selectedHistory: 'active' | 'history' = 'active';

    /** Relation-type filter — only meaningful (and only shown) when the
        Address Owner scope is "Family". `null` = all relations. Options are
        derived from the family members actually present for this member. */
    selectedRelationType: number | null = null;

    /** True when the relation-type filter should be visible. */
    get showRelationFilter(): boolean {
        return this.selectedOwnerScope === 'family';
    }

    /** Relation options derived from the fetched family address rows
        (unique relationId → name), prefixed with an "All" sentinel. */
    get relationTypeOptions(): { label: string; value: number | null }[] {
        const seen = new Map<number, string>();
        for (const r of this.allRows) {
            if (r.ownerScope !== 'family' || r.relationId == null) continue;
            if (!seen.has(r.relationId)) {
                seen.set(r.relationId, this.lang === 'bn' ? (r.relationBN || r.relation || '') : (r.relation || r.relationBN || ''));
            }
        }
        const opts: { label: string; value: number | null }[] = [
            { label: this.lang === 'bn' ? 'সকল সম্পর্ক' : 'All Relations', value: null },
        ];
        for (const [id, name] of seen) opts.push({ label: name || `#${id}`, value: id });
        return opts;
    }

    /** Raw shaped rows for the matched member — kept across re-filters so the
        owner/history selectors apply without a re-fetch. */
    private allRows: AddressReportRow[] = [];

    /** Matched member's identity (for the Member Details card). */
    private memberInfo: DynamicReportRow | null = null;

    list: AddressReportRow[] = [];
    loading = false;
    first = 0;
    rows = 20;
    rowsPerPageOptions = [20, 50, 100];
    totalRecords = 0;
    searched = false;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    accessibleScope: ReportAccessibleScope | null = null;
    get orgScopeRestricted(): boolean {
        return this.accessibleScope?.orgScopeRestricted === true;
    }

    showAccessDeniedDialog = false;
    accessDeniedMessage = 'You do not have permission to view this employee. Either they are outside your accessible scope or no longer presently serving.';

    showNotFoundDialog = false;
    notFoundMessage = 'No member found with the given RAB ID / Service ID / NID.';

    showPickerDialog = false;
    pickerRows: Array<{ employeeId: number; displayName: string; orgName: string; status: string; }> = [];
    private pickerLookupRows: DynamicReportRow[] = [];

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    // ── Column picker ──────────────────────────────────────────────────
    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: string; defaultVisible: boolean }[] = [
        { key: 'ser',          labelEN: 'Ser',           labelBN: 'ক্রঃ',          hint: 'Serial',           defaultVisible: true  },
        // owner + relation are auto-managed by the Address Owner selector
        // (hidden for Member, shown for Family / Member & Family).
        { key: 'owner',        labelEN: 'Address Owner', labelBN: 'ঠিকানার মালিক', hint: 'Plain',            defaultVisible: false },
        { key: 'relation',     labelEN: 'Relation',      labelBN: 'সম্পর্ক',       hint: 'Plain',            defaultVisible: false },
        { key: 'locationType', labelEN: 'Address Type',  labelBN: 'ঠিকানার ধরন',   hint: 'LocationType',     defaultVisible: true  },
        { key: 'address',      labelEN: 'Address',       labelBN: 'ঠিকানা',        hint: 'AddressComposite', defaultVisible: true  },
        // Opt-in extras
        { key: 'status',       labelEN: 'Status',        labelBN: 'অবস্থা',        hint: 'Status',           defaultVisible: false },
        { key: 'postCode',     labelEN: 'Post Code',     labelBN: 'পোস্ট কোড',     hint: 'Plain',            defaultVisible: false },
        { key: 'lastUpdated',  labelEN: 'Last Updated in System', labelBN: 'সিস্টেমে সর্বশেষ হালনাগাদ', hint: 'PlainDate', defaultVisible: false },
    ];

    private static readonly plainColumnPropertyMap: Record<string, { en: string; bn?: string }> = {
        owner:      { en: 'owner',      bn: 'ownerBN' },
        relation:   { en: 'relation',   bn: 'relationBN' },
        postCode:   { en: 'postCode' },
        lastUpdated:{ en: 'lastUpdated' },
    };

    plainCellValue(row: AddressReportRow, key: string): string {
        const map = ReportAddressIndividualComponent.plainColumnPropertyMap[key];
        if (!map) return '-';
        const en = (row as any)[map.en] as string | null | undefined;
        const bn = map.bn ? (row as any)[map.bn] as string | null | undefined : undefined;
        return this.codeValue(en, bn);
    }

    plainDateCellValue(row: AddressReportRow, key: string): string {
        const map = ReportAddressIndividualComponent.plainColumnPropertyMap[key];
        if (!map) return '-';
        const v = (row as any)[map.en] as string | null | undefined;
        return this.formatDate(v);
    }

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

    private toggleColumn(key: string, visible: boolean): void {
        const has = this.selectedColumnKeys.includes(key);
        if (visible && !has) {
            // Insert at the position that matches the catalog order so an
            // auto-added column lands where it belongs instead of at the end.
            const order = this.columnCatalog.map(c => c.key);
            const target = order.indexOf(key);
            const next = [...this.selectedColumnKeys];
            let insertAt = next.length;
            for (let i = 0; i < next.length; i++) {
                if (order.indexOf(next[i]) > target) { insertAt = i; break; }
            }
            next.splice(insertAt, 0, key);
            this.selectedColumnKeys = next;
        } else if (!visible && has) {
            this.selectedColumnKeys = this.selectedColumnKeys.filter(k => k !== key);
        }
    }

    paddedSer(n: number | string | null | undefined): string {
        const s = n == null ? '' : String(n);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s.padStart(2, '0')) : s.padStart(2, '0');
    }

    // ── Member Details card ────────────────────────────────────────────
    get employeeInfoItems(): { label: string; value: string }[] {
        const d = this.memberInfo;
        if (!d) return [];
        const isBn = this.lang === 'bn';
        const Lx = (en: string, bn: string) => isBn ? bn : en;
        return [
            { label: Lx('Name',        'নাম'),          value: this.codeValue(d['nameEnglish'] as string, d['nameBangla'] as string) },
            { label: Lx('Rank',        'র‍্যাঙ্ক'),      value: this.codeValue(d['armyRank'] as string, d['armyRankBN'] as string) },
            { label: Lx('Corps',       'কোর'),           value: this.codeValue(d['corps'] as string, d['corpsBN'] as string) },
            { label: Lx('Trade',       'ট্রেড'),         value: this.codeValue(d['trade'] as string, d['tradeBN'] as string) },
            { label: Lx('Mother Org',  'মাতৃ সংস্থা'),    value: this.codeValue(d['motherOrganization'] as string, d['motherOrganizationBN'] as string) },
            { label: Lx('RAB Unit',    'র‍্যাব ইউনিট'),  value: this.codeValue(d['rabUnit'] as string, d['rabUnitBN'] as string) },
            { label: Lx('Service ID',  'সার্ভিস আইডি'),  value: this.displayNum(d['serviceId'] as string) },
            { label: Lx('RAB ID',      'র‍্যাব আইডি'),    value: d['rabId'] ? this.displayNum(d['rabId'] as string) : '-' },
        ];
    }

    get employeeInfoCardTitle(): string {
        return this.lang === 'bn' ? 'সদস্যের তথ্য' : 'MEMBER DETAILS';
    }

    get memberFoundNoAddresses(): boolean {
        return this.searched && !this.loading && this.list.length === 0
            && this.memberInfo != null && !this.orgScopeRestricted;
    }

    get noAddressesMessage(): string {
        return this.lang === 'bn'
            ? 'এই সদস্যের কোনো ঠিকানা রেকর্ড নেই।'
            : 'No address records found for this member.';
    }

    get noMatchMessage(): string {
        return this.lang === 'bn' ? 'কোনো মিল পাওয়া যায়নি।' : 'No matching record found.';
    }

    // ── RAB paper getters ─────────────────────────────────────────────
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
    get rabSectionTitle(): string { return this.lang === 'bn' ? 'ঠিকানা প্রতিবেদন' : 'ADDRESS REPORT'; }
    get rabSubtitleText(): string { return ''; }
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

    constructor(
        private reportService: ReportService,
        private empService: EmpService,
        private familyInfoService: FamilyInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private sharedService: SharedService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {}

    private isMemberTypeAllowed(memberTypeId: number | null | undefined): boolean {
        if (memberTypeId == null) return true;
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) return true;
        const allowed = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (allowed === null) return true;
        return allowed.includes(memberTypeId as number);
    }

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    get reportTitle(): string { return this.rabSectionTitle; }

    get dateLine(): string {
        const now = new Date();
        if (this.lang === 'en') return now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        return now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    buildFilterLines(): string[] {
        const lines: string[] = [];
        if (this.searchRabId.trim())     lines.push(`RAB ID: ${this.searchRabId.trim()}`);
        if (this.searchServiceId.trim()) lines.push(`Service ID: ${this.searchServiceId.trim()}`);
        if (this.searchNid.trim())       lines.push(`NID: ${this.searchNid.trim()}`);
        return lines;
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (!this.list?.length) return;
        if (type === 'print') { this.openRabPrintWindow(); return; }
        if (type === 'word') { await this.exportRabWord(); }
        else { this.exportRabExcel(); }
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['lang']) {
            this.appliedFilterLines = this.buildFilterLines();
        }
    }

    filterOpen = true;

    get activeFilterCount(): number {
        let c = 0;
        if (this.searchRabId.trim()) c++;
        if (this.searchServiceId.trim()) c++;
        if (this.searchNid.trim()) c++;
        return c;
    }

    toggleFilter(): void { this.filterOpen = !this.filterOpen; }

    filterSubtitle(): string {
        if (this.activeFilterCount === 0) return 'Enter RAB ID, Service ID or NID to begin';
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' active filter(s)';
    }

    clearFilters(): void {
        this.searchRabId = '';
        this.searchServiceId = '';
        this.searchNid = '';
        this.first = 0;
    }

    /** Owner / history selectors re-filter the already-fetched rows — no re-fetch.
        Owner & Relation columns are redundant when the scope is "Member"
        (every row is the member's own), so they auto-hide there and auto-show
        for Family / Member & Family. Status auto-shows with the history view. */
    onScopeChange(): void {
        const familyInScope = this.selectedOwnerScope !== 'member';
        this.toggleColumn('owner', familyInScope);
        this.toggleColumn('relation', familyInScope);
        this.toggleColumn('status', this.selectedHistory === 'history');
        // Relation-type filter only applies in Family scope — clear it when
        // the scope changes so a stale relation doesn't silently filter rows.
        if (!this.showRelationFilter) this.selectedRelationType = null;
        this.applyFiltersToRows();
    }

    onRelationTypeChange(): void {
        this.applyFiltersToRows();
    }

    onPage(event: { first?: number; rows?: number }): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
    }

    load(): void {
        if (!this.searchRabId.trim() && !this.searchServiceId.trim() && !this.searchNid.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Search', detail: 'Enter RAB ID, Service ID or NID.' });
            return;
        }
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();

        const lookupCriteria: DynamicReportCriterion[] = [];
        if (this.searchRabId.trim())     lookupCriteria.push({ fieldKey: 'rabId',     textValue: this.searchRabId.trim() });
        if (this.searchServiceId.trim()) lookupCriteria.push({ fieldKey: 'serviceId', textValue: this.searchServiceId.trim() });
        if (this.searchNid.trim())       lookupCriteria.push({ fieldKey: 'nid',       textValue: this.searchNid.trim() });

        const lookupColumns = [
            'rabId', 'serviceId', 'nameEnglish', 'nameBangla',
            'armyRank', 'corps', 'trade', 'motherOrganization', 'rabUnit',
            'prefix', 'postingStatus',
        ];

        this.reportService.runDynamicEmployeeBaseReport({
            columns: lookupColumns,
            criteria: lookupCriteria,
            pagination: { page_no: 1, row_per_page: 100 },
        }).subscribe({
            next: (lookup) => {
                this.searched = true;
                this.accessibleScope = lookup.accessibleScope ? {
                    rabUnitNames: null,
                    rabUnitNamesBN: null,
                    memberTypeNames: null,
                    memberTypeNamesBN: null,
                    orgScopeRestricted: lookup.accessibleScope.orgScopeRestricted,
                } as ReportAccessibleScope : null;

                const employees = (lookup.datalist ?? []) as Array<DynamicReportRow>;

                if (employees.length === 0) {
                    this.resetResults();
                    this.loading = false;
                    const unrestrictedHasMatches = (lookup.accessibleScope as any)?.unrestrictedHasMatches === true;
                    if (unrestrictedHasMatches) this.showAccessDeniedDialog = true;
                    else this.showNotFoundDialog = true;
                    return;
                }

                const allowed = employees.filter((d) => this.isMemberTypeAllowed(d['memberTypeId'] as number | null | undefined));

                if (allowed.length === 0) {
                    this.resetResults();
                    this.loading = false;
                    this.showAccessDeniedDialog = true;
                    return;
                }

                if (allowed.length === 1) {
                    this.fetchAddressesForEmployee(allowed[0]['employeeId'] as number, allowed[0]);
                    return;
                }

                this.loading = false;
                this.openPickerForCandidates(allowed);
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to look up member' });
                this.loading = false;
            },
        });
    }

    private resetResults(): void {
        this.allRows = [];
        this.list = [];
        this.memberInfo = null;
        this.totalRecords = 0;
    }

    /** Step 2: fetch + resolve addresses for the picked employee. */
    private fetchAddressesForEmployee(employeeId: number, lookupRow: DynamicReportRow): void {
        this.loading = true;
        this.first = 0;
        this.memberInfo = lookupRow;

        forkJoin({
            addresses: this.empService.getAddressesByEmployeeId(employeeId),
            family: this.familyInfoService.getByEmployeeId(employeeId),
            relations: this.commonCodeService.getAllActiveCommonCodesType('Relationship'),
            divisions: this.commonCodeService.getAllActiveCommonCodesType('Division'),
        }).subscribe({
            next: ({ addresses, family, relations, divisions }) => {
                const addrList = addresses ?? [];

                // Unique parent ids at each geographic level (taken straight
                // from the address rows — every row carries the full chain).
                const divIds = this.uniqueIds(addrList, ['divisionType', 'DivisionType']);
                const distIds = this.uniqueIds(addrList, ['districtType', 'DistrictType']);
                const upaIds  = this.uniqueIds(addrList, ['thanaType', 'ThanaType']);

                forkJoin({
                    districts:   divIds.length  ? forkJoin(divIds.map(id => this.commonCodeService.getAllActiveCommonCodesByParentId(id)))  : of([] as any[]),
                    upazilas:    distIds.length ? forkJoin(distIds.map(id => this.commonCodeService.getAllActiveCommonCodesByParentId(id))) : of([] as any[]),
                    postOffices: upaIds.length  ? forkJoin(upaIds.map(id => this.commonCodeService.getAllActiveCommonCodesByParentId(id)))  : of([] as any[]),
                }).subscribe({
                    next: ({ districts, upazilas, postOffices }) => {
                        const divMap = this.buildCodeMap(divisions);
                        const distMap = this.buildCodeMap(([] as any[]).concat(...(districts ?? [])));
                        const upaMap = this.buildCodeMap(([] as any[]).concat(...(upazilas ?? [])));
                        const poMap = this.buildCodeMap(([] as any[]).concat(...(postOffices ?? [])));
                        const relMap = this.buildCodeMap(relations);
                        const familyMap = this.buildFamilyMap(family ?? [], relMap);

                        this.allRows = addrList.map((addr) =>
                            this.shapeRow(addr, divMap, distMap, upaMap, poMap, familyMap));
                        this.applyFiltersToRows();
                        this.loading = false;
                    },
                    error: (err) => {
                        console.error(err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to resolve address locations' });
                        this.loading = false;
                    },
                });
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load addresses' });
                this.loading = false;
            },
        });
    }

    /** Apply the owner-scope + history filters and re-sort/re-serialize. */
    private applyFiltersToRows(): void {
        let rows = this.allRows;
        if (this.selectedOwnerScope !== 'both') {
            rows = rows.filter(r => r.ownerScope === this.selectedOwnerScope);
        }
        if (this.selectedHistory === 'active') {
            rows = rows.filter(r => r.isActive);
        }
        if (this.showRelationFilter && this.selectedRelationType != null) {
            rows = rows.filter(r => r.relationId === this.selectedRelationType);
        }

        // Group by (ownerScope, fmid, locationType); active first, then
        // last-updated desc within each group.
        const sorted = [...rows].sort((a, b) => {
            if (a.ownerScope !== b.ownerScope) return a.ownerScope === 'member' ? -1 : 1;
            if (a.fmid !== b.fmid) return a.fmid - b.fmid;
            if (a.locationTypeRaw !== b.locationTypeRaw) return a.locationTypeRaw.localeCompare(b.locationTypeRaw);
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return this.timeOf(b.lastUpdated) - this.timeOf(a.lastUpdated);
        });

        sorted.forEach((r, i) => { r.ser = i + 1; });
        this.list = sorted;
        this.totalRecords = sorted.length;
        this.first = 0;
    }

    private timeOf(v: string | null): number {
        if (!v) return 0;
        const t = new Date(v).getTime();
        return isNaN(t) ? 0 : t;
    }

    // ── Shaping helpers ────────────────────────────────────────────────
    private get<T = any>(obj: any, keys: string[]): T | undefined {
        for (const k of keys) {
            if (obj[k] != null && obj[k] !== '') return obj[k] as T;
        }
        return undefined;
    }

    private uniqueIds(rows: any[], keys: string[]): number[] {
        const set = new Set<number>();
        for (const r of rows) {
            const v = this.get<number>(r, keys);
            if (v != null) set.add(Number(v));
        }
        return [...set];
    }

    private buildCodeMap(codes: any[]): Map<number, CodeName> {
        const map = new Map<number, CodeName>();
        for (const c of codes ?? []) {
            const id = c.codeId ?? c.CodeId;
            if (id == null) continue;
            map.set(Number(id), {
                en: c.codeValueEN ?? c.displayCodeValueEN ?? c.CodeValueEN ?? null,
                bn: c.codeValueBN ?? c.displayCodeValueBN ?? c.CodeValueBN ?? null,
            });
        }
        return map;
    }

    /** fmid → { name EN/BN, relation id + EN/BN } for FMID > 0 family rows. */
    private buildFamilyMap(family: any[], relMap: Map<number, CodeName>): Map<number, { en: string | null; bn: string | null; relId: number | null; relEn: string | null; relBn: string | null }> {
        const map = new Map<number, { en: string | null; bn: string | null; relId: number | null; relEn: string | null; relBn: string | null }>();
        for (const m of family ?? []) {
            const fmid = m.FMID ?? m.fmid;
            if (fmid == null) continue;
            const relId = m.Relation ?? m.relation;
            const relIdNum = relId != null ? Number(relId) : null;
            const rel = relIdNum != null ? relMap.get(relIdNum) : undefined;
            map.set(Number(fmid), {
                en: m.NameEN ?? m.nameEN ?? null,
                bn: m.NameBN ?? m.nameBN ?? null,
                relId: relIdNum,
                relEn: rel?.en ?? null,
                relBn: rel?.bn ?? null,
            });
        }
        return map;
    }

    private nameFromMap(map: Map<number, CodeName>, id: number | undefined): CodeName {
        if (id == null) return { en: null, bn: null };
        return map.get(Number(id)) ?? { en: null, bn: null };
    }

    private shapeRow(
        addr: any,
        divMap: Map<number, CodeName>,
        distMap: Map<number, CodeName>,
        upaMap: Map<number, CodeName>,
        poMap: Map<number, CodeName>,
        familyMap: Map<number, { en: string | null; bn: string | null; relId: number | null; relEn: string | null; relBn: string | null }>,
    ): AddressReportRow {
        const fmid = Number(this.get<number>(addr, ['fmid', 'FMID']) ?? 0);
        const locationTypeRaw = String(this.get<string>(addr, ['locationType', 'LocationType']) ?? '');
        const isActive = addr.active !== false && addr.Active !== false;
        const lastUpdated = (this.get<string>(addr, ['lastupdate', 'Lastupdate', 'lastUpdate', 'createdDate', 'CreatedDate']) as string) ?? null;

        const div = this.nameFromMap(divMap, this.get<number>(addr, ['divisionType', 'DivisionType']));
        const dist = this.nameFromMap(distMap, this.get<number>(addr, ['districtType', 'DistrictType']));
        const upa = this.nameFromMap(upaMap, this.get<number>(addr, ['thanaType', 'ThanaType']));
        const po = this.nameFromMap(poMap, this.get<number>(addr, ['postOfficeType', 'PostOfficeType']));

        const houseRoad = (this.get<string>(addr, ['houseRoad', 'HouseRoad']) as string) ?? '';
        const villageEN = (this.get<string>(addr, ['addressAreaEN', 'AddressAreaEN']) as string) ?? '';
        const villageBN = (this.get<string>(addr, ['addressAreaBN', 'AddressAreaBN']) as string) ?? '';
        const detailEN = [houseRoad, villageEN].filter(Boolean).join(', ');
        const detailBN = [houseRoad, villageBN].filter(Boolean).join(', ');

        // Owner label
        let ownerScope: 'member' | 'family' = 'member';
        let owner: string;
        let ownerBN: string;
        let relationId: number | null = null;
        let relation: string | null = null;
        let relationBN: string | null = null;
        if (fmid > 0) {
            ownerScope = 'family';
            const fm = familyMap.get(fmid);
            owner = fm?.en || `Family Member #${fmid}`;
            ownerBN = fm?.bn || owner;
            relationId = fm?.relId ?? null;
            relation = fm?.relEn ?? null;
            relationBN = fm?.relBn ?? null;
        } else {
            const isSpouse = locationTypeRaw.toLowerCase().includes('spouse');
            owner = isSpouse ? 'Self (Spouse)' : 'Self (Member)';
            ownerBN = isSpouse ? 'নিজ (স্ত্রী/স্বামী)' : 'নিজ (সদস্য)';
            relation = isSpouse ? 'Spouse' : 'Self';
            relationBN = isSpouse ? 'স্ত্রী/স্বামী' : 'নিজ';
        }

        return {
            ownerScope,
            fmid,
            owner,
            ownerBN,
            relationId,
            relation,
            relationBN,
            locationTypeRaw,
            isActive,
            lastUpdated,
            division: div.en, divisionBN: div.bn,
            district: dist.en, districtBN: dist.bn,
            upazila: upa.en, upazilaBN: upa.bn,
            postOffice: po.en, postOfficeBN: po.bn,
            address: detailEN || null,
            addressBN: detailBN || null,
            postCode: (this.get<string>(addr, ['postCode', 'PostCode']) as string) ?? null,
        };
    }

    // ── Cell renderers ─────────────────────────────────────────────────
    /** Localized Location Type label. */
    displayLocationType(raw: string | null | undefined): string {
        const s = (raw ?? '').toString();
        const bn = this.lang === 'bn';
        switch (s) {
            case LocationType.Permanent:      return bn ? 'স্থায়ী ঠিকানা' : 'Permanent';
            case LocationType.Present:        return bn ? 'বর্তমান ঠিকানা' : 'Present';
            case LocationType.SpousePermanent:return bn ? 'স্ত্রী/স্বামীর স্থায়ী ঠিকানা' : 'Spouse Permanent';
            case LocationType.SpousePresent:  return bn ? 'স্ত্রী/স্বামীর বর্তমান ঠিকানা' : 'Spouse Present';
            default: return s || '-';
        }
    }

    displayStatus(row: AddressReportRow): string {
        const bn = this.lang === 'bn';
        return row.isActive ? (bn ? 'সক্রিয়' : 'Active') : (bn ? 'পূর্ববর্তী' : 'Previous');
    }

    /** Geographic crumbs — labelled Division/District/Upazila. */
    addressCrumbParts(row: AddressReportRow): { label: string; value: string }[] {
        const bn = this.lang === 'bn';
        const parts = [
            { label: bn ? 'বিভাগ' : 'Division', value: this.codeValue(row.division, row.divisionBN) },
            { label: bn ? 'জেলা' : 'District', value: this.codeValue(row.district, row.districtBN) },
            { label: bn ? 'উপজেলা' : 'Upazila', value: this.codeValue(row.upazila, row.upazilaBN) },
        ];
        return parts.filter(p => p.value && p.value !== '-');
    }

    /** "P.O. Bishnapur - 3413 · Holding 54, Kholla" — second address line.
        Post Code is appended to the Post Office so it always shows alongside
        the address, even when the Post Code column isn't picked separately. */
    addressDetail(row: AddressReportRow): string {
        const po = this.codeValue(row.postOffice, row.postOfficeBN);
        const detail = this.codeValue(row.address, row.addressBN);
        const code = row.postCode && row.postCode.toString().trim() !== '' ? this.displayNum(row.postCode) : '';
        const parts: string[] = [];
        if (po && po !== '-') {
            const poLabel = this.lang === 'bn' ? `ডাকঘর ${po}` : `P.O. ${po}`;
            parts.push(code ? (this.lang === 'bn' ? `${poLabel} (পোস্ট কোড - ${code})` : `${poLabel} (P.Code - ${code})`) : poLabel);
        } else if (code) {
            parts.push(this.lang === 'bn' ? `পোস্ট কোড - ${code}` : `P.Code - ${code}`);
        }
        if (detail && detail !== '-') parts.push(detail);
        return parts.join(' · ');
    }

    /** Flatten any column to one text value (exports + print). */
    private cellText(row: AddressReportRow, col: { key: string; hint: string }): string {
        switch (col.hint) {
            case 'Serial':       return this.paddedSer(row.ser);
            case 'LocationType': return this.displayLocationType(row.locationTypeRaw);
            case 'Status':       return this.displayStatus(row);
            case 'AddressComposite': {
                const crumbs = this.addressCrumbParts(row).map(p => `${p.label}: ${p.value}`).join(' › ');
                const detail = this.addressDetail(row);
                if (crumbs && detail) return `${crumbs} · ${detail}`;
                return crumbs || detail || '-';
            }
            case 'PlainDate':    return this.plainDateCellValue(row, col.key);
            case 'Plain':
            default:             return this.plainCellValue(row, col.key);
        }
    }

    private openPickerForCandidates(candidates: DynamicReportRow[]): void {
        const sansEmptyDash = (s: string) => (!s || s === '-' || s === '—' ? '' : s);
        this.pickerRows = candidates.map((d) => {
            const prefix    = sansEmptyDash(this.codeValue(d['prefix'] as string, d['prefixBN'] as string));
            const serviceId = d['serviceId'] ? this.displayNum(d['serviceId'] as string) : '';
            const rank      = sansEmptyDash(this.codeValue(d['armyRank'] as string, d['armyRankBN'] as string));
            const name      = this.codeValue(d['nameEnglish'] as string, d['nameBangla'] as string);
            const parts: string[] = [];
            if (prefix && serviceId) parts.push(`${prefix}-${serviceId}`);
            else if (prefix)         parts.push(prefix);
            else if (serviceId)      parts.push(serviceId);
            if (rank) parts.push(rank);
            if (name) parts.push(name);
            return {
                employeeId: d['employeeId'] as number,
                displayName: parts.join(' '),
                orgName:     this.codeValue(d['motherOrganization'] as string, d['motherOrganizationBN'] as string),
                status:      this.formatPostingStatus(d['postingStatus']),
            };
        });
        this.showPickerDialog = true;
        this.pickerLookupRows = candidates;
    }

    pickerSelect(employeeId: number): void {
        const lookupRow = this.pickerLookupRows.find((d) => d['employeeId'] === employeeId);
        this.showPickerDialog = false;
        this.pickerRows = [];
        if (lookupRow) this.fetchAddressesForEmployee(employeeId, lookupRow);
    }

    pickerClose(): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.pickerLookupRows = [];
        this.resetResults();
    }

    private static readonly statusDisplayMap: Record<string, { en: string; bn: string }> = {
        Servings:          { en: 'Serving',             bn: 'কর্মরত' },
        Serving:           { en: 'Serving',             bn: 'কর্মরত' },
        ExMember:          { en: 'Ex-Member',           bn: 'সাবেক সদস্য' },
        Pending:           { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' },
        PendingForJoining: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' },
        Supernumerary:     { en: 'Supernumerary',       bn: 'সুপারনিউমারারি' },
    };

    private formatPostingStatus(raw: unknown): string {
        const s = (raw ?? '').toString().trim();
        if (!s) return '-';
        const mapped = ReportAddressIndividualComponent.statusDisplayMap[s];
        if (mapped) return this.lang === 'bn' ? mapped.bn : mapped.en;
        return s;
    }

    formatDate(v: string | null | undefined): string {
        if (v == null || v === '') return '-';
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

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        const v = enVal ?? bnVal;
        return v != null && v.toString().trim() !== '' ? v : '-';
    }

    // ──────────────────────────────────────────────────────────────────
    // EXPORTERS — same shape as report-education.
    // ──────────────────────────────────────────────────────────────────

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

        const headerPars: Paragraph[] = [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: wsafe(this.rabOverlineText), font: sans, size: S.overline, ...bnRunExtras(S.overline), color: C.mutedText, characterSpacing: isBn ? 0 : 60, allCaps: !isBn })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: wsafe(this.rabOrgTitle), font: serif, size: S.title, ...bnRunExtras(S.title), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabOrgSubtitle), font: serif, size: S.subtitle, ...bnRunExtras(S.subtitle), italics: true, color: C.mutedText })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabSectionTitle), font: serif, size: S.sectionTitle, ...bnRunExtras(S.sectionTitle), bold: true, color: C.black, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }),
        ];

        const colsPerCritRow = 4;
        const critCellPct = 100 / colsPerCritRow;
        const stripCell = (runs: TextRun[], alignment: typeof AlignmentType.LEFT | typeof AlignmentType.RIGHT) =>
            new TableCell({ columnSpan: 2, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border }, left: { style: BorderStyle.SINGLE, size: 4, color: C.border }, right: { style: BorderStyle.SINGLE, size: 4, color: C.border } }, margins: { top: 80, bottom: 80, left: 140, right: 140 }, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment, children: runs })] });
        const stripRow = new TableRow({ cantSplit: true, children: [
            stripCell([new TextRun({ text: wsafe(this.employeeInfoCardTitle), font: sans, size: S.stripLabel, ...bnRunExtras(S.stripLabel), bold: true, color: C.black, characterSpacing: isBn ? 0 : 40, allCaps: !isBn })], AlignmentType.LEFT),
            stripCell([new TextRun({ text: wsafe(`${this.rabGeneratedLabel} · ${this.rabFormattedDate}`), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.mutedText, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })], AlignmentType.RIGHT),
        ] });
        const items = this.employeeInfoItems;
        const critRows: TableRow[] = [stripRow];
        for (let i = 0; i < items.length; i += colsPerCritRow) {
            const cells: TableCell[] = [];
            for (let j = 0; j < colsPerCritRow; j++) {
                const it = items[i + j];
                cells.push(new TableCell({
                    borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: critCellPct, type: WidthType.PERCENTAGE },
                    children: it ? [
                        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: wsafe(it.label), font: sans, size: S.critLabel, ...bnRunExtras(S.critLabel), bold: true, color: C.labelGray, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }),
                        new Paragraph({ children: [new TextRun({ text: wsafe(it.value), font: serif, size: S.critValue, ...bnRunExtras(S.critValue), bold: true, color: C.black })] }),
                    ] : [new Paragraph({ children: [new TextRun({ text: ' ', font: sans, size: S.critValue, ...bnRunExtras(S.critValue) })] })],
                }));
            }
            critRows.push(new TableRow({ cantSplit: true, children: cells }));
        }
        const criteriaTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: critRows });

        const visibleCols = this.visibleColumns;
        const headerLabels = visibleCols.map(c => this.lang === 'bn' ? c.labelBN : c.labelEN);
        const dataColPct = visibleCols.length > 0 ? (100 / visibleCols.length) : 100;
        const headerCells: TableCell[] = headerLabels.map(label => new TableCell({
            borders: headerCellBorder, margins: { top: 120, bottom: 120, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: wsafe(label), font: sans, size: S.tableHeader, ...bnRunExtras(S.tableHeader), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })] })],
        }));
        const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: headerCells });

        const dataRows: TableRow[] = this.list.map((row, idx) => {
            const isEven = idx % 2 === 1;
            const shading = isEven ? { type: 'clear' as const, fill: C.zebra, color: 'auto' } : undefined;
            const cellOpts = { borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, shading };
            const cells: TableCell[] = visibleCols.map(col => {
                const isSerial = col.hint === 'Serial';
                const isMono = col.hint === 'Serial' || col.hint === 'PlainDate';
                const run = new TextRun({ text: wsafe(this.cellText(row, col)), font: isMono ? mono : sans, size: isSerial ? S.name : S.body, ...bnRunExtras(isSerial ? S.name : S.body), bold: isSerial, color: isSerial ? C.gray : C.black, ...(isBn ? {} : { characterSpacing: isSerial ? 8 : 0 }) });
                return new TableCell({ ...cellOpts, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run] })] });
            });
            return new TableRow({ cantSplit: true, children: cells });
        });
        const dataTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: [headerRow, ...dataRows] });

        const footerCellBorder = { top: { style: BorderStyle.SINGLE, size: 6, color: C.black }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
        const footerCellMargins = { top: 80, bottom: 0, left: 0, right: 0 };
        const footer = new Footer({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3000, 3000, 3000], rows: [new TableRow({ cantSplit: true, children: [
            new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: wsafe(this.rabConfidentialLabel), font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })] })] }),
            new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ children: [] })] }),
            new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${isBn ? 'পৃষ্ঠা' : 'PAGE'} `, PageNumber.CURRENT, ` ${isBn ? '/' : 'OF'} `, PageNumber.TOTAL_PAGES], font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24, allCaps: !isBn })] })] }),
        ] })] })] });

        const doc = new Document({
            sections: [{
                properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 680, bottom: 1247, left: 680, right: 680 } } },
                footers: { default: footer },
                children: [...headerPars, criteriaTable, new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: '', font: sans, size: 4 })] }), dataTable],
            }],
        });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `address-report_${this.lang}.docx`);
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
        aoa.push([`${this.employeeInfoCardTitle}  ·  ${this.rabGeneratedLabel}: ${this.rabFormattedDate}`, ...pad(totalCols - 1)]);
        for (const it of this.employeeInfoItems) aoa.push([`${it.label}: ${it.value}`, ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push(headers);
        for (let i = 0; i < this.list.length; i++) {
            const row = this.list[i];
            aoa.push(visibleCols.map(col => this.cellText(row, col)));
        }
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabConfidentialLabel}  ·  ${this.rabWarningLabel}`, ...pad(totalCols - 1)]);

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = ws['!merges'] ?? [];
        const titleRows = [0, 1, 2, 3, 5];
        for (const r of titleRows) ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
        const lastRow = aoa.length - 1;
        ws['!merges'].push({ s: { r: lastRow, c: 0 }, e: { r: lastRow, c: totalCols - 1 } });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isBn ? 'প্রতিবেদন' : 'Report');
        XLSX.writeFile(wb, `address-report_${this.lang}.xlsx`);
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
            try { win.focus(); win.print(); }
            catch { /* user can still Ctrl+P from the open window */ }
        }, 700);
    }

    private buildRabPrintHtml(): string {
        const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const isBn = this.lang === 'bn';
        const serif = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', serif" : "'Playfair Display', Georgia, 'Times New Roman', serif";
        const sans = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', sans-serif" : "'DM Sans', 'Segoe UI', Arial, sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const visibleCols = this.visibleColumns;
        const tableHeaderHtml = `<tr>${visibleCols.map(c => `<th>${esc(this.lang === 'bn' ? c.labelBN : c.labelEN)}</th>`).join('')}</tr>`;

        const renderCell = (row: AddressReportRow, col: { key: string; hint: string }): string => {
            switch (col.hint) {
                case 'Serial':
                    return `<td class="td-ser"><span class="ser">${esc(this.paddedSer(row.ser))}</span></td>`;
                case 'LocationType':
                    return `<td class="td-loctype"><span class="loc-text">${esc(this.displayLocationType(row.locationTypeRaw).toUpperCase())}</span></td>`;
                case 'Status':
                    return `<td class="td-status">${esc(this.displayStatus(row))}</td>`;
                case 'AddressComposite': {
                    const crumbs = this.addressCrumbParts(row);
                    const detail = this.addressDetail(row);
                    const crumbHtml = crumbs
                        .map((p, i) => `<span class="addr-part"><span class="addr-label">${esc(p.label)}:</span> <span class="addr-value">${esc(p.value)}</span></span>` + (i < crumbs.length - 1 ? '<span class="addr-sep">&rsaquo;</span>' : ''))
                        .join(' ');
                    return `<td class="td-address"><div class="addr-crumb">${crumbHtml}</div>${detail ? `<div class="addr-detail">${esc(detail)}</div>` : ''}</td>`;
                }
                case 'PlainDate':
                    return `<td class="td-date">${esc(this.plainDateCellValue(row, col.key))}</td>`;
                case 'Plain':
                default:
                    return `<td>${esc(this.plainCellValue(row, col.key))}</td>`;
            }
        };

        const tableBodyHtml = this.list.map((row) => `<tr>${visibleCols.map(c => renderCell(row, c)).join('')}</tr>`).join('');
        const items = this.employeeInfoItems;
        const criteriaGridHtml = items.length ? `<div class="criteria-grid">${items.map(item => `
                <div class="cell">
                    <div class="cell-label">${esc(item.label)}</div>
                    <div class="cell-value">${esc(item.value)}</div>
                </div>`).join('')}</div>` : '';
        const confidential = this.rabConfidentialLabel;
        const warning = this.rabWarningLabel;
        const pageWord = isBn ? 'পৃষ্ঠা' : 'PAGE';
        const ofWord = isBn ? '/' : 'OF';
        const cssStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        return `<!DOCTYPE html>
<html lang="${isBn ? 'bn' : 'en'}">
<head><meta charset="UTF-8" /><title>${esc(this.rabSectionTitle)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
    @counter-style bn-digits { system: numeric; symbols: '\\09E6' '\\09E7' '\\09E8' '\\09E9' '\\09EA' '\\09EB' '\\09EC' '\\09ED' '\\09EE' '\\09EF'; }
    @page {
        margin: 12mm 5mm 22mm 5mm;
        @bottom-left {
            content: "● " "${cssStr(confidential)}";
            font-family: ${mono}; font-size: 6.5pt; font-weight: 600;
            letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a;
            padding: 5mm 0 0 8mm;
            background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5));
            background-position: 8mm 1.5mm; background-size: calc(100% - 8mm) 0.7mm;
            background-repeat: no-repeat; vertical-align: top;
            ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''}
        }
        @bottom-center {
            content: "${cssStr(pageWord)} " counter(page${isBn ? ', bn-digits' : ''}) " ${cssStr(ofWord)} " counter(pages${isBn ? ', bn-digits' : ''});
            font-family: ${mono}; font-size: 6.5pt; font-weight: 600;
            letter-spacing: 0.25em; text-transform: uppercase; color: #4a4a4a;
            padding-top: 5mm;
            background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5));
            background-position: 0 1.5mm; background-size: 100% 0.7mm;
            background-repeat: no-repeat; vertical-align: top;
            ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''}
        }
        @bottom-right {
            content: "${cssStr(warning)}";
            font-family: ${mono}; font-size: 6.5pt; font-weight: 600;
            letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a;
            padding: 5mm 8mm 0 0;
            background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5));
            background-position: 0 1.5mm; background-size: calc(100% - 8mm) 0.7mm;
            background-repeat: no-repeat; vertical-align: top;
            ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''}
        }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0b0b0b; font-family: ${sans}; font-size: 10pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .paper { padding: 4mm 8mm; }
    .paper-head { text-align: center; margin-bottom: 6mm; }
    .overline { font-size: 7.5pt; letter-spacing: 0.3em; color: #555; text-transform: uppercase; margin-bottom: 3mm; font-weight: 500; ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';font-size:9pt;' : ''} }
    .paper-title { font-family: ${serif}; font-weight: 700; font-size: 22pt; margin: 0 0 2mm 0; letter-spacing: 0.12em; color: #0b0b0b; ${isBn ? 'letter-spacing:0;' : ''} }
    .paper-sub { font-family: ${serif}; font-style: italic; color: #555; font-size: 10pt; margin-bottom: 4mm; }
    .orn-divider { display: flex; align-items: center; justify-content: center; gap: 4mm; margin: 3mm auto 4mm; max-width: 60%; }
    .orn-line { flex: 1; height: 0.25mm; background: linear-gradient(to right, transparent, #b78b3b 30%, #b78b3b 70%, transparent); }
    .orn-diamond { color: #b78b3b; font-size: 9pt; line-height: 1; }
    .paper-section { font-family: ${serif}; font-size: 13pt; font-weight: 700; letter-spacing: 0.16em; color: #0b0b0b; margin: 0 0 1mm 0; text-transform: uppercase; ${isBn ? 'letter-spacing:0;' : ''} }
    .criteria { margin: 5mm 0 6mm; border: 1px solid #d8d6d0; border-radius: 1mm; overflow: hidden; }
    .criteria-strip { display: flex; justify-content: space-between; align-items: center; padding: 1.5mm 3mm; background: #f4f4f2; border-bottom: 1px solid #d8d6d0; font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase; color: #4a4a4a; font-weight: 600; }
    .criteria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr)); }
    .cell { padding: 2mm 3mm; border-right: 1px solid #e6e4de; border-top: 1px solid #e6e4de; }
    .cell-label { font-size: 7pt; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 1mm; font-weight: 600; }
    .cell-value { font-family: ${serif}; font-size: 10pt; font-weight: 700; color: #0b0b0b; line-height: 1.2; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; font-family: ${sans}; font-size: 8pt; }
    thead { display: table-header-group; }
    thead th { background: #0b0b0b; color: #d9c79a; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; padding: 1.8mm 2mm; text-align: left; white-space: nowrap; border: 1px solid rgba(11,11,11,0.05); }
    tbody td { padding: 2mm 2mm; font-size: 8pt; color: #0b0b0b; border: 1px solid rgba(11,11,11,0.05); vertical-align: top; background: #fff; word-break: break-word; }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }
    .td-ser { white-space: nowrap; }
    .ser { font-family: ${mono}; font-size: 9pt; font-weight: 600; color: #6b6b6b; letter-spacing: 0.04em; }
    .td-date { font-family: ${mono}; letter-spacing: 0.02em; white-space: nowrap; }
    .td-status { font-family: ${sans}; font-weight: 600; font-size: 9pt; white-space: nowrap; }
    .loc-text { font-family: ${mono}; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.08em; color: #0b0b0b; ${isBn ? 'letter-spacing:0;font-family:' + sans + ';' : ''} }
    .addr-crumb { display: flex; flex-wrap: wrap; align-items: baseline; gap: 1mm 1.5mm; line-height: 1.25; }
    .addr-part { display: inline-flex; align-items: baseline; gap: 1mm; }
    .addr-label { font-family: ${mono}; font-size: 7pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8a8a; ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';' : ''} }
    .addr-value { font-weight: 600; color: #0b0b0b; }
    .addr-sep { color: #b78b3b; font-weight: 700; font-size: 11pt; line-height: 1; }
    .addr-detail { margin-top: 0.8mm; font-size: 8pt; color: #6b6b6b; font-style: italic; line-height: 1.3; }
</style></head>
<body>
    <div class="paper">
        <header class="paper-head">
            <div class="overline">${esc(this.rabOverlineText)}</div>
            <h1 class="paper-title">${esc(this.rabOrgTitle)}</h1>
            <div class="paper-sub"><em>${esc(this.rabOrgSubtitle)}</em></div>
            <div class="orn-divider"><span class="orn-line"></span><span class="orn-diamond">&#9670;</span><span class="orn-line"></span></div>
            <h2 class="paper-section">${esc(this.rabSectionTitle)}</h2>
        </header>
        <div class="criteria">
            <div class="criteria-strip">
                <span>${esc(this.employeeInfoCardTitle)}</span>
                <span>${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span>
            </div>
            ${criteriaGridHtml}
        </div>
        <table><thead>${tableHeaderHtml}</thead><tbody>${tableBodyHtml}</tbody></table>
    </div>
</body></html>`;
    }
}
