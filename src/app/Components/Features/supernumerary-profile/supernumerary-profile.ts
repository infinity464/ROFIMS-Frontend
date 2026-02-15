import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Toast } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { EmployeeListService } from '@/services/employee-list.service';
import { SupernumeraryEmpProfile, AddressBlock, RelieverRow } from '@/models/employee-list.model';

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

    /** Reliever table rows - use property instead of function for reliable p-table button clicks */
    relieverTableRows: Array<{ employeeID: number; serviceId: string | null; rank: string | null; corps: string | null; trade: string | null; name: string | null; wingBattalion: string | null; appointment: string | null }> = [];

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
                this.relieverTableRows = this.buildRelieverTableRows(p ?? null);
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

    /** Extract employeeID from row (handles camelCase and PascalCase from API). */
    getEmployeeId(row: { employeeID?: number; EmployeeID?: number }): number | null {
        const id = row?.employeeID ?? row?.['EmployeeID'];
        return typeof id === 'number' ? id : null;
    }

    /** Opens reliever profile modal when View is clicked. */
    onViewRelieverClick(row: { employeeID?: number; EmployeeID?: number }): void {
        const id = this.getEmployeeId(row);
        if (id != null) this.viewRelieverProfile(id);
    }

    viewRelieverProfile(employeeId: number): void {
        if (employeeId == null || typeof employeeId !== 'number') return;
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

    /** Build combined rows for reliever table: RelievedBy (if any) + Relievers. */
    private buildRelieverTableRows(profile: SupernumeraryEmpProfile | null): Array<{ employeeID: number; serviceId: string | null; rank: string | null; corps: string | null; trade: string | null; name: string | null; wingBattalion: string | null; appointment: string | null }> {
        const p = profile;
        if (!p) return [];
        const rows: Array<{ employeeID: number; serviceId: string | null; rank: string | null; corps: string | null; trade: string | null; name: string | null; wingBattalion: string | null; appointment: string | null }> = [];
        if (p.relievedBy) {
            rows.push({
                employeeID: p.relievedBy.employeeID ?? (p.relievedBy as any).EmployeeID,
                serviceId: p.relievedBy.serviceId ?? (p.relievedBy as any).ServiceId,
                rank: p.relievedBy.rank ?? (p.relievedBy as any).Rank ?? '-',
                corps: p.relievedBy.corps ?? (p.relievedBy as any).Corps ?? '-',
                trade: p.relievedBy.trade ?? (p.relievedBy as any).Trade ?? '-',
                name: p.relievedBy.name ?? (p.relievedBy as any).Name ?? '-',
                wingBattalion: p.relievedBy.wingBattalion ?? (p.relievedBy as any).WingBattalion ?? '-',
                appointment: p.relievedBy.appointment ?? (p.relievedBy as any).Appointment ?? '-'
            });
        }
        if (p.relievers?.length) {
            for (const r of p.relievers) {
                const a = r as RelieverRow & { EmployeeID?: number; ServiceId?: string; Rank?: string; Corps?: string; Trade?: string; Name?: string; WingBattalion?: string; Appointment?: string };
                rows.push({
                    employeeID: r.employeeID ?? a.EmployeeID ?? 0,
                    serviceId: (r.serviceId ?? a.ServiceId ?? '-') as string | null,
                    rank: (r.rank ?? a.Rank ?? '-') as string | null,
                    corps: (r.corps ?? a.Corps ?? '-') as string | null,
                    trade: (r.trade ?? a.Trade ?? '-') as string | null,
                    name: (r.name ?? a.Name ?? '-') as string | null,
                    wingBattalion: (r.wingBattalion ?? a.WingBattalion ?? '-') as string | null,
                    appointment: (r.appointment ?? a.Appointment ?? '-') as string | null
                });
            }
        }
        return rows;
    }
}
