import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
import { ExBdLeaveClearanceService, ExBdLeaveClearanceDto } from '@/services/ex-bd-leave-clearance.service';

@Component({
    selector: 'app-clearance-ex-bd-leave-list',
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
    templateUrl: './clearance-ex-bd-leave-list.html',
    styleUrl: './clearance-ex-bd-leave-list.scss'
})
export class ClearanceExBdLeaveListComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    orders: ExBdLeaveClearanceDto[] = [];
    loading = false;

    constructor(
        private clearanceService: ExBdLeaveClearanceService,
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
        this.clearanceService.getClearanceMasters().subscribe({
            next: (data) => {
                this.orders = data ?? [];
                this.loading = false;
            },
            error: (err: any) => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load clearances.' });
            }
        });
    }

    generateClearance(): void {
        this.router.navigate(['/clearance-ex-bd-leave/generate']);
    }

    viewPreview(order: ExBdLeaveClearanceDto): void {
        this.router.navigate(['/clearance-ex-bd-leave/preview'], { queryParams: { id: order.id } });
    }

    editClearance(order: ExBdLeaveClearanceDto): void {
        this.router.navigate(['/clearance-ex-bd-leave/generate'], { queryParams: { id: order.id } });
    }

    getStatusSeverity(status: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" {
        switch (status?.toLowerCase()) {
            case 'approved': return 'success';
            case 'draft': return 'warn';
            case 'cancelled': return 'danger';
            default: return 'info';
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
