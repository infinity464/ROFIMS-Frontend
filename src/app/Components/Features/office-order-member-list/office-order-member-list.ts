import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { encodeOrderId } from '@/shared/utils/order-id-codec';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { OfficeOrderService } from '@/services/office-order.service';
import { OfficeOrderMemberRowDto, OfficeOrderMemberRowFilter } from '@/models/office-order.model';
import { ApprovalStatus, OrderFormat, SubjectCategoryOptions } from '@/models/enums';

/** Value of the NoteSheet filter option that matches orders generated without a note sheet. */
const WITHOUT_NOTE_SHEET = '__none__';
/** Filter value matching a null Order Type / Subject Category — shown as "General". */
const GENERAL = '__general__';

/**
 * Office orders listed member-wise: one row per member of each office order
 * (same layout as the pending-joining lists). Members come from the linked note
 * sheet, or from the order itself when it was generated without one.
 */
@Component({
    selector: 'app-office-order-member-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        TooltipModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        SelectModule,
        TagModule,
        Toast
    ],
    providers: [MessageService],
    templateUrl: './office-order-member-list.html',
    styleUrl: './office-order-member-list.scss'
})
export class OfficeOrderMemberListComponent implements OnInit, OnDestroy {
    readonly ApprovalStatus = ApprovalStatus;

    /** Current page only — paging, filters and search all run server-side. */
    rows: OfficeOrderMemberRowDto[] = [];
    totalRecords = 0;
    first = 0;
    pageSize = 15;
    loading = false;
    /** Dropdown options are fetched once (with the first page) and on Reload. */
    private optionsLoaded = false;

    // Filter options
    letterNoOptions: { label: string; value: string | null }[] = [];
    noteSheetOptions: { label: string; value: string | null }[] = [];
    motherOrgOptions: { label: string; value: string | null }[] = [];
    readonly orderFormatOptions = [
        { label: 'General', value: GENERAL },
        { label: 'Formal', value: OrderFormat.Formal },
        { label: 'Clearance (DAD and Others)', value: OrderFormat.Clearance }
    ];
    readonly subjectCategoryOptions = [
        { label: 'General', value: GENERAL },
        ...SubjectCategoryOptions
    ];
    readonly approvalOptions = [
        { label: 'Approved', value: ApprovalStatus.Approve },
        { label: 'Pending', value: ApprovalStatus.Pending },
        { label: 'Cancelled', value: ApprovalStatus.Cancel }
    ];

    // Selected filters
    letterNoFilter: string | null = null;
    noteSheetFilter: string | null = null;
    motherOrgFilter: string | null = null;
    orderFormatFilter: string | null = null;
    subjectCategoryFilter: string | null = null;
    approvalFilter: string | null = null;
    searchText = '';
    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private officeOrderService: OfficeOrderService,
        private router: Router,
        private messageService: MessageService
    ) {}

    /** The lazy table fires onLazyLoad for the first page, so nothing to load here. */
    ngOnInit(): void {}

    ngOnDestroy(): void {
        if (this.searchTimer) clearTimeout(this.searchTimer);
    }

    /** PrimeNG lazy load: fetch the requested page (access-scoped server-side). */
    onLazyLoad(event: TableLazyLoadEvent): void {
        this.pageSize = event.rows ?? this.pageSize;
        this.first = event.first ?? 0;
        this.fetchPage();
    }

    private fetchPage(): void {
        const pageNo = Math.floor(this.first / this.pageSize) + 1;
        const includeOptions = !this.optionsLoaded;
        this.loading = true;
        this.officeOrderService.getOfficeOrderMemberRowsPaged(pageNo, this.pageSize, this.buildFilter(), includeOptions).subscribe({
            next: (res) => {
                this.rows = res?.datalist ?? [];
                this.totalRecords = res?.pages?.rows ?? 0;
                if (includeOptions && res?.options) {
                    this.buildFilterOptions(res.options);
                    this.optionsLoaded = true;
                }
                this.loading = false;
            },
            error: (err: any) => {
                this.loading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load office order members.'
                });
            }
        });
    }

    private buildFilter(): OfficeOrderMemberRowFilter {
        return {
            letterNo: this.letterNoFilter,
            noteSheetNo: this.noteSheetFilter,
            motherOrganization: this.motherOrgFilter,
            orderFormat: this.orderFormatFilter,
            subjectCategory: this.subjectCategoryFilter,
            approvalStatus: this.approvalFilter,
            search: this.searchText.trim() || null
        };
    }

    private buildFilterOptions(options: { letterNos: string[]; noteSheetNos: string[]; motherOrganizations: string[] }): void {
        const toOptions = (arr: string[] | null | undefined) => (arr ?? []).map(v => ({ label: v, value: v }));
        this.letterNoOptions = toOptions(options.letterNos);
        this.noteSheetOptions = [
            { label: 'Without Note Sheet', value: WITHOUT_NOTE_SHEET },
            ...toOptions(options.noteSheetNos)
        ];
        this.motherOrgOptions = toOptions(options.motherOrganizations);
    }

    /** Any filter change → back to page 1. */
    applyFilters(): void {
        this.first = 0;
        this.fetchPage();
    }

    /** Debounced so typing doesn't fire a request per keystroke. */
    onSearch(event: Event): void {
        this.searchText = (event.target as HTMLInputElement).value;
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.applyFilters(), 400);
    }

    /** Refresh the current page and the dropdown options. */
    reload(): void {
        this.optionsLoaded = false;
        this.fetchPage();
    }

    get hasFilters(): boolean {
        return !!(this.letterNoFilter || this.noteSheetFilter || this.motherOrgFilter || this.orderFormatFilter
            || this.subjectCategoryFilter || this.approvalFilter || this.searchText.trim());
    }

    clearFilters(): void {
        this.letterNoFilter = null;
        this.noteSheetFilter = null;
        this.motherOrgFilter = null;
        this.orderFormatFilter = null;
        this.subjectCategoryFilter = null;
        this.approvalFilter = null;
        this.searchText = '';
        this.applyFilters();
    }

    /** Open the office order preview the row belongs to. */
    openOfficeOrder(row: OfficeOrderMemberRowDto): void {
        this.router.navigate(['/office-order/preview'], {
            queryParams: { id: encodeOrderId(row.officeOrderId) }
        });
    }

    /** Open employee profile in a new tab. */
    openProfile(row: OfficeOrderMemberRowDto): void {
        if (row.employeeId) {
            window.open(`/members/profile/${row.employeeId}`, '_blank');
        }
    }

    /** Order Type label; no format → General. */
    orderFormatLabel(value: string | null | undefined): string {
        if (!value) return 'General';
        return value === OrderFormat.Clearance ? 'Clearance (DAD and Others)' : value;
    }

    /** Subject Category label; no category → General. */
    subjectCategoryLabel(value: string | null | undefined): string {
        return value || 'General';
    }

    approvalStatusLabel(status: string | null | undefined): string {
        switch (status) {
            case ApprovalStatus.Approve: return 'Approved';
            case ApprovalStatus.Pending: return 'Pending';
            case ApprovalStatus.Cancel: return 'Cancelled';
            default: return '-';
        }
    }

    approvalStatusSeverity(status: string | null | undefined): 'success' | 'warn' | 'danger' | 'secondary' {
        switch (status) {
            case ApprovalStatus.Approve: return 'success';
            case ApprovalStatus.Pending: return 'warn';
            case ApprovalStatus.Cancel: return 'danger';
            default: return 'secondary';
        }
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }
}
