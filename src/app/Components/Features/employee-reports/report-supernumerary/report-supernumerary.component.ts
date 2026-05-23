import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { EmployeeListService, GetSupernumeraryListRequest } from '@/services/employee-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ReportService } from '@/services/report.service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { EmployeeList } from '@/models/employee-list.model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { ReportAccessibleScope } from '@/models/report.model';

@Component({
    selector: 'app-report-supernumerary',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, Toast],
    providers: [MessageService],
    templateUrl: './report-supernumerary.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-supernumerary.component.scss'],
})
export class ReportSupernumeraryComponent implements OnInit {
    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    list: EmployeeList[] = [];
    loading = false;
    searched = false;

    orgOptions: MotherOrganizationModel[] = [];
    memberTypeOptions: { label: string; value: number }[] = [];
    rankOptions: { label: string; value: number }[] = [];
    tradeOptions: { label: string; value: number }[] = [];

    selectedOrgId: number | null = null;
    selectedMemberTypeId: number | null = null;
    selectedRankId: number | null = null;
    selectedTradeId: number | null = null;

    rows = 20;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    /**
     * Member-type access-scope snapshot from /GetMyReportAccessScope. The
     * supernumerary list backend already filters server-side; this is only
     * used to render the chip under the title + the preDateLines treatment
     * on exports. No unit chip is shown — supernumeraries have no RAB
     * placement yet, so org-tree scope doesn't apply.
     */
    accessibleScope: ReportAccessibleScope | null = null;

    get memberTypeScopeLine(): string | null {
        const names = (this.lang === 'bn'
            ? this.accessibleScope?.memberTypeNamesBN
            : this.accessibleScope?.memberTypeNames) ?? this.accessibleScope?.memberTypeNames;
        if (!names || names.length === 0) return null;
        const label = this.lang === 'bn' ? 'সদস্য ধরণ' : 'Member Types';
        return `${label}: ${names.join(', ')}`;
    }

    filterOpen = true;

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private employeeListService: EmployeeListService,
        private commonCodeService: CommonCodeService,
        private reportService: ReportService,
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

