import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { encodeOrderId } from '@/shared/utils/order-id-codec';
import { UserMenuService } from '@/services/user-menu.service';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { PostingService } from '@/services/posting.service';
import { PostingOrderMasterDto } from '@/models/posting.model';

@Component({
    selector: 'app-posting-order-list',
    standalone: true,
    imports: [
        CommonModule,
        TableModule,
        ButtonModule,
        Toast,
        TooltipModule,
        TagModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule
    ],
    providers: [MessageService],
    templateUrl: './posting-order-list.html',
    styleUrl: './posting-order-list.scss'
})
export class PostingOrderListComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    orders: PostingOrderMasterDto[] = [];
    loading = false;

    constructor(
        private postingService: PostingService,
        private router: Router,
        private messageService: MessageService,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadOrders();
    }

    loadOrders(): void {
        this.loading = true;
        this.postingService.getPostingOrderMasters().subscribe({
            next: (data) => {
                this.orders = data ?? [];
                this.loading = false;
            },
            error: (err: any) => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load posting orders.' });
            }
        });
    }

    viewPreview(order: PostingOrderMasterDto): void {
        this.router.navigate(['/posting/posting-order-preview'], { queryParams: { id: encodeOrderId(order.id) } });
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
