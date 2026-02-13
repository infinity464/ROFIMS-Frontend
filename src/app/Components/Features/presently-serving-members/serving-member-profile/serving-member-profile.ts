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
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { BankAccInfoService, BankAccInfoByEmployeeView } from '@/services/bank-acc-info-service';
import { EducationInfoService, EducationInfoByEmployeeView } from '@/services/education-info-service';
import { ForeignVisitInfoService, ForeignVisitInfoByEmployeeView } from '@/services/foreign-visit-info.service';
import { LeaveInfoService, LeaveInfoByEmployeeView, LeaveInfoSummaryItem } from '@/services/leave-info.service';
import { AdditionalRemarksInfoService, AdditionalRemarksInfo } from '@/services/additional-remarks-info.service';
import { DisciplineInfoService, DisciplineInfoByEmployeeView } from '@/services/discipline-info.service';
import { CourseInfoService, CourseInfoByEmployeeView } from '@/services/course-info-service';
import { PromotionInfoService, PromotionInfoByEmployeeView } from '@/services/promotion-info.service';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-serving-member-profile',
    standalone: true,
    imports: [CommonModule, RouterModule, ButtonModule, TableModule, Toast, DialogModule, TooltipModule],
    providers: [MessageService],
    templateUrl: './serving-member-profile.html',
    styleUrl: './serving-member-profile.scss'
})
export class ServingMemberProfile implements OnInit {
    employeeId: number | null = null;
    profile: EmployeePersonalServiceOverview | null = null;
    familyList: FamilyInfoByEmployeeView[] = [];
    previousRabList: VwPreviousRABServiceInfoModel[] = [];
    bankAccList: BankAccInfoByEmployeeView[] = [];
    educationList: EducationInfoByEmployeeView[] = [];
    foreignVisitList: ForeignVisitInfoByEmployeeView[] = [];
    leaveList: LeaveInfoByEmployeeView[] = [];
    additionalRemarksList: AdditionalRemarksInfo[] = [];
    disciplineList: DisciplineInfoByEmployeeView[] = [];
    courseList: CourseInfoByEmployeeView[] = [];
    promotionList: PromotionInfoByEmployeeView[] = [];
    previousYearSummary: LeaveInfoSummaryItem[] = [];
    previousYearSummaryDialogVisible = false;
    previousYearSummaryLoading = false;
    loading = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private servingMembersService: ServingMembersService,
        private familyInfoService: FamilyInfoService,
        private previousRabService: PreviousRABServiceService,
        private bankAccInfoService: BankAccInfoService,
        private educationInfoService: EducationInfoService,
        private foreignVisitInfoService: ForeignVisitInfoService,
        private leaveInfoService: LeaveInfoService,
        private additionalRemarksInfoService: AdditionalRemarksInfoService,
        private disciplineInfoService: DisciplineInfoService,
        private courseInfoService: CourseInfoService,
        private promotionInfoService: PromotionInfoService,
        private messageService: MessageService
    ) {}

    get currentYear(): number {
        return new Date().getFullYear();
    }

    get previousYear(): number {
        return this.currentYear - 1;
    }

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
        const id = this.employeeId;
        this.loading = true;
        const currentYear = this.currentYear;
        forkJoin({
            profile: this.servingMembersService.getEmployeePersonalServiceOverview(id),
            family: this.familyInfoService.getFamilyInfoByEmployeeView(id),
            previousRab: this.previousRabService.getViewByEmployeeId(id),
            bankAcc: this.bankAccInfoService.getViewByEmployeeId(id),
            education: this.educationInfoService.getViewByEmployeeId(id),
            foreignVisit: this.foreignVisitInfoService.getViewByEmployeeId(id),
            leaveCurrentYear: this.leaveInfoService.getViewByEmployeeIdAndYear(id, currentYear),
            additionalRemarks: this.additionalRemarksInfoService.getByEmployeeId(id),
            discipline: this.disciplineInfoService.getViewByEmployeeId(id),
            course: this.courseInfoService.getViewByEmployeeId(id),
            promotion: this.promotionInfoService.getViewByEmployeeId(id)
        }).subscribe({
            next: ({ profile, family, previousRab, bankAcc, education, foreignVisit, leaveCurrentYear, additionalRemarks, discipline, course, promotion }) => {
                this.profile = profile;
                this.familyList = family ?? [];
                this.previousRabList = previousRab ?? [];
                this.bankAccList = bankAcc ?? [];
                this.educationList = education ?? [];
                this.foreignVisitList = foreignVisit ?? [];
                this.leaveList = leaveCurrentYear ?? [];
                this.additionalRemarksList = additionalRemarks ?? [];
                this.disciplineList = discipline ?? [];
                this.courseList = course ?? [];
                this.promotionList = promotion ?? [];
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

    formatDateOnly(value: string | null): string {
        return this.formatDateShort(value);
    }

    formatDateTime(value: string | null): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return value;
            return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch {
            return value;
        }
    }

    openPreviousYearLeaveSummary(): void {
        if (this.employeeId == null) return;
        this.previousYearSummaryDialogVisible = true;
        this.previousYearSummaryLoading = true;
        this.previousYearSummary = [];
        this.leaveInfoService.getSummaryByEmployeeAndYear(this.employeeId, this.previousYear).subscribe({
            next: (list) => {
                this.previousYearSummary = list ?? [];
                this.previousYearSummaryLoading = false;
            },
            error: () => {
                this.previousYearSummaryLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load previous year leave summary.' });
            }
        });
    }

    closePreviousYearSummaryDialog(): void {
        this.previousYearSummaryDialogVisible = false;
    }
}
