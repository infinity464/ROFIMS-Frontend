import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription, firstValueFrom } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { UserMenuService } from '@/services/user-menu.service';
import { PermanentPostingJoineeDetailService, PermanentPostingJoineeDetailListModel, PermanentPostingJoineeDetailFilterRequest } from '@/services/permanent-posting-joinee-detail.service';
import { EmpService } from '@/services/emp-service';
import { ExportService, ReportConfig } from '@/services/export.service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

enum JoineeFilter { All = 'all', Added = 'added', NotAdded = 'notAdded' }

const LABELS: Record<string, Record<string, string>> = {
    en: {
        'title': 'New Joining Person List',
        'col.ser': '#',
        'col.parentRecord': 'Parent Record',
        'col.linkStatus': 'Link Status',
        'col.postedOut': 'Posted Out Person',
        'col.motherOrg': 'Mother Org',
        'col.motherOrgUnit': 'Mother Org Unit',
        'col.memberType': 'Member Type',
        'col.prefix': 'Prefix',
        'col.rank': 'Rank',
        'col.corps': 'Corps',
        'col.trade': 'Trade',
        'col.serviceId': 'Service ID',
        'col.name': 'Name (Bangla)',
        'col.joiningOrderNo': 'Joining Order No',
        'col.joiningDate': 'Joining Order Date',
        'col.possibleJoining': 'Possible Joining Date',
        'col.joiningOrderCopy': 'Joining Order Copy',
        'col.added': 'Entry Added',
        'col.actions': 'Actions',
        'yes': 'Yes',
        'no': 'Pending',
        'standalone': 'Standalone',
        'linked': 'Linked',
        'export': 'Export',
        'fromDate': 'From Date',
        'toDate': 'To Date',
    },
    bn: {
        'title': 'নতুন যোগদানকারী ব্যক্তির তালিকা',
        'col.ser': 'ক্রম',
        'col.parentRecord': 'প্যারেন্ট রেকর্ড',
        'col.linkStatus': 'লিংক স্ট্যাটাস',
        'col.postedOut': 'পোস্টেড আউট ব্যক্তি',
        'col.motherOrg': 'মাদার অর্গ',
        'col.motherOrgUnit': 'মাদার অর্গ ইউনিট',
        'col.memberType': 'সদস্য ধরন',
        'col.prefix': 'প্রিফিক্স',
        'col.rank': 'র‍্যাংক',
        'col.corps': 'কোর',
        'col.trade': 'ট্রেড',
        'col.serviceId': 'সার্ভিস আইডি',
        'col.name': 'নাম (বাংলা)',
        'col.joiningOrderNo': 'যোগদান আদেশ নম্বর',
        'col.joiningDate': 'যোগদান আদেশ তারিখ',
        'col.possibleJoining': 'সম্ভাব্য যোগদান তারিখ',
        'col.joiningOrderCopy': 'যোগদান আদেশ কপি',
        'col.added': 'এন্ট্রি সম্পন্ন',
        'col.actions': 'কার্যক্রম',
        'yes': 'হ্যাঁ',
        'no': 'পেন্ডিং',
        'standalone': 'স্বতন্ত্র',
        'linked': 'লিংকড',
        'export': 'রপ্তানি',
        'fromDate': 'শুরু তারিখ',
        'toDate': 'শেষ তারিখ',
    },
};

@Component({
    selector: 'app-new-joining-person-list',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, TooltipModule, SelectModule, Toast, ConfirmDialog, DatePickerModule, InputTextModule, IconFieldModule, InputIconModule, FlexibleDateDirective],
    providers: [MessageService, ConfirmationService],
    templateUrl: './new-joining-person-list.html',
    styleUrl: './new-joining-person-list.scss'
})
export class NewJoiningPersonListComponent implements OnInit, OnDestroy {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canUpdate = true;
    canDelete = true;

    records: PermanentPostingJoineeDetailListModel[] = [];
    totalRecords = 0;
    loading = false;

    /** Pagination */
    first = 0;
    pageSize = 10;
    pageNumber = 1;

    /** Filters */
    searchText = '';
    filterDateFrom: Date | null = null;
    filterDateTo: Date | null = null;

    readonly JoineeFilter = JoineeFilter;
    joineeFilter = JoineeFilter.NotAdded;
    joineeFilterOptions = [
        { label: 'All Records',       value: JoineeFilter.All },
        { label: 'Entry Completed',   value: JoineeFilter.Added },
        { label: 'Entry Pending',     value: JoineeFilter.NotAdded },
    ];

    lang: 'en' | 'bn' = 'en';
    L = LABELS;
    exportDropdownOpen = false;
    exporting = false;

    private searchSubject = new Subject<string>();
    private searchSub?: Subscription;
    private firstLazyLoadHandled = false;

