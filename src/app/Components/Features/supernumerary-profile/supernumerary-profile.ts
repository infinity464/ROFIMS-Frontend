import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Toast } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { EmployeeListService } from '@/services/employee-list.service';
import { SupernumeraryEmpProfile, AddressBlock } from '@/models/employee-list.model';

@Component({
    selector: 'app-supernumerary-profile',
    standalone: true,
    imports: [CommonModule, RouterModule, ButtonModule, TableModule, Toast, DialogModule],
    providers: [MessageService],
    templateUrl: './supernumerary-profile.html',
    styleUrl: './supernumerary-profile.scss'
})
export class SupernumeraryProfile implements OnInit {
    employeeId: number | null = null;
    profile: SupernumeraryEmpProfile | null = null;
    loading = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private employeeListService: EmployeeListService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id != null) {
            this.employeeId = +id;
            if (!isNaN(this.employeeId)) this.loadProfile();
            else this.onError('Invalid employee ID');
        } else {
            this.onError('Missing employee ID');
        }
    }

    loadProfile(): void {
        if (this.employeeId == null) return;
        this.loading = true;
        this.employeeListService.getSupernumeraryEmpProfile(this.employeeId).subscribe({
            next: (p) => {
                this.profile = p ?? null;
                this.loading = false;
            },
            error: (err) => {
                console.error('Failed to load profile', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load profile'
                });
                this.loading = false;
            }
        });
    }

    onError(message: string): void {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: message });
    }

    goBack(): void {
        this.router.navigate(['/supernumerary-list']);
    }

    relieverDialogVisible = false;
    relieverProfile: SupernumeraryEmpProfile | null = null;
    relieverProfileLoading = false;

    viewRelieverProfile(employeeId: number): void {
        this.relieverProfile = null;
        this.relieverDialogVisible = true;
        this.relieverProfileLoading = true;
        this.employeeListService.getSupernumeraryEmpProfile(employeeId).subscribe({
            next: (p) => {
                this.relieverProfile = p ?? null;
                this.relieverProfileLoading = false;
            },
            error: (err) => {
                console.error('Failed to load reliever profile', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load reliever profile'
                });
                this.relieverProfileLoading = false;
            }
        });
    }

    closeRelieverDialog(): void {
        this.relieverDialogVisible = false;
        this.relieverProfile = null;
    }

    /** True if address block exists and has at least one non-empty field. */
    hasAddress(addr: AddressBlock | null | undefined): boolean {
        if (!addr) return false;
        const keys: (keyof AddressBlock)[] = ['villageArea', 'district', 'postOffice', 'division', 'upazilaThana'];
        return keys.some((k) => addr[k] != null && String(addr[k]).trim() !== '');
    }

    formatDateOfJoining(value: string | null): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return value;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        } catch {
            return value;
        }
    }

    /** Single-line address for inline display; for section layout use address field getters below. */
    formatAddressLine(addr: AddressBlock | null | undefined): string {
        if (!addr) return '-';
        const parts = [addr.villageArea, addr.district, addr.postOffice, addr.division, addr.upazilaThana].filter(Boolean);
        return parts.length ? parts.join(', ') : '-';
    }

    addrVal(addr: AddressBlock | null | undefined, key: keyof AddressBlock): string {
        if (!addr) return '-';
        const v = addr[key];
        return v != null && v !== '' ? v : '-';
    }
}
