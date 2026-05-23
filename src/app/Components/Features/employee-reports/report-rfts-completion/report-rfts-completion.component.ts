import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { RftsCompletionReportRow } from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';

@Component({
    selector: 'app-report-rfts-completion',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, InputTextModule, DatePickerModule, Toast],
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

    getExportData(): { columns: string[]; rows: string[][] } {
        const L = this.L[this.lang];
        const isCompleted = this.selectedCompletionStatus === 'Completed';
        const columns = [
            L['report.table.ser'],
            L['report.table.name'],
            L['report.table.rabId'] ?? 'RAB ID',
            L['report.table.serviceId'],
            L['report.table.rank'],
            L['report.table.corps'],
            L['report.table.trade'],
            L['report.table.motherOrg'],
            ...(isCompleted ? [L['report.table.latestCourseNo'], L['report.table.from'], L['report.table.to']] : []),
        ];
        const rows = this.list.map((row) => {
            const base = [
                this.displayNum(row.ser),
                this.codeValue(row.name, row.nameBN),
                row.rabid ?? '—',
                this.displayNum(row.serviceId),
                this.codeValue(row.rank, row.rankBN),
                this.codeValue(row.corps, row.corpsBN),
                this.codeValue(row.trade, row.tradeBN),
                this.codeValue(row.orgName, row.orgNameBN),
            ];
            if (isCompleted) {
                base.push(row.latestCourseNo ?? '—');
                base.push(this.fmtDate(row.latestCourseDateFrom));
                base.push(this.fmtDate(row.latestCourseDateTo));
            }
            return base;
        });
        return { columns, rows };
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
        this.reportService
            .getRftsCompletionReport({
                completionStatus: this.selectedCompletionStatus,
                motherOrgId: this.selectedMotherOrgId ?? undefined,
                memberTypeId: this.selectedMemberTypeId ?? undefined,
                rankId: this.selectedRankId ?? undefined,
                courseNo: this.isCompletedView ? (this.searchCourseNo.trim() || undefined) : undefined,
                dateFrom: this.isCompletedView ? (this.toLocalDateStr(this.dateFrom) ?? undefined) : undefined,
                dateTo: this.isCompletedView ? (this.toLocalDateStr(this.dateTo) ?? undefined) : undefined,
                pagination: { page_no, row_per_page: this.rows },
            })
            .subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
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