    constructor(
        private detailSvc: PermanentPostingJoineeDetailService,
        private empService: EmpService,
        private exportService: ExportService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        const perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canUpdate = perms.canUpdate;
        this.canDelete = perms.canDelete;
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

    private toDateOnly(d: Date | null): string | null {
        if (!d) return null;
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    private buildFilter(): PermanentPostingJoineeDetailFilterRequest {
        const filter: PermanentPostingJoineeDetailFilterRequest = {};
        if (this.searchText?.trim()) filter.searchText = this.searchText.trim();
        if (this.joineeFilter === JoineeFilter.Added) filter.isAddedInNewJoineeDataEntry = true;
        else if (this.joineeFilter === JoineeFilter.NotAdded) filter.isAddedInNewJoineeDataEntry = false;
        if (this.filterDateFrom) filter.dateFrom = this.toDateOnly(this.filterDateFrom);
        if (this.filterDateTo) filter.dateTo = this.toDateOnly(this.filterDateTo);
        return filter;
    }

    private loadList(): void {
        this.loading = true;
        this.detailSvc.getPaginatedFiltered({
            pagination: { page_no: this.pageNumber, row_per_page: this.pageSize },
            filter: this.buildFilter()
        }).subscribe({
            next: (res) => {
                this.records = res.datalist ?? [];
                this.totalRecords = res.pages?.rows ?? 0;
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
        this.joineeFilter = JoineeFilter.NotAdded;
        this.reload();
    }

    onEdit(row: PermanentPostingJoineeDetailListModel): void {
        this._router.navigate(['/posting/permanent-posting-mo-record'], { queryParams: { joineeId: row.id } });
    }

    onDelete(row: PermanentPostingJoineeDetailListModel): void {
        this.confirmationService.confirm({
            message: `Delete joinee record #${row.id}?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.detailSvc.delete(row.id).subscribe({
                    next: () => { this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Joinee record deleted.' }); this.loadList(); },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed.' })
                });
            }
        });
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    @HostListener('document:click')
    closeExportDropdown(): void {
        this.exportDropdownOpen = false;
    }

    private buildExportData(allRecords: PermanentPostingJoineeDetailListModel[]): { columns: string[]; rows: string[][] } {
        const t = LABELS[this.lang];
        const bn = this.lang === 'bn';
        const columns = [
            t['col.ser'], t['col.motherOrg'], t['col.motherOrgUnit'], t['col.memberType'],
            t['col.rank'], t['col.corps'], t['col.trade'],
            t['col.serviceId'], t['col.name'],
            t['col.joiningOrderNo'], t['col.joiningDate'], t['col.possibleJoining'],
            t['col.added'],
        ];
        const rows = allRecords.map((r, i) => [
            String(i + 1),
            (bn ? r.motherOrgNameBN : r.motherOrgName) ?? '-',
            (bn ? r.motherOrgUnitNameBN : r.motherOrgUnitName) ?? '-',
            (bn ? r.memberTypeNameBN : r.memberTypeName) ?? '-',
            (bn ? r.rankNameBN : r.rankName) ?? '-',
            (bn ? r.corpsNameBN : r.corpsName) ?? '-',
            (bn ? r.tradeNameBN : r.tradeName) ?? '-',
            r.prefixName && r.serviceId ? r.prefixName + '-' + r.serviceId : r.serviceId ?? '-',
            r.nameBangla ?? '-',
            r.joiningOrderNo ?? '-',
            this.formatDisplay(r.joiningOrderDate),
            this.formatDisplay(r.possibleJoiningDate),
            r.isAddedInNewJoineeDataEntry ? t['yes'] : t['no'],
        ]);
        return { columns, rows };
    }

    private getExportTimestamp(): string {
        return new Date().toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true, timeZoneName: 'short'
        });
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        this.exporting = true;
        try {
            // Fetch ALL records from server, then apply current filters client-side
            const allData = await firstValueFrom(this.detailSvc.getAllList());
            const allRecords = this.applyClientFilter(allData);
            const { columns, rows } = this.buildExportData(allRecords);
            const config: ReportConfig = {
                title: LABELS[this.lang]['title'],
                lang: this.lang,
                columns,
                rows,
                showPageNumbers: true,
                filename: 'New_Joining_Person_List',
                landscape: true,
                filterLines: [`Generated: ${this.getExportTimestamp()}`],
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

    private applyClientFilter(data: PermanentPostingJoineeDetailListModel[]): PermanentPostingJoineeDetailListModel[] {
        let list = data;
        if (this.joineeFilter === JoineeFilter.Added) list = list.filter(r => r.isAddedInNewJoineeDataEntry);
        else if (this.joineeFilter === JoineeFilter.NotAdded) list = list.filter(r => !r.isAddedInNewJoineeDataEntry);
        if (this.filterDateFrom) {
            const from = new Date(this.filterDateFrom); from.setHours(0, 0, 0, 0);
            list = list.filter(r => r.joiningOrderDate && new Date(r.joiningOrderDate) >= from);
        }
        if (this.filterDateTo) {
            const to = new Date(this.filterDateTo); to.setHours(23, 59, 59, 999);
            list = list.filter(r => r.joiningOrderDate && new Date(r.joiningOrderDate) <= to);
        }
        if (this.searchText?.trim()) {
            const term = this.searchText.trim().toLowerCase();
            list = list.filter(r =>
                (r.serviceId?.toLowerCase().includes(term)) ||
                (r.nameBangla?.toLowerCase().includes(term)) ||
                (r.joiningOrderNo?.toLowerCase().includes(term)) ||
                (r.motherOrgName?.toLowerCase().includes(term)) ||
                (r.motherOrgUnitName?.toLowerCase().includes(term))
            );
        }
        return list;
    }

    parseFileRefs(json: string | null): { fileId: number; fileName: string }[] {
        if (!json) return [];
        try { return JSON.parse(json); } catch { return []; }
    }

    onDownloadFile(fileId: number, fileName: string): void {
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, fileName || 'download'),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    formatDisplay(v: string | null | undefined): string {
        if (!v) return '-';
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
}
