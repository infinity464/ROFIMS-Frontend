import { Component, EventEmitter, HostListener, Input, OnInit, Output, SimpleChanges, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ReportService } from '@/services/report.service';
import { LeaveInfoService } from '@/services/leave-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { SharedService } from '@/shared/services/shared-service';
import { Router } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { CodeType } from '@/models/enums';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    ReportAccessibleScope,
    DynamicReportCriterion,
    DynamicReportRow,
} from '@/models/report.model';
import {
    AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, PageOrientation,
    Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

/**
 * Standalone "Leave Information" report — one row per leave record for the
 * searched member. The entity stores a LeaveType CodeId, so the report
 * resolves it to a name via CommonCode ('LeaveType') and computes the
 * inclusive day count. Mirrors the structure of report-promotion.
 */
type LeaveReportRow = {
    ser?: number;
    leaveType: string | null; leaveTypeBN: string | null;
    fromDate: string | null;
    toDate: string | null;
    auth: string | null;
    remarks: string | null;
    [extra: string]: unknown;
};

interface CodeName { en: string | null; bn: string | null; }

@Component({
    selector: 'app-report-leave-individual',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, MultiSelectModule, PaginatorModule, InputTextModule, DatePickerModule, DialogModule, Toast],
    providers: [MessageService],
    templateUrl: './report-leave.component.html',
    styleUrls: ['../../employee-reports/report-theme.scss', '../../employee-reports/report-card-mtr.scss', './report-leave.component.scss'],
})
export class ReportLeaveIndividualComponent implements OnInit, OnChanges {
    L = REPORT_LABELS;
    @Input() lang: ReportLang = 'en';
    @Output() langToggle = new EventEmitter<void>();

    searchRabId = '';
    searchServiceId = '';
    searchNid = '';

    /** Date-range filter (applied client-side over the fetched rows). */
    dateFrom: Date | null = null;
    dateTo: Date | null = null;

