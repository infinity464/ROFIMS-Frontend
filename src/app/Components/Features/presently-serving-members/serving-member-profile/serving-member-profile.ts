import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { forkJoin } from 'rxjs';
import { ServingMembersService } from '@/services/serving-members.service';
import { FamilyInfoService, FamilyInfoByEmployeeView } from '@/services/family-info-service';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';

@Component({
    selector: 'app-serving-member-profile',
    standalone: true,
    imports: [CommonModule, RouterModule, ButtonModule, TableModule, Toast],
    providers: [MessageService],
    templateUrl: './serving-member-profile.html',
    styleUrl: './serving-member-profile.scss'
})
export class ServingMemberProfile implements OnInit {
    employeeId: number | null = null;
    profile: EmployeePersonalServiceOverview | null = null;
    familyList: FamilyInfoByEmployeeView[] = [];
    loading = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private servingMembersService: ServingMembersService,
        private familyInfoService: FamilyInfoService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('employeeId');
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
        forkJoin({
            profile: this.servingMembersService.getEmployeePersonalServiceOverview(this.employeeId),
            family: this.familyInfoService.getFamilyInfoByEmployeeView(this.employeeId)
        }).subscribe({
            next: ({ profile, family }) => {
                this.profile = profile;
                this.familyList = family ?? [];
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

    goBack(): void {
        this.router.navigate(['/presently-serving-members']);
    }

    private onError(message: string): void {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: message });
        this.loading = false;
    }

    /** Same format as supernumerary-profile: dd-mm-yyyy */
    formatDateShort(value: string | null): string {
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

    val(v: string | number | null | undefined): string {
        if (v == null || v === '') return '-';
        return String(v);
    }

    tradeDisplay(p: EmployeePersonalServiceOverview | null): string {
        if (!p) return '-';
        const t = p.trade?.trim();
        const r = p.tradeRemarks?.trim();
        if (t) return t;
        if (r) return `N/A (${r})`;
        return '-';
    }

    heightDisplay(p: EmployeePersonalServiceOverview | null): string {
        if (!p || p.height == null) return '-';
        return `${p.height} Inch`;
    }

    weightDisplay(p: EmployeePersonalServiceOverview | null): string {
        if (!p || p.weight == null) return '-';
        return `${p.weight} lbs`;
    }

    /** Date of Birth for family table: dd-mm-yyyy. */
    formatFamilyDob(value: string | null): string {
        return this.formatDateShort(value);
    }

    familyMobile(row: FamilyInfoByEmployeeView): string {
        return this.val(row.mobileNo);
    }
}