        // Fetch the caller's access-scope snapshot for the chip + export header.
        // Backend already filters server-side; this is purely presentational.
        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => { this.accessibleScope = scope ?? null; },
            error: () => { /* silent — chip stays hidden on failure */ },
        });

        this.loadOrgs();
        this.loadMemberTypes();
    }

    loadOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => (this.orgOptions = orgs ?? []),
            error: () => (this.orgOptions = []),
        });
    }

    loadMemberTypes(): void {
        // Server-side filtered to the caller's accessible member types — mirrors
        // the report data filter, so the dropdown can't offer a type the user
        // wouldn't be allowed to see results for.
        this.commonCodeService.getAccessibleMemberTypes().subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.memberTypeOptions = (codes ?? []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }));
            },
            error: () => (this.memberTypeOptions = []),
        });
    }

    /** Rank and Trade are scoped to the selected Mother Org (same pattern as the source page). */
    onOrgChange(): void {
        this.rankOptions = [];
        this.tradeOptions = [];
        this.selectedRankId = null;
        this.selectedTradeId = null;
        if (this.selectedOrgId == null) return;
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(this.selectedOrgId, 'MotherOrgRank').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.rankOptions = (codes ?? []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }));
            },
        });
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(this.selectedOrgId, 'Trade').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.tradeOptions = (codes ?? []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }));
            },
        });
    }

    get reportTitle(): string {
        return this.L[this.lang]['report.title.supernumerary'];
    }

    /** Column label "Date of Joining in RAB" / "র‍্যাবে যোগদানের তারিখ" (inlined to avoid an extra i18n key). */
    get dateOfJoiningInRabLabel(): string {
        return this.lang === 'bn' ? 'র‍্যাবে যোগদানের তারিখ' : 'Date of Joining in RAB';
    }

    /** Column label "RAB Orientation Training" / "র‍্যাব পরিচিতিমূলক প্রশিক্ষণ" (inlined). */
    get rabOrientationTrainingLabel(): string {
        return this.lang === 'bn' ? 'র‍্যাব পরিচিতিমূলক প্রশিক্ষণ' : 'RAB Orientation Training';
    }

    get dateLine(): string {
        const now = new Date();
        return this.lang === 'en'
            ? now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
            : now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    buildFilterLines(): string[] {
        const L = this.L[this.lang];
        const lines: string[] = [];
        if (this.selectedOrgId != null) {
            const o = this.orgOptions.find((x) => x.orgId === this.selectedOrgId);
            const val = this.lang === 'bn' ? (o?.orgNameBN || o?.orgNameEN) : o?.orgNameEN;
            if (val) lines.push(`${L['report.search.motherOrg']}: ${val}`);
        }
        if (this.selectedMemberTypeId != null) {
            const opt = this.memberTypeOptions.find((x) => x.value === this.selectedMemberTypeId);
            if (opt) lines.push(`${L['report.search.memberType']}: ${opt.label}`);
        }
        if (this.selectedRankId != null) {
            const opt = this.rankOptions.find((x) => x.value === this.selectedRankId);
            if (opt) lines.push(`${L['report.search.rank']}: ${opt.label}`);
        }
        if (this.selectedTradeId != null) {
            const opt = this.tradeOptions.find((x) => x.value === this.selectedTradeId);
            if (opt) lines.push(`${L['report.search.trade']}: ${opt.label}`);
        }
        return lines;
    }

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedOrgId != null) c++;
        if (this.selectedMemberTypeId != null) c++;
        if (this.selectedRankId != null) c++;
        if (this.selectedTradeId != null) c++;
        return c;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    filterSubtitle(): string {
        const L = this.L['en'];
        if (this.activeFilterCount === 0) return 'Select fields to search on';
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' ' + L['report.search.panelSubtitleApplied'];
    }

    clearFilters(): void {
        this.selectedOrgId = null;
        this.selectedMemberTypeId = null;
        this.selectedRankId = null;
        this.selectedTradeId = null;
        this.rankOptions = [];
        this.tradeOptions = [];
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    /** Calls the existing supernumerary list endpoint with the selected filters. */
    search(): void {
        this.searched = true;
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const request: GetSupernumeraryListRequest = {
            orgIds: this.selectedOrgId != null ? [this.selectedOrgId] : undefined,
            memberTypeId: this.selectedMemberTypeId ?? undefined,
            rankId: this.selectedRankId ?? undefined,
            tradeId: this.selectedTradeId ?? undefined,
        };
        this.employeeListService.getSupernumeraryList(request).subscribe({
            next: (res) => {
                this.list = res ?? [];
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load supernumerary list.',
                });
                this.loading = false;
            },
        });
    }

    /** Look up the Mother Org name for a row from the loaded org list (the supernumerary DTO only carries orgId). */
    motherOrgName(row: EmployeeList): string {
        if (row.orgId == null) return '—';
        const o = this.orgOptions.find((x) => x.orgId === row.orgId);
        if (!o) return '—';
        return this.lang === 'bn' ? (o.orgNameBN || o.orgNameEN || '—') : (o.orgNameEN || '—');
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    getExportData(): { columns: string[]; rows: string[][] } {
        const L = this.L[this.lang];
        const columns = [
            L['report.table.ser'],
            L['report.table.serviceId'],
            L['report.table.rank'],
            L['report.table.corps'],
            L['report.table.trade'],
            L['report.table.name'],
            L['report.table.motherOrg'],
            this.dateOfJoiningInRabLabel,
            this.rabOrientationTrainingLabel,
            L['report.table.rmks'],
        ];
        const rows = this.list.map((row, i) => [
            this.displayNum(i + 1),
            this.displayNum(row.serviceId),
            row.rankName ?? '—',
            row.corpsName ?? '—',
            row.tradeName ?? '—',
            this.codeValue(row.fullNameEN, row.fullNameBN),
            this.motherOrgName(row),
            this.formatDate(row.joiningDateInRAB ?? row.joiningDate),
            '—',
            row.sendingRemark ?? '—',
        ]);
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        const { columns, rows } = this.getExportData();
        // Member-type chip joins the applied filters under the date. No
        // preDateLines / unit chip — supernumeraries aren't org-tree scoped.
        const belowDate: string[] = [];
        if (this.memberTypeScopeLine) belowDate.push(this.memberTypeScopeLine);
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            landscape: true,
            filterLines: [...belowDate, ...this.appliedFilterLines],
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

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
    }

    formatDate(v: string | null | undefined): string {
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
}
