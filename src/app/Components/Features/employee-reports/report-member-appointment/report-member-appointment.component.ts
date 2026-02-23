import { Component, Input, OnInit } from '@angular/core';
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
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { MemberAppointmentReportRow } from '@/models/report.model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import type { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-report-member-appointment',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        SelectModule,
        DatePickerModule,
        Toast,
    ],
    providers: [MessageService],
    templateUrl: './report-member-appointment.component.html',
    styleUrls: ['./report-member-appointment.component.scss', '../report-theme.scss'],
})
export class ReportMemberAppointmentComponent implements OnInit {
    L = REPORT_LABELS;
    /** Language (EN/BN); passed from container, English by default. */
    @Input() lang: ReportLang = 'en';

    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgId: number | null = null;
    rankOptions: { label: string; value: number }[] = [];
    tradeOptions: { label: string; value: number }[] = [];
    selectedRankId: number | null = null;
    selectedTradeId: number | null = null;
    joiningDateFrom: Date | null = null;
    joiningDateTo: Date | null = null;

    list: MemberAppointmentReportRow[] = [];
    loading = false;
    first = 0;
    rows = 20;
    totalRecords = 0;

    constructor(
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadOrgOptions();
        this.load();
    }

    /** Filter panel collapsed state. */
    filterOpen = true;

    /** Number of filters currently applied (for badge). */
    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedOrgId != null) c++;
        if (this.selectedRankId != null) c++;
        if (this.selectedTradeId != null) c++;
        if (this.joiningDateFrom != null) c++;
        if (this.joiningDateTo != null) c++;
        return c;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    filterSubtitle(): string {
        const L = this.L[this.lang];
        if (this.activeFilterCount === 0) return L['report.search.panelSubtitle'];
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' ' + L['report.search.panelSubtitleApplied'];
    }

    clearFilters(): void {
        this.selectedOrgId = null;
        this.selectedRankId = null;
        this.selectedTradeId = null;
        this.joiningDateFrom = null;
        this.joiningDateTo = null;
        this.rankOptions = [];
        this.tradeOptions = [];
        this.first = 0;
        // User clicks Search to apply
    }

    onExport(): void {
        this.messageService.add({ severity: 'info', summary: 'Export', detail: 'Export feature can be wired to download report data.' });
    }

    loadOrgOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => (this.orgOptions = orgs),
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load organizations' });
            },
        });
    }

    onOrgChange(): void {
        this.rankOptions = [];
        this.tradeOptions = [];
        this.selectedRankId = null;
        this.selectedTradeId = null;
        const orgId = this.selectedOrgId;
        if (orgId != null) {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.rankOptions = codes.map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }))),
            });
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Trade').subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.tradeOptions = codes.map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }))),
            });
        }
    }

    onFilterChange(): void {
        // Only update options; search runs when user clicks Search
    }

    onPage(event: { first: number; rows: number }): void {
        this.first = event.first;
        this.rows = event.rows;
        this.load();
    }

    load(): void {
        this.loading = true;
        const page_no = Math.floor(this.first / this.rows) + 1;
        this.reportService
            .getMemberAppointmentReport({
                orgId: this.selectedOrgId ?? undefined,
                rankId: this.selectedRankId ?? undefined,
                tradeId: this.selectedTradeId ?? undefined,
                joiningDateFrom: this.toDateStr(this.joiningDateFrom),
                joiningDateTo: this.toDateStr(this.joiningDateTo),
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

    toDateStr(d: Date | null): string | undefined {
        if (d == null) return undefined;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    formatDate(v: string | null | undefined): string {
        if (v == null || v === '') return '-';
        try {
            const d = new Date(v);
            const s = isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
        } catch {
            return v;
        }
    }

    /** Serial and numeric content: Bangla numerals when lang is BN. */
    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

}
