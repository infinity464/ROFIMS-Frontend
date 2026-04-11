import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Table, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PostingService } from '@/services/posting.service';
import { PendingPostingJoiningDto } from '@/models/posting.model';

@Component({
    selector: 'app-pending-inter-posting-joining',
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
        Toast
    ],
    providers: [MessageService],
    templateUrl: './pending-inter-posting-joining.html',
    styleUrl: './pending-inter-posting-joining.scss'
})
export class PendingInterPostingJoiningComponent implements OnInit {
    allRows: PendingPostingJoiningDto[] = [];
    rows: PendingPostingJoiningDto[] = [];
    loading = false;

    // Filter options
    noteSheetOptions: { label: string; value: string | null }[] = [];
    motherOrgOptions: { label: string; value: string | null }[] = [];
    postingOrderOptions: { label: string; value: string | null }[] = [];
    transferUnitOptions: { label: string; value: string | null }[] = [];

    // Selected filters
    noteSheetFilter: string | null = null;
    motherOrgFilter: string | null = null;
    postingOrderFilter: string | null = null;
    transferUnitFilter: string | null = null;

    constructor(
        private postingService: PostingService,
        private router: Router,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadPending();
    }

    loadPending(): void {
        this.loading = true;
        this.postingService.getPendingPostingJoining('InterPosting').subscribe({
            next: (data) => {
                this.allRows = data ?? [];
                this.buildFilterOptions();
                this.applyFilters();
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load pending inter-posting joining list.'
                });
            }
        });
    }

    private buildFilterOptions(): void {
        const unique = (arr: (string | null | undefined)[]) =>
            [...new Set(arr.filter((v): v is string => !!v))].sort();

        this.noteSheetOptions = [
            { label: 'All NoteSheets', value: null },
            ...unique(this.allRows.map(r => r.noteSheetNo)).map(v => ({ label: v, value: v }))
        ];
        this.motherOrgOptions = [
            { label: 'All Mother Organizations', value: null },
            ...unique(this.allRows.map(r => r.motherOrganization)).map(v => ({ label: v, value: v }))
        ];
        this.postingOrderOptions = [
            { label: 'All Posting Orders', value: null },
            ...unique(this.allRows.map(r => r.postingOrderNo)).map(v => ({ label: v, value: v }))
        ];
        this.transferUnitOptions = [
            { label: 'All Transfer Units', value: null },
            ...unique(this.allRows.map(r => r.transferRabUnitName)).map(v => ({ label: v, value: v }))
        ];
    }

    applyFilters(): void {
        this.rows = this.allRows.filter(r => {
            if (this.noteSheetFilter && r.noteSheetNo !== this.noteSheetFilter) return false;
            if (this.motherOrgFilter && r.motherOrganization !== this.motherOrgFilter) return false;
            if (this.postingOrderFilter && r.postingOrderNo !== this.postingOrderFilter) return false;
            if (this.transferUnitFilter && r.transferRabUnitName !== this.transferUnitFilter) return false;
            return true;
        });
    }

    clearFilters(): void {
        this.noteSheetFilter = null;
        this.motherOrgFilter = null;
        this.postingOrderFilter = null;
        this.transferUnitFilter = null;
        this.applyFilters();
    }

    goToReceive(): void {
        this.router.navigate(['/posting/posting-order-receive']);
    }

    openPostingOrder(row: PendingPostingJoiningDto): void {
        if (row.postingOrderMasterId) {
            this.router.navigate(['/posting/posting-order-preview'], {
                queryParams: { id: row.postingOrderMasterId }
            });
        }
    }

    openProfile(row: PendingPostingJoiningDto): void {
        if (row.employeeId) {
            window.open(`/members/profile/${row.employeeId}`, '_blank');
        }
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        const d = new Date(value);
        return isNaN(d.getTime())
            ? String(value)
            : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    onGlobalFilter(table: Table, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }
}
