import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { DialogModule } from 'primeng/dialog';
import { PostingService } from '@/services/posting.service';
import { PostingOrderMasterDto, PostingOrderMasterWithDetailsDto } from '@/models/posting.model';

@Component({
    selector: 'app-posting-order-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        Toast,
        TooltipModule,
        TagModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        DialogModule
    ],
    providers: [MessageService],
    templateUrl: './posting-order-list.html',
    styleUrl: './posting-order-list.scss'
})
export class PostingOrderListComponent implements OnInit {
    orders: PostingOrderMasterDto[] = [];
    loading = false;

    /** Detail dialog */
    showDetailDialog = false;
    detailLoading = false;
    selectedOrder: PostingOrderMasterWithDetailsDto | null = null;

    constructor(
        private postingService: PostingService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadOrders();
    }

    loadOrders(): void {
        this.loading = true;
        this.postingService.getPostingOrderMasters().subscribe({
            next: (data) => {
                this.orders = data ?? [];
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load posting orders.' });
            }
        });
    }

    viewDetails(order: PostingOrderMasterDto): void {
        this.showDetailDialog = true;
        this.detailLoading = true;
        this.selectedOrder = null;

        this.postingService.getPostingOrderById(order.id).subscribe({
            next: (data) => {
                this.selectedOrder = data;
                this.detailLoading = false;
            },
            error: () => {
                this.detailLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load posting order details.' });
            }
        });
    }

    getStatusSeverity(status: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" {
        switch (status?.toLowerCase()) {
            case 'approved': return 'success';
            case 'draft': return 'warn';
            case 'cancelled': return 'danger';
            default: return 'info';
        }
    }

    postingTypeLabel(type: string): string {
        switch (type) {
            case 'NewPosting': return 'New Posting';
            case 'InterPosting': return 'Inter Posting';
            default: return type || '-';
        }
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return String(value);
        }
    }

    onGlobalFilter(table: any, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }
}
