import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { MemberTypeServingReportRow, ReportAccessibleScope } from '@/models/report.model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import type { CommonCodeModel } from '@/models/common-code-model';
import { unitScopeLine } from '../report-scope.helper';

@Component({
    selector: 'app-report-member-type-serving',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, DatePickerModule, Toast],
    providers: [MessageService],
    templateUrl: './report-member-type-serving.component.html',
    styleUrls: ['../report-theme.scss', './report-member-type-serving.component.scss'],
})
export class ReportMemberTypeServingComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    /** Primary cascade: Member Type (independent), then RAB Unit → Wing. */
    memberTypeOptions: { label: string; labelBn: string; value: number }[] = [];
    rabUnitOptions: { label: string; labelBn: string; value: number }[] = [];
    wingOptions: { label: string; labelBn: string; value: number }[] = [];

    selectedMemberTypeId: number | null = null;
    selectedRabUnitId: number | null = null;
    selectedWingId: number | null = null;

    /** Additional filters. */
    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgId: number | null = null;
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedRankId: number | null = null;

    joiningInRabFrom: Date | null = null;
    joiningInRabTo: Date | null = null;
    serviceHistoryFrom: Date | null = null;
    serviceHistoryTo: Date | null = null;

    list: MemberTypeServingReportRow[] = [];
    loading = false;
    searched = false;
    first = 0;
    rows = 20;
    totalRecords = 0;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    /** Backend's access-scope snapshot. Drives the chip rendered under the title +
     *  the preDateLines treatment on Print/PDF/Word/Excel exports. */
    accessibleScope: ReportAccessibleScope | null = null;
    get unitScopeLine(): string | null { return unitScopeLine(this.accessibleScope, this.lang); }
    /**
     * Member-type chip is hidden entirely on this report — it's redundant with
     * the report title ("Member Type Report by RAB Unit & Wing") and the
     * "Member Type" filter chip already shown under the search bar. Returning
     * null suppresses both the on-screen line and the export header line.
     */
    get memberTypeScopeLine(): string | null { return null; }

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

        // Fetch scope eagerly so the chip shows on page load — without this,
        // the chip only appears after the user clicks Search (the data load
        // path also sets accessibleScope but doesn't fire on init).
        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => { this.accessibleScope = scope ?? null; },
            error: () => { /* silent — chip stays hidden on failure */ },
        });

        this.loadMemberTypes();
        this.loadRabUnits();
        this.loadOrgs();
    }

    loadMemberTypes(): void {
        this.commonCodeService.getAccessibleMemberTypes().subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.memberTypeOptions = (codes || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }))),
            error: () => (this.memberTypeOptions = []),
        });
    }

    loadRabUnits(): void {
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.rabUnitOptions = (codes || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }))),
            error: () => (this.rabUnitOptions = []),
        });
    }

    loadOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => (this.orgOptions = orgs),
            error: () => (this.orgOptions = []),
        });
    }

    onRabUnitChange(): void {
        this.wingOptions = [];
        this.selectedWingId = null;
        if (this.selectedRabUnitId != null) {
            this.commonCodeService.getAllActiveCommonCodesByParentId(this.selectedRabUnitId).subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.wingOptions = (codes || [])
                        .filter((c) => c.codeType === 'Wing' || c.codeType === 'RabWing' || c.codeType === 'RABWING')
                        .map((c) => ({
                            label: c.codeValueEN || String(c.codeId),
                            labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                            value: c.codeId,
                        }))),
                error: () => (this.wingOptions = []),
            });
        }
    }

    onOrgChange(): void {
        this.rankOptions = [];
        this.selectedRankId = null;
        if (this.selectedOrgId != null) {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(this.selectedOrgId, 'MotherOrgRank').subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.rankOptions = codes.map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                        value: c.codeId,
                    }))),
                error: () => (this.rankOptions = []),
            });
        }
    }

    get reportTitle(): string {
        return this.L[this.lang]['report.title.memberTypeServing'];
    }

    get dateLine(): string {
        const now = new Date();
        if (this.lang === 'en') {
            return now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        return now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    buildFilterLines(): string[] {
        const L = this.L[this.lang];
        const lines: string[] = [];
        if (this.selectedMemberTypeId != null) {
            const opt = this.memberTypeOptions.find((o) => o.value === this.selectedMemberTypeId);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.memberType']}: ${val}`);
        }
        if (this.selectedRabUnitId != null) {
            const opt = this.rabUnitOptions.find((o) => o.value === this.selectedRabUnitId);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.rabUnit']}: ${val}`);
        }
        if (this.selectedWingId != null) {
            const opt = this.wingOptions.find((o) => o.value === this.selectedWingId);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.wing']}: ${val}`);
        }
        if (this.selectedOrgId != null) {
            const org = this.orgOptions.find((o) => o.orgId === this.selectedOrgId);
            const val = this.lang === 'bn' ? (org?.orgNameBN || org?.orgNameEN) : org?.orgNameEN;
            if (val) lines.push(`${L['report.search.motherOrg']}: ${val}`);
        }
        if (this.selectedRankId != null) {
            const rank = this.rankOptions.find((o) => o.value === this.selectedRankId);
            const val = this.lang === 'bn' ? rank?.labelBn : rank?.label;
            if (val) lines.push(`${L['report.search.rank']}: ${val}`);
        }
        if (this.joiningInRabFrom != null) {
            lines.push(`${L['report.search.joiningInRabFrom']}: ${this.formatDate(this.toDateStr(this.joiningInRabFrom) ?? '')}`);
        }
        if (this.joiningInRabTo != null) {
            lines.push(`${L['report.search.joiningInRabTo']}: ${this.formatDate(this.toDateStr(this.joiningInRabTo) ?? '')}`);
        }
        if (this.serviceHistoryFrom != null) {
            lines.push(`${L['report.search.serviceHistoryFrom']}: ${this.formatDate(this.toDateStr(this.serviceHistoryFrom) ?? '')}`);
        }
        if (this.serviceHistoryTo != null) {
            lines.push(`${L['report.search.serviceHistoryTo']}: ${this.formatDate(this.toDateStr(this.serviceHistoryTo) ?? '')}`);
        }
        return lines;
    }

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedMemberTypeId != null) c++;
        if (this.selectedRabUnitId != null) c++;
        if (this.selectedWingId != null) c++;
        if (this.selectedOrgId != null) c++;
        if (this.selectedRankId != null) c++;
        if (this.joiningInRabFrom != null) c++;
        if (this.joiningInRabTo != null) c++;
        if (this.serviceHistoryFrom != null) c++;
        if (this.serviceHistoryTo != null) c++;
        return c;
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
        this.selectedMemberTypeId = null;
        this.selectedRabUnitId = null;
        this.selectedWingId = null;
        this.selectedOrgId = null;
        this.selectedRankId = null;
        this.wingOptions = [];
        this.rankOptions = [];
        this.joiningInRabFrom = null;
        this.joiningInRabTo = null;
        this.serviceHistoryFrom = null;
        this.serviceHistoryTo = null;
        this.first = 0;
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
        this.searched = true;
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const page_no = Math.floor(this.first / this.rows) + 1;
        this.reportService
            .getMemberTypeServingReport({
                memberTypeId: this.selectedMemberTypeId ?? undefined,
                rabUnitId: this.selectedRabUnitId ?? undefined,
                rabWingId: this.selectedWingId ?? undefined,
                orgId: this.selectedOrgId ?? undefined,
                rankId: this.selectedRankId ?? undefined,
                joiningInRabFrom: this.toDateStr(this.joiningInRabFrom),
                joiningInRabTo: this.toDateStr(this.joiningInRabTo),
                serviceHistoryFrom: this.toDateStr(this.serviceHistoryFrom),
                serviceHistoryTo: this.toDateStr(this.serviceHistoryTo),
                postingStatus: 'Servings',
                pagination: { page_no, row_per_page: this.rows },
            })
            .subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.accessibleScope = res.accessibleScope ?? null;
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

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    getExportData(): { columns: string[]; rows: string[][] } {
        const L = this.L[this.lang];
        const columns = [
            L['report.table.ser'],
            L['report.table.orgName'],
            L['report.table.serviceId'],
            L['report.table.rank'],
            L['report.table.corps'],
            L['report.table.trade'],
            L['report.table.name'],
            L['report.table.presentUnit'],
            L['report.table.dateOfJoinInPresentUnit'],
            L['report.table.rmks'],
        ];
        const rows = this.list.map((row) => [
            this.displayNum(row.ser),
            this.codeValue(row.orgName, row.orgNameBN),
            this.displayNum(row.serviceId),
            this.codeValue(row.rank, row.rankBN),
            this.codeValue(row.corps, row.corpsBN),
            this.codeValue(row.trade, row.tradeBN),
            this.codeValue(row.name, row.nameBN),
            this.codeValue(row.presentUnit, row.presentUnitBN),
            this.formatDate(row.dateOfJoinInPresentUnit),
            row.rmks ?? '—',
        ]);
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        const { columns, rows } = this.getExportData();
        // Mirror the on-screen chip: unit names ABOVE the date, member-type names
        // BELOW the date WITHOUT the "Member Types:" prefix (redundant on this
        // report — title is already about member types). Custom build instead of
        // the shared helper.
        const preDate: string[] = [];
        if (this.unitScopeLine) preDate.push(this.unitScopeLine);
        const belowDate: string[] = [];
        if (this.memberTypeScopeLine) belowDate.push(this.memberTypeScopeLine);
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            landscape: true,
            preDateLines: preDate,
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

    toDateStr(d: Date | null): string | undefined {
        if (d == null) return undefined;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
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

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
    }
}
