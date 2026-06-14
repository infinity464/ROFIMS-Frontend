import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { PermanentPostingMORecordService, PermanentPostingCombinedReportModel } from '@/services/permanent-posting-mo-record.service';
import { ExportService, ReportConfig } from '@/services/export.service';

enum EntryStatusFilter { All = 'all', Completed = 'completed', Pending = 'pending' }

const LABELS: Record<string, Record<string, string>> = {
    en: {
        'title': 'Posted Out & Reliever Combined Report',
        'col.ser': '#',
        'col.postedOutSvcId': 'Posted Out Service ID',
        'col.postedOutName': 'Posted Out Name',
        'col.relieverSvcId': 'Reliever Service ID',
        'col.relieverName': 'Reliever Name',
        'col.motherOrg': 'Mother Org',
        'col.motherOrgUnit': 'Mother Org Unit',
        'col.memberType': 'Member Type',
        'col.rank': 'Rank',
        'col.corps': 'Corps',
        'col.trade': 'Trade',
        'col.entryStatus': 'Entry Status',
        'col.postingOrderDate': 'Posting Order Date',
        'yes': 'Completed',
        'no': 'Pending',
        'na': '-',
        'export': 'Export',
        'fromDate': 'From Date',
        'toDate': 'To Date',
    },
    bn: {
        'title': 'পোস্টেড আউট ও রিলিভার সম্মিলিত প্রতিবেদন',
        'col.ser': 'ক্রম',
        'col.postedOutSvcId': 'পোস্টেড আউট সার্ভিস আইডি',
        'col.postedOutName': 'পোস্টেড আউট নাম',
        'col.relieverSvcId': 'রিলিভার সার্ভিস আইডি',
        'col.relieverName': 'রিলিভার নাম',
        'col.motherOrg': 'মাদার অর্গ',
        'col.motherOrgUnit': 'মাদার অর্গ ইউনিট',
        'col.memberType': 'সদস্য ধরন',
        'col.rank': 'র‍্যাংক',
        'col.corps': 'কোর',
        'col.trade': 'ট্রেড',
        'col.entryStatus': 'এন্ট্রি স্ট্যাটাস',
        'col.postingOrderDate': 'পোস্টিং আদেশ তারিখ',
        'yes': 'সম্পন্ন',
        'no': 'পেন্ডিং',
        'na': '-',
        'export': 'রপ্তানি',
        'fromDate': 'শুরু তারিখ',
        'toDate': 'শেষ তারিখ',
    },
};

@Component({
    selector: 'app-posted-out-reliever-report',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, SelectModule, Toast, DatePickerModule, InputTextModule, IconFieldModule, InputIconModule],
    providers: [MessageService],
    templateUrl: './posted-out-reliever-report.html',
    styleUrl: './posted-out-reliever-report.scss'
})
export class PostedOutRelieverReportComponent implements OnInit, OnDestroy {
    private _router = inject(Router);

    records: PermanentPostingCombinedReportModel[] = [];
    totalRecords = 0;
    loading = false;

    first = 0;
    pageSize = 10;
    pageNumber = 1;

    searchText = '';
    filterDateFrom: Date | null = null;
    filterDateTo: Date | null = null;

    readonly EntryStatusFilter = EntryStatusFilter;
    entryStatusFilter = EntryStatusFilter.All;
    entryStatusOptions = [
        { label: 'All Records',       value: EntryStatusFilter.All },
        { label: 'Entry Completed',   value: EntryStatusFilter.Completed },
        { label: 'Entry Pending',     value: EntryStatusFilter.Pending },
    ];

    lang: 'en' | 'bn' = 'en';
    L = LABELS;
    exportDropdownOpen = false;
    exporting = false;

    private searchSubject = new Subject<string>();
    private searchSub?: Subscription;
    private firstLazyLoadHandled = false;

    constructor(
        private recordSvc: PermanentPostingMORecordService,
        private exportService: ExportService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.searchSub = this.searchSubject.pipe(debounceTime(300)).subscribe(() => this.reload());
    }

    ngOnDestroy(): void {
        this.searchSub?.unsubscribe();
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        const rows = event.rows ?? this.pageSize;
        const first = event.first ?? 0;
        this.pageSize = rows;
        this.first = first;
        this.pageNumber = Math.floor(first / rows) + 1;
        this.firstLazyLoadHandled = true;
        this.loadList();
    }