    list: LeaveReportRow[] = [];
    private allRows: LeaveReportRow[] = [];
    private memberInfo: DynamicReportRow | null = null;
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
    get orgScopeRestricted(): boolean { return this.accessibleScope?.orgScopeRestricted === true; }

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

    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: string; defaultVisible: boolean }[] = [
        { key: 'ser',       labelEN: 'Ser',         labelBN: 'ক্রঃ',         hint: 'Serial', defaultVisible: true  },
        { key: 'leaveType', labelEN: 'Leave Type',  labelBN: 'ছুটির ধরন',    hint: 'Plain',  defaultVisible: true  },
        { key: 'period',    labelEN: 'Leave Period',labelBN: 'ছুটির মেয়াদ', hint: 'Period', defaultVisible: true  },
        { key: 'days',      labelEN: 'Days',        labelBN: 'দিন',          hint: 'Days',   defaultVisible: true  },
        // Opt-in extras
        { key: 'auth',      labelEN: 'Authority',   labelBN: 'কর্তৃপক্ষ',    hint: 'Plain',  defaultVisible: false },
        { key: 'remarks',   labelEN: 'Remarks',     labelBN: 'মন্তব্য',      hint: 'Plain',  defaultVisible: false },
    ];

    private static readonly plainColumnPropertyMap: Record<string, { en: string; bn?: string }> = {
        leaveType: { en: 'leaveType', bn: 'leaveTypeBN' },
        auth:      { en: 'auth' },
        remarks:   { en: 'remarks' },
    };

    plainCellValue(row: LeaveReportRow, key: string): string {
        const map = ReportLeaveIndividualComponent.plainColumnPropertyMap[key];
        if (!map) return '-';
        const en = (row as any)[map.en] as string | null | undefined;
        const bn = map.bn ? (row as any)[map.bn] as string | null | undefined : undefined;
        return this.codeValue(en, bn);
    }
    formatPeriod(row: LeaveReportRow): string {
        const from = this.formatDate(row.fromDate);
        const to = this.formatDate(row.toDate);
        if (from === '-' && to === '-') return '-';
        return `${from} – ${to}`;
    }
    /** Inclusive day count between from and to. */
    daysCell(row: LeaveReportRow): string {
        if (!row.fromDate || !row.toDate) return '-';
        const a = new Date(row.fromDate).getTime();
        const b = new Date(row.toDate).getTime();
        if (isNaN(a) || isNaN(b)) return '-';
        const days = Math.max(0, Math.ceil((b - a) / (1000 * 60 * 60 * 24)) + 1);
        return this.displayNum(days);
    }

    selectedColumnKeys: string[] = this.columnCatalog.filter(c => c.defaultVisible).map(c => c.key);
    get columnPickerOptions(): { label: string; value: string }[] {
        return this.columnCatalog.map(c => ({ label: this.lang === 'bn' ? c.labelBN : c.labelEN, value: c.key }));
    }
    get visibleColumns(): typeof this.columnCatalog {
        const map = new Map(this.columnCatalog.map(c => [c.key, c]));
        return this.selectedColumnKeys.map(k => map.get(k)).filter((c): c is typeof this.columnCatalog[number] => c != null);
    }

    draggingColumnKey: string | null = null;
    onColumnDragStart(key: string, event: DragEvent): void {
        this.draggingColumnKey = key;
        event.dataTransfer?.setData('text/plain', key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }
    onColumnDragOver(event: DragEvent): void { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }
    onColumnDrop(targetKey: string, event: DragEvent): void {
        event.preventDefault();
        const sourceKey = this.draggingColumnKey;
        this.draggingColumnKey = null;
        if (!sourceKey || sourceKey === targetKey) return;
        const arr = [...this.selectedColumnKeys];
        const fromIdx = arr.indexOf(sourceKey);
        const toIdx = arr.indexOf(targetKey);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        this.selectedColumnKeys = arr;
    }
    onColumnDragEnd(): void { this.draggingColumnKey = null; }
    removeColumn(key: string): void { this.selectedColumnKeys = this.selectedColumnKeys.filter(k => k !== key); }

    paddedSer(n: number | string | null | undefined): string {
        const s = n == null ? '' : String(n);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s.padStart(2, '0')) : s.padStart(2, '0');
    }

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
    get employeeInfoCardTitle(): string { return this.lang === 'bn' ? 'সদস্যের তথ্য' : 'MEMBER DETAILS'; }

    get memberFoundNoRecords(): boolean {
        return this.searched && !this.loading && this.list.length === 0 && this.memberInfo != null && !this.orgScopeRestricted;
    }
    get noRecordsMessage(): string {
        return this.lang === 'bn' ? 'এই সদস্যের ছুটির তথ্য নেই।' : 'No leave records found for this member.';
    }
    get noMatchMessage(): string { return this.lang === 'bn' ? 'কোনো মিল পাওয়া যায়নি।' : 'No matching record found.'; }

    get rabOverlineText(): string { return this.lang === 'bn' ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার' : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH"; }
    get rabOrgTitle(): string { return this.lang === 'bn' ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION'; }
    get rabOrgSubtitle(): string { return this.lang === 'bn' ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা' : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka'; }
    get rabSectionTitle(): string { return this.lang === 'bn' ? 'ছুটির তথ্য প্রতিবেদন' : 'LEAVE INFORMATION REPORT'; }
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
        private leaveInfoService: LeaveInfoService,
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

    get dateLine(): string {
        const now = new Date();
        return this.lang === 'en'
            ? now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
            : now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    buildFilterLines(): string[] {
        const lines: string[] = [];
        if (this.searchRabId.trim())     lines.push(`RAB ID: ${this.searchRabId.trim()}`);
        if (this.searchServiceId.trim()) lines.push(`Service ID: ${this.searchServiceId.trim()}`);
        if (this.searchNid.trim())       lines.push(`NID: ${this.searchNid.trim()}`);
        return lines;
    }

    toggleExportDropdown(event: Event): void { event.stopPropagation(); this.exportDropdownOpen = !this.exportDropdownOpen; }

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
        if (changes['lang']) this.appliedFilterLines = this.buildFilterLines();
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
    clearFilters(): void { this.searchRabId = ''; this.searchServiceId = ''; this.searchNid = ''; this.dateFrom = null; this.dateTo = null; this.first = 0; this.applyDateFilter(); }
    onPage(event: { first?: number; rows?: number }): void { this.first = event.first ?? 0; this.rows = event.rows ?? this.rows; }

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

        const lookupColumns = ['rabId', 'serviceId', 'nameEnglish', 'nameBangla', 'armyRank', 'corps', 'trade', 'motherOrganization', 'rabUnit', 'prefix', 'postingStatus'];

        this.reportService.runDynamicEmployeeBaseReport({
            columns: lookupColumns, criteria: lookupCriteria, pagination: { page_no: 1, row_per_page: 100 },
        }).subscribe({
            next: (lookup) => {
                this.searched = true;
                this.accessibleScope = lookup.accessibleScope ? {
                    rabUnitNames: null, rabUnitNamesBN: null, memberTypeNames: null, memberTypeNamesBN: null,
                    orgScopeRestricted: lookup.accessibleScope.orgScopeRestricted,
                } as ReportAccessibleScope : null;

                const employees = (lookup.datalist ?? []) as Array<DynamicReportRow>;
                if (employees.length === 0) {
                    this.resetResults();
                    this.loading = false;
                    const unrestrictedHasMatches = (lookup.accessibleScope as any)?.unrestrictedHasMatches === true;
                    if (unrestrictedHasMatches) this.showAccessDeniedDialog = true; else this.showNotFoundDialog = true;
                    return;
                }
                const allowed = employees.filter((d) => this.isMemberTypeAllowed(d['memberTypeId'] as number | null | undefined));
                if (allowed.length === 0) { this.resetResults(); this.loading = false; this.showAccessDeniedDialog = true; return; }
                if (allowed.length === 1) { this.fetchForEmployee(allowed[0]['employeeId'] as number, allowed[0]); return; }
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

    private resetResults(): void { this.list = []; this.allRows = []; this.memberInfo = null; this.totalRecords = 0; }

    onDateFilterChange(): void { this.applyDateFilter(); }

    /** Re-derive the visible list from allRows using the date-range filter.
        A leave is kept when its [fromDate, toDate] period overlaps the range. */
    private applyDateFilter(): void {
        const rows = this.allRows.filter(r => this.inDateRange(r.fromDate, r.toDate));
        rows.forEach((r, i) => { r.ser = i + 1; });
        this.list = rows;
        this.totalRecords = rows.length;
        this.first = 0;
    }

    private inDateRange(from: string | null, to: string | null): boolean {
        const f = this.dateFrom ? new Date(this.dateFrom.getFullYear(), this.dateFrom.getMonth(), this.dateFrom.getDate(), 0, 0, 0).getTime() : null;
        const t = this.dateTo ? new Date(this.dateTo.getFullYear(), this.dateTo.getMonth(), this.dateTo.getDate(), 23, 59, 59).getTime() : null;
        if (f == null && t == null) return true;
        const rf = from ? new Date(from).getTime() : null;
        const rt = to ? new Date(to).getTime() : rf;
        const start = rf ?? rt;
        const end = rt ?? rf;
        if (start == null) return false;
        if (f != null && (end == null || end < f)) return false;
        if (t != null && start > t) return false;
        return true;
    }

    private fetchForEmployee(employeeId: number, lookupRow: DynamicReportRow): void {
        this.loading = true;
        this.first = 0;
        this.memberInfo = lookupRow;

        forkJoin({
            leaves: this.leaveInfoService.getByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            leaveTypes: this.commonCodeService.getAllActiveCommonCodesType(CodeType.LeaveType).pipe(catchError(() => of([] as any[]))),
        }).subscribe({
            next: ({ leaves, leaveTypes }) => {
                const typeMap = this.buildCodeMap(leaveTypes);
                const shaped = (leaves ?? [])
                    .filter((item: any) => (item.employeeId ?? item.EmployeeId) === employeeId)
                    .map((item: any) => {
                        const typeId = item.leaveTypeId ?? item.LeaveTypeId ?? null;
                        const t = typeId != null ? typeMap.get(Number(typeId)) : undefined;
                        return {
                            leaveType: t?.en ?? (typeId != null ? String(typeId) : null),
                            leaveTypeBN: t?.bn ?? null,
                            fromDate: item.fromDate ?? item.FromDate ?? null,
                            toDate: item.toDate ?? item.ToDate ?? null,
                            auth: item.auth ?? item.Auth ?? null,
                            remarks: item.remarks ?? item.Remarks ?? null,
                        } as LeaveReportRow;
                    });
                shaped.sort((a, b) => this.timeOf(b.fromDate) - this.timeOf(a.fromDate));
                this.allRows = shaped;
                this.applyDateFilter();
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load leave records' });
                this.loading = false;
            },
        });
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

    private timeOf(v: string | null): number {
        if (!v) return 0;
        const t = new Date(v).getTime();
        return isNaN(t) ? 0 : t;
    }

    private cellText(row: LeaveReportRow, col: { key: string; hint: string }): string {
        switch (col.hint) {
            case 'Serial': return this.paddedSer(row.ser);
            case 'Period': return this.formatPeriod(row);
            case 'Days':   return this.daysCell(row);
            case 'Plain':
            default:       return this.plainCellValue(row, col.key);
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
        if (lookupRow) this.fetchForEmployee(employeeId, lookupRow);
    }
    pickerClose(): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.pickerLookupRows = [];
        this.resetResults();
    }

    private static readonly statusDisplayMap: Record<string, { en: string; bn: string }> = {
        Servings: { en: 'Serving', bn: 'কর্মরত' }, Serving: { en: 'Serving', bn: 'কর্মরত' },
        ExMember: { en: 'Ex-Member', bn: 'সাবেক সদস্য' },
        Pending: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' }, PendingForJoining: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' },
        Supernumerary: { en: 'Supernumerary', bn: 'সুপারনিউমারারি' },
    };
    private formatPostingStatus(raw: unknown): string {
        const s = (raw ?? '').toString().trim();
        if (!s) return '-';
        const mapped = ReportLeaveIndividualComponent.statusDisplayMap[s];
        if (mapped) return this.lang === 'bn' ? mapped.bn : mapped.en;
        return s;
    }

    formatDate(v: string | null | undefined): string {
        if (v == null || v === '') return '-';
        try {
            const d = new Date(v);
            if (isNaN(d.getTime())) return v;
            const s = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
            return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
        } catch { return v; }
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

    // ── Exporters ──────────────────────────────────────────────────────
    private async exportRabWord(): Promise<void> {
        const isBn = this.lang === 'bn';
        const bnFont = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const sans = isBn ? (bnFont as any) : 'Calibri';
        const serif = isBn ? (bnFont as any) : 'Cambria';
        const mono = isBn ? (bnFont as any) : 'Consolas';
        const bnRunExtras = (size: number) => isBn ? { language: bnLang, sizeComplexScript: size } : {};
        const wsafe = (s: string | null | undefined): string => s ?? '';

        const S = { overline: 15, title: 44, subtitle: 20, sectionTitle: 26, stripLabel: 16, stripDate: 16, critLabel: 14, critValue: 20, tableHeader: 14, name: 20, body: 16, footer: 13 };
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
            const shading = idx % 2 === 1 ? { type: 'clear' as const, fill: C.zebra, color: 'auto' } : undefined;
            const cellOpts = { borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, shading };
            const cells: TableCell[] = visibleCols.map(col => {
                const isSerial = col.hint === 'Serial';
                const isMono = isSerial || col.hint === 'Period' || col.hint === 'Days';
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
        saveAs(blob, `leave-report_${this.lang}.docx`);
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
        for (const row of this.list) aoa.push(visibleCols.map(col => this.cellText(row, col)));
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabConfidentialLabel}  ·  ${this.rabWarningLabel}`, ...pad(totalCols - 1)]);

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = ws['!merges'] ?? [];
        for (const r of [0, 1, 2, 3, 5]) ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
        const lastRow = aoa.length - 1;
        ws['!merges'].push({ s: { r: lastRow, c: 0 }, e: { r: lastRow, c: totalCols - 1 } });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isBn ? 'প্রতিবেদন' : 'Report');
        XLSX.writeFile(wb, `leave-report_${this.lang}.xlsx`);
    }

    private openRabPrintWindow(): void {
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) { this.messageService.add({ severity: 'warn', summary: 'Popup blocked', detail: 'Allow popups for this site to use Print.', life: 6000 }); return; }
        const html = this.buildRabPrintHtml();
        win.document.open(); win.document.write(html); win.document.close();
        setTimeout(() => { try { win.focus(); win.print(); } catch { /* user can Ctrl+P */ } }, 700);
    }

    private buildRabPrintHtml(): string {
        const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const isBn = this.lang === 'bn';
        const serif = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', serif" : "'Playfair Display', Georgia, 'Times New Roman', serif";
        const sans = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', sans-serif" : "'DM Sans', 'Segoe UI', Arial, sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const visibleCols = this.visibleColumns;
        const tableHeaderHtml = `<tr>${visibleCols.map(c => `<th>${esc(this.lang === 'bn' ? c.labelBN : c.labelEN)}</th>`).join('')}</tr>`;
        const renderCell = (row: LeaveReportRow, col: { key: string; hint: string }): string => {
            switch (col.hint) {
                case 'Serial': return `<td class="td-ser"><span class="ser">${esc(this.paddedSer(row.ser))}</span></td>`;
                case 'Period': return `<td class="td-date">${esc(this.formatPeriod(row))}</td>`;
                case 'Days':   return `<td class="td-date">${esc(this.daysCell(row))}</td>`;
                default:       return `<td>${esc(this.cellText(row, col))}</td>`;
            }
        };
        const tableBodyHtml = this.list.map((row) => `<tr>${visibleCols.map(c => renderCell(row, c)).join('')}</tr>`).join('');
        const items = this.employeeInfoItems;
        const criteriaGridHtml = items.length ? `<div class="criteria-grid">${items.map(item => `
                <div class="cell"><div class="cell-label">${esc(item.label)}</div><div class="cell-value">${esc(item.value)}</div></div>`).join('')}</div>` : '';
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
        @bottom-left { content: "● " "${cssStr(confidential)}"; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 0 0 8mm; background-image: linear-gradient(rgba(176,58,58,0.5), rgba(176,58,58,0.5)); background-position: 8mm 1.5mm; background-size: calc(100% - 8mm) 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
        @bottom-center { content: "${cssStr(pageWord)} " counter(page${isBn ? ', bn-digits' : ''}) " ${cssStr(ofWord)} " counter(pages${isBn ? ', bn-digits' : ''}); font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.25em; text-transform: uppercase; color: #4a4a4a; padding-top: 5mm; background-image: linear-gradient(rgba(176,58,58,0.5), rgba(176,58,58,0.5)); background-position: 0 1.5mm; background-size: 100% 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
        @bottom-right { content: "${cssStr(warning)}"; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 8mm 0 0; background-image: linear-gradient(rgba(176,58,58,0.5), rgba(176,58,58,0.5)); background-position: 0 1.5mm; background-size: calc(100% - 8mm) 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
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
            <div class="criteria-strip"><span>${esc(this.employeeInfoCardTitle)}</span><span>${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span></div>
            ${criteriaGridHtml}
        </div>
        <table><thead>${tableHeaderHtml}</thead><tbody>${tableBodyHtml}</tbody></table>
    </div>
</body></html>`;
    }
}
