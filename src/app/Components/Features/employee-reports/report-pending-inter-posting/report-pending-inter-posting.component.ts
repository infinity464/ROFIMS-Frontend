import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PostingService } from '@/services/posting.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ReportService } from '@/services/report.service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { PendingPostingJoiningDto } from '@/models/posting.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import type { ReportAccessibleScope } from '@/models/report.model';
import { unitScopeLine, memberTypeScopeLine, buildScopeExportLines } from '../report-scope.helper';

@Component({
    selector: 'app-report-pending-inter-posting',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, Toast],
    providers: [MessageService],
    templateUrl: './report-pending-inter-posting.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-pending-inter-posting.component.scss'],
})
export class ReportPendingInterPostingComponent implements OnInit {
    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    allRows: PendingPostingJoiningDto[] = [];
    list: PendingPostingJoiningDto[] = [];
    loading = false;
    searched = false;

    /** Sourced from CommonCode / MotherOrg so the dropdowns work even when there is no pending data. */
    motherOrgOptions: { label: string; value: string }[] = [];
    transferUnitOptions: { label: string; value: number }[] = [];

    /** Mother Org filter is matched by orgNameEN against PendingPostingJoiningDto.motherOrganization. */
    selectedMotherOrg: string | null = null;
    /** RAB Unit filter is matched by codeId against PendingPostingJoiningDto.transferRabUnitId. */
    selectedTransferUnitId: number | null = null;

    rows = 20;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    /** Backend's access-scope snapshot. The pending-list endpoint applies the
     *  same scope filter server-side, so this is only used for the chip UI +
     *  preDateLines treatment on Print/PDF/Word/Excel exports. */
    accessibleScope: ReportAccessibleScope | null = null;
    get unitScopeLine(): string | null { return unitScopeLine(this.accessibleScope, this.lang); }
    get memberTypeScopeLine(): string | null { return memberTypeScopeLine(this.accessibleScope, this.lang); }

    filterOpen = true;

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private postingService: PostingService,
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

        // Fetch the caller's access-scope snapshot — drives the chip + export
        // headers. The list endpoint applies the same scope filter server-side.
        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => { this.accessibleScope = scope ?? null; },
            error: () => { /* silent — chip stays hidden on failure */ },
        });

        this.loadMotherOrgs();
        this.loadRabUnits();
        this.loadData();
    }

    /** Pull all pending inter-posting rows once; filter client-side (same as the source page). */
    loadData(): void {
        this.loading = true;
        this.postingService.getPendingPostingJoining('InterPosting').subscribe({
            next: (data) => {
                this.allRows = data ?? [];
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load pending inter-posting list.',
                });
                this.loading = false;
            },
        });
    }

    private loadMotherOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs: MotherOrganizationModel[]) => {
                this.motherOrgOptions = (orgs || []).map((o) => ({ label: o.orgNameEN || String(o.orgId), value: o.orgNameEN }));
            },
            error: () => (this.motherOrgOptions = []),
        });
    }

    private loadRabUnits(): void {
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.transferUnitOptions = (codes || []).map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }));
            },
            error: () => (this.transferUnitOptions = []),
        });
    }

    get reportTitle(): string {
        return this.L[this.lang]['report.title.pendingInterPosting'];
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
        if (this.selectedMotherOrg) lines.push(`${L['report.search.motherOrg']}: ${this.selectedMotherOrg}`);
        if (this.selectedTransferUnitId != null) {
            const opt = this.transferUnitOptions.find((o) => o.value === this.selectedTransferUnitId);
            if (opt) lines.push(`${L['report.search.postedUnit']}: ${opt.label}`);
        }
        return lines;
    }

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedMotherOrg) c++;
        if (this.selectedTransferUnitId != null) c++;
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
        this.selectedMotherOrg = null;
        this.selectedTransferUnitId = null;
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    /** Applies the dropdown filters to the in-memory rows and records the filter summary. */
    search(): void {
        this.searched = true;
        this.appliedFilterLines = this.buildFilterLines();
        this.list = this.allRows.filter((r) => {
            if (this.selectedMotherOrg && r.motherOrganization !== this.selectedMotherOrg) return false;
            if (this.selectedTransferUnitId != null && r.transferRabUnitId !== this.selectedTransferUnitId) return false;
            return true;
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
            L['report.table.serviceId'],
            L['report.table.rank'],
            L['report.table.corps'],
            L['report.table.trade'],
            L['report.table.name'],
            L['report.table.presentBnWg'],
            L['report.table.postedBnWg'],
            L['report.table.interPostingDate'],
            L['report.table.rmks'],
        ];
        const rows = this.list.map((row, i) => [
            this.displayNum(i + 1),
            this.displayNum(row.serviceId),
            this.codeValue(row.rankName, row.rankNameBN),
            this.codeValue(row.corps, row.corpsBN),
            this.codeValue(row.trade, row.tradeBN),
            this.codeValue(row.fullNameEN, row.fullNameBN),
            row.fromRabUnitName ?? '—',
            row.transferRabUnitName ?? '—',
            this.formatDate(row.postingOrderDate),
            '—',
        ]);
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        const { columns, rows } = this.getExportData();
        const { preDateLines, filterLines } = buildScopeExportLines(this.accessibleScope, this.lang, this.appliedFilterLines);
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            landscape: true,
            preDateLines,
            filterLines,
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
