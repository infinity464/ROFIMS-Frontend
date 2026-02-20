import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '@/Core/Environments/environment';
import { SharedService } from '@/shared/services/shared-service';
import { LeaveApplicationService, LeaveApplicationModel } from '@/services/leave-application.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { FluidModule } from 'primeng/fluid';
import { TabsModule } from 'primeng/tabs';
import { RouterModule } from '@angular/router';

export type LeaveApplicationSection = 'pending' | 'approved' | 'declined';

@Component({
    selector: 'app-leave-application-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        DialogModule,
        TextareaModule,
        ToastModule,
        FluidModule,
        TabsModule,
        RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-application-list.component.html',
    styleUrl: './leave-application-list.component.scss'
})
export class LeaveApplicationListComponent implements OnInit {
    @Input() sectionInput: LeaveApplicationSection | null = null;
    section: LeaveApplicationSection = 'pending';
    tabIndex = 0;

    pendingList: LeaveApplicationModel[] = [];
    approvedList: LeaveApplicationModel[] = [];
    declinedList: LeaveApplicationModel[] = [];
    loading = false;
    currentUserEmployeeId = 0;

    showRemarkDialog = false;
    remarkAction: 'approve' | 'decline' | null = null;
    remarkText = '';
    selectedRow: LeaveApplicationModel | null = null;

    private api = `${environment.apis.core}/LeaveApplication`;

    statusLabels: Record<number, string> = {
        1: 'Draft',
        2: 'Pending',
        3: 'Approved',
        4: 'Declined'
    };

    constructor(
        private http: HttpClient,
        private sharedService: SharedService,
        private leaveAppService: LeaveApplicationService,
        private identityMappingService: IdentityUserMappingService,
        private messageService: MessageService,
        private router: Router,
        private route: ActivatedRoute
    ) {}

    ngOnInit(): void {
        const userId = this.sharedService.getCurrentUserId?.();
        this.route.queryParams.subscribe((params) => {
            this.applySectionFromParams(params);
            this.loadSection();
        });
        if (userId) {
            this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
                next: (empId) => {
                    if (empId) this.currentUserEmployeeId = empId;
                    this.loadSection();
                }
            });
        }
    }

    private applySectionFromParams(params: Record<string, string | string[] | undefined>): void {
        const s = params['section'] as LeaveApplicationSection | undefined;
        if (s && ['pending', 'approved', 'declined'].includes(s)) this.section = s;
        else if (this.sectionInput) this.section = this.sectionInput;
        this.tabIndex = ['pending', 'approved', 'declined'].indexOf(this.section);
        if (this.tabIndex < 0) this.tabIndex = 0;
    }

    loadSection(): void {
        this.loading = true;
        const onError = () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load list.' });
            this.loading = false;
        };
        const statusMap = { pending: 2, approved: 3, declined: 4 } as const;
        const statusId = statusMap[this.section];
        this.leaveAppService.getByStatusForUser(statusId, this.currentUserEmployeeId).subscribe({
            next: (list) => {
                if (this.section === 'pending') this.pendingList = list;
                else if (this.section === 'approved') this.approvedList = list;
                else this.declinedList = list;
                this.loading = false;
            },
            error: () => {
                if (this.section === 'pending') this.pendingList = [];
                else if (this.section === 'approved') this.approvedList = [];
                else this.declinedList = [];
                onError();
            }
        });
    }

    statusLabel(row: LeaveApplicationModel): string {
        return this.statusLabels[row.leaveApplicationStatusId] ?? '-';
    }

    formatDate(d: string | null | undefined): string {
        if (!d) return '-';
        try {
            const dt = new Date(d);
            return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return d;
        }
    }

    onTabChangeByValue(value: number | string | undefined): void {
        const idx = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : 0;
        const tabIdx = !isNaN(idx) && idx >= 0 ? idx : 0;
        this.tabIndex = tabIdx;
        const s = ['pending', 'approved', 'declined'][tabIdx] as LeaveApplicationSection;
        this.section = s;
        this.router.navigate([], { queryParams: { section: s }, queryParamsHandling: 'merge' });
        this.loadSection();
    }

    goToSection(s: LeaveApplicationSection): void {
        this.section = s;
        this.router.navigate([], { queryParams: { section: s }, queryParamsHandling: 'merge' });
        this.loadSection();
    }

    openRemarkDialog(row: LeaveApplicationModel, action: 'approve' | 'decline'): void {
        this.selectedRow = row;
        this.remarkAction = action;
        this.remarkText = '';
        this.showRemarkDialog = true;
    }

    submitRemark(): void {
        if (!this.selectedRow || !this.remarkAction) return;
        const obs =
            this.remarkAction === 'approve'
                ? this.leaveAppService.approve(this.selectedRow.leaveApplicationId, this.currentUserEmployeeId, this.remarkText)
                : this.leaveAppService.decline(this.selectedRow.leaveApplicationId, this.currentUserEmployeeId, this.remarkText);
        obs.subscribe({
            next: (res) => {
                const code = res.statusCode ?? res.StatusCode ?? 0;
                const msg = res.description ?? res.Description ?? '';
                if (code === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Action completed.' });
                    this.showRemarkDialog = false;
                    this.selectedRow = null;
                    this.remarkAction = null;
                    this.loadSection();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Notice', detail: msg || 'Action failed.' });
                }
            },
            error: (err) => {
                const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Request failed.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            }
        });
    }

    /** Only the final approver can approve or decline. */
    isPendingForMe(row: LeaveApplicationModel): boolean {
        return row.leaveApplicationStatusId === 2 && row.finalApproverId === this.currentUserEmployeeId;
    }
}
