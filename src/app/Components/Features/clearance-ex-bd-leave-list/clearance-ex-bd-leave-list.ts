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
import { SharedService } from '@/shared/services/shared-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';

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
    allowedMemberTypeIds: number[] | null = null;

    constructor(
        private clearanceService: ExBdLeaveClearanceService,
        private router: Router,
        private messageService: MessageService,
        private _userMenuService: UserMenuService,
        private sharedService: SharedService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadCurrentUserMemberTypePermissions();

        this.loadOrders();
    }

    /** Resolve the current user's accessible member type ids (cache first, then always refetch). */
    private loadCurrentUserMemberTypePermissions(): void {
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) { this.allowedMemberTypeIds = null; return; }
        this.allowedMemberTypeIds = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        this.memberTypeAccess.cacheForUser(userId).subscribe({
            next: (ids) => { this.allowedMemberTypeIds = Array.isArray(ids) ? ids : []; },
            error: () => { /* keep cached value */ }
        });
    }

    loadOrders(): void {
        this.loading = true;
        this.clearanceService.getClearanceMasters().subscribe({
            next: (data) => {
                // Scope to the user's accessible member types (via the linked note-sheet's EmployeeTypeIds).
                this.orders = (data ?? []).filter((o) => this.memberTypeAccess.isAccessible(o.employeeTypeIds, this.allowedMemberTypeIds));
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
        switch (status) {
            case 'approve': return 'success';
            case 'cancel': return 'danger';
            case 'pending':
            default: return 'warn';
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