    private toDateOnly(d: Date | null): string | undefined {
        if (!d) return undefined;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    private getEntryStatus(): boolean | null | undefined {
        if (this.entryStatusFilter === EntryStatusFilter.Completed) return true;
        if (this.entryStatusFilter === EntryStatusFilter.Pending) return false;
        return undefined;
    }

    private loadList(): void {
        this.loading = true;
        const search = this.searchText?.trim() || undefined;
        const dateFrom = this.toDateOnly(this.filterDateFrom);
        const dateTo = this.toDateOnly(this.filterDateTo);
        const entryStatus = this.getEntryStatus();

        this.recordSvc.getCombinedReportPaginated(
            this.pageNumber, this.pageSize, search, dateFrom, dateTo, entryStatus
        ).subscribe({
            next: (res) => {
                this.records = res.datalist ?? [];
                this.totalRecords = res.pages?.Rows ?? 0;
                this.loading = false;
            },
            error: () => {
                this.records = [];
                this.totalRecords = 0;
                this.loading = false;
            }
        });
    }

    private reload(): void {
        this.pageNumber = 1;
        this.first = 0;
        if (!this.firstLazyLoadHandled) return;
        this.loadList();
    }

    onSearch(event: Event): void {
        this.searchText = (event.target as HTMLInputElement).value || '';
        this.searchSubject.next(this.searchText);
    }

    onFilterChange(): void {
        this.reload();
    }

    clearFilters(): void {
        this.searchText = '';
        this.filterDateFrom = null;
        this.filterDateTo = null;
        this.entryStatusFilter = EntryStatusFilter.All;
        this.reload();
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    @HostListener('document:click')
    closeExportDropdown(): void {
        this.exportDropdownOpen = false;
    }

    postedOutSvcId(r: PermanentPostingCombinedReportModel): string {
        const bn = this.lang === 'bn';
        const prefix = bn ? r.postedOutPrefixBN : r.postedOutPrefix;
        return prefix && r.postedOutServiceId ? `${prefix}-${r.postedOutServiceId}` : r.postedOutServiceId ?? '-';
    }

    relieverSvcId(r: PermanentPostingCombinedReportModel): string {
        const bn = this.lang === 'bn';
        const prefix = bn ? r.relieverPrefixBN : r.relieverPrefix;
        return prefix && r.relieverServiceId ? `${prefix}-${r.relieverServiceId}` : r.relieverServiceId ?? '-';
    }

    entryStatusText(r: PermanentPostingCombinedReportModel): string {
        const t = LABELS[this.lang];
        if (r.isAddedInNewJoineeDataEntry === true) return t['yes'];
        if (r.isAddedInNewJoineeDataEntry === false) return t['no'];
        return t['na'];
    }

    formatDisplay(v: string | null | undefined): string {
        if (!v) return '-';
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    private buildExportData(): { columns: string[]; rows: string[][] } {
        const t = LABELS[this.lang];
        const bn = this.lang === 'bn';
        const columns = [
            t['col.ser'], t['col.postedOutSvcId'], t['col.postedOutName'],
            t['col.relieverSvcId'], t['col.rank'], t['col.corps'], t['col.trade'], t['col.relieverName'],
            t['col.motherOrg'], t['col.motherOrgUnit'], t['col.memberType'],
            t['col.postingOrderDate'], t['col.entryStatus'],
        ];
        const rows = this.records.map((r, i) => [
            String(this.first + i + 1),
            this.postedOutSvcId(r),
            (bn ? r.postedOutNameBN : r.postedOutName) ?? '-',
            this.relieverSvcId(r),
            (bn ? r.rankNameBN : r.rankName) ?? '-',
            (bn ? r.corpsNameBN : r.corpsName) ?? '-',
            (bn ? r.tradeNameBN : r.tradeName) ?? '-',
            r.relieverNameBangla ?? '-',
            (bn ? r.motherOrgNameBN : r.motherOrgName) ?? '-',
            (bn ? r.motherOrgUnitNameBN : r.motherOrgUnitName) ?? '-',
            (bn ? r.memberTypeNameBN : r.memberTypeName) ?? '-',
            this.formatDisplay(r.postingOrderDate),
            this.entryStatusText(r),
        ]);
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        this.exporting = true;
        try {
            const { columns, rows } = this.buildExportData();
            const generated = new Date().toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: true, timeZoneName: 'short'
            });
            const config: ReportConfig = {
                title: LABELS[this.lang]['title'],
                lang: this.lang,
                columns,
                rows,
                showPageNumbers: true,
                filename: 'Posted_Out_Reliever_Report',
                landscape: true,
                filterLines: [`Generated: ${generated}`],
            };
            if (type === 'pdf') {
                await this.exportService.generatePDF(config);
            } else if (type === 'print') {
                this.exportService.exportPDF(config);
            } else if (type === 'word') {
                await this.exportService.exportWord(config);
            } else {
                this.exportService.exportExcel(config);
            }
        } finally {
            this.exporting = false;
        }
    }
}
