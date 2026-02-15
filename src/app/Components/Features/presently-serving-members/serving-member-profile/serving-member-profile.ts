import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService, EmployeeDocumentReferenceItem } from '@/services/emp-service';
import { FamilyInfoService, FamilyInfoByEmployeeView } from '@/services/family-info-service';
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { BankAccInfoService, BankAccInfoByEmployeeView } from '@/services/bank-acc-info-service';
import { EducationInfoService, EducationInfoByEmployeeView } from '@/services/education-info-service';
import { ForeignVisitInfoService, ForeignVisitInfoByEmployeeView } from '@/services/foreign-visit-info.service';
import { LeaveInfoService, LeaveInfoByEmployeeView, LeaveInfoSummaryItem } from '@/services/leave-info.service';
import { AdditionalRemarksInfoService, AdditionalRemarksInfo } from '@/services/additional-remarks-info.service';
import { AddressInfoService, AddressInfoByEmployeeView } from '@/services/address-info.service';
import { MOServHistoryService, MOServHistoryByEmployeeView } from '@/services/mo-serv-history.service';
import { DisciplineInfoService, DisciplineInfoByEmployeeView } from '@/services/discipline-info.service';
import { CourseInfoService, CourseInfoByEmployeeView } from '@/services/course-info-service';
import { PromotionInfoService, PromotionInfoByEmployeeView } from '@/services/promotion-info.service';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import { LocationType } from '@/models/enums';
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
export class ServingMemberProfile implements OnInit, OnDestroy {
    employeeId: number | null = null;
    profile: EmployeePersonalServiceOverview | null = null;
    /** Object URL for profile image (from FileInformation/Download). Revoke in ngOnDestroy. */
    profileImageUrl: string | null = null;
    familyList: FamilyInfoByEmployeeView[] = [];
    previousRabList: VwPreviousRABServiceInfoModel[] = [];
    bankAccList: BankAccInfoByEmployeeView[] = [];
    educationList: EducationInfoByEmployeeView[] = [];
    foreignVisitList: ForeignVisitInfoByEmployeeView[] = [];
    leaveList: LeaveInfoByEmployeeView[] = [];
    additionalRemarksList: AdditionalRemarksInfo[] = [];
    addressList: AddressInfoByEmployeeView[] = [];
    moServHistoryList: MOServHistoryByEmployeeView[] = [];
    disciplineList: DisciplineInfoByEmployeeView[] = [];
    courseList: CourseInfoByEmployeeView[] = [];
    promotionList: PromotionInfoByEmployeeView[] = [];
    documentList: EmployeeDocumentReferenceItem[] = [];
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
        private addressInfoService: AddressInfoService,
        private moServHistoryService: MOServHistoryService,
        private disciplineInfoService: DisciplineInfoService,
        private courseInfoService: CourseInfoService,
        private promotionInfoService: PromotionInfoService,
        private messageService: MessageService,
        private empService: EmpService
    ) {}

    /** LocationType enum for template (address type labels). */
    readonly LocationType = LocationType;

    get currentYear(): number {
        return new Date().getFullYear();
    }

    /** Own addresses: Permanent and Present (employee can have multiple of each). */
    get ownAddressList(): AddressInfoByEmployeeView[] {
        if (!this.addressList?.length) return [];
        const own = [LocationType.Permanent, LocationType.Present];
        return this.addressList.filter((a) => {
            const t = (a.locationType ?? '').trim();
            return own.some((type) => t === type);
        });
    }

    /** Wife addresses: WifePermanent and WifePresent (employee can have multiple of each). */
    get wifeAddressList(): AddressInfoByEmployeeView[] {
        if (!this.addressList?.length) return [];
        const wife = [LocationType.WifePermanent, LocationType.WifePresent];
        return this.addressList.filter((a) => {
            const t = (a.locationType ?? '').trim();
            return wife.some((type) => t === type);
        });
    }

    /** Display label for address type: "Permanent Address" or "Present Address". */
    getAddressTypeLabel(addr: AddressInfoByEmployeeView): string {
        const t = (addr.locationType ?? '').trim();
        if (t === LocationType.Permanent || t === LocationType.WifePermanent) return 'Permanent Address';
        if (t === LocationType.Present || t === LocationType.WifePresent) return 'Present Address';
        return t || 'Address';
    }

    /** Family members whose relation does not contain "in-law". */
    get familyInfoList(): FamilyInfoByEmployeeView[] {
        if (!this.familyList?.length) return [];
        const inLawPattern = /in-law/i;
        return this.familyList.filter((f) => !inLawPattern.test((f.relation ?? '').trim()));
    }

    /** Family members whose relation contains "in-law" (wife's family). */
    get wifeFamilyInfoList(): FamilyInfoByEmployeeView[] {
        if (!this.familyList?.length) return [];
        const inLawPattern = /in-law/i;
        return this.familyList.filter((f) => inLawPattern.test((f.relation ?? '').trim()));
    }

    /** RAB service records where IsCurrentlyActive is true (present posting). */
    get presentRabList(): VwPreviousRABServiceInfoModel[] {
        if (!this.previousRabList?.length) return [];
        return this.previousRabList.filter((r) => this.isRabServiceCurrentlyActive(r));
    }

    /** RAB service records where IsCurrentlyActive is not true (previous postings). */
    get previousOnlyRabList(): VwPreviousRABServiceInfoModel[] {
        if (!this.previousRabList?.length) return [];
        return this.previousRabList.filter((r) => !this.isRabServiceCurrentlyActive(r));
    }

    /** Foreign visits where VisitType is Official. */
    get officialForeignVisitList(): ForeignVisitInfoByEmployeeView[] {
        if (!this.foreignVisitList?.length) return [];
        return this.foreignVisitList.filter((v) => (v.visitType ?? '').toString().trim().toLowerCase() === 'official');
    }

    /** Foreign visits where VisitType is not Official (Unofficial). */
    get unofficialForeignVisitList(): ForeignVisitInfoByEmployeeView[] {
        if (!this.foreignVisitList?.length) return [];
        return this.foreignVisitList.filter((v) => (v.visitType ?? '').toString().trim().toLowerCase() !== 'official');
    }

    private isRabServiceCurrentlyActive(r: VwPreviousRABServiceInfoModel): boolean {
        const active = r.isCurrentlyActive ?? (r as { IsCurrentlyActive?: boolean }).IsCurrentlyActive;
        return active === true;
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
            address: this.addressInfoService.getViewByEmployeeId(id),
            moServHistory: this.moServHistoryService.getViewByEmployeeId(id),
            discipline: this.disciplineInfoService.getViewByEmployeeId(id),
            course: this.courseInfoService.getViewByEmployeeId(id),
            promotion: this.promotionInfoService.getViewByEmployeeId(id),
            documents: this.empService.getEmployeeDocumentReferences(id).pipe(catchError(() => of([])))
        }).subscribe({
            next: ({ profile, family, previousRab, bankAcc, education, foreignVisit, leaveCurrentYear, additionalRemarks, address, moServHistory, discipline, course, promotion, documents }) => {
                this.profile = profile;
                this.familyList = family ?? [];
                this.loadProfileImage(profile);
                this.previousRabList = previousRab ?? [];
                this.bankAccList = bankAcc ?? [];
                this.educationList = education ?? [];
                this.foreignVisitList = foreignVisit ?? [];
                this.leaveList = leaveCurrentYear ?? [];
                this.additionalRemarksList = additionalRemarks ?? [];
                this.addressList = address ?? [];
                this.moServHistoryList = moServHistory ?? [];
                this.disciplineList = discipline ?? [];
                this.courseList = course ?? [];
                this.promotionList = promotion ?? [];
                this.documentList = documents ?? [];
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

    ngOnDestroy(): void {
        if (this.profileImageUrl) {
            URL.revokeObjectURL(this.profileImageUrl);
            this.profileImageUrl = null;
        }
    }

    /** Parse profile image JSON and load image via FileInformation/Download; set profileImageUrl for display. */
    private loadProfileImage(profile: EmployeePersonalServiceOverview | null): void {
        if (this.profileImageUrl) {
            URL.revokeObjectURL(this.profileImageUrl);
            this.profileImageUrl = null;
        }
        const json = profile?.profileImages ?? (profile as { ProfileImages?: string })?.ProfileImages ?? null;
        if (!json || typeof json !== 'string') return;
        let refs: { FileId?: number; fileName?: string }[];
        try {
            refs = JSON.parse(json) as { FileId?: number; fileName?: string }[];
        } catch {
            return;
        }
        const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
        const fileId = first?.FileId ?? (first as { fileId?: number })?.fileId;
        if (fileId == null || fileId <= 0) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => {
                if (blob && blob.size > 0) {
                    this.profileImageUrl = URL.createObjectURL(blob);
                }
            },
            error: () => {
                // Optional: show no image on error
            }
        });
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

    getFormattedName(profile: any): string {
        return [profile?.nameEnglish, profile?.gallantryAwardsDecoration, profile?.professionalQualification, profile?.corps].filter((value) => value && value.trim() !== '').join(', ');
    }

    /** Document list: source table label for display. Accepts row (camelCase or PascalCase). */
    getDocumentSourceLabel(row: { sourceTable?: string; SourceTable?: string }): string {
        const sourceTable = row?.sourceTable ?? row?.SourceTable ?? '';
        const labels: Record<string, string> = {
            PersonalInfo: 'Personal Info',
            EmployeeInfo: 'Employee Info',
            PreviousRABServiceInfo: 'Previous RAB Service',
            PromotionInfo: 'Promotion',
            RankConfirmationInfo: 'Rank Confirmation',
            BankAccInfo: 'Bank Account',
            CourseInfo: 'Course',
            DisciplineInfo: 'Discipline',
            EducationInfo: 'Education',
            ForeignVisitInfo: 'Foreign Visit',
            MedicalInfo: 'Medical',
            MOServHistory: 'MO Service History',
            NomineeInfo: 'Nominee'
        };
        return labels[sourceTable] ?? (sourceTable || 'Document');
    }

    /** Document row file name (camelCase or PascalCase from API). */
    getDocumentFileName(row: { fileName?: string; FileName?: string }): string {
        return row?.fileName ?? row?.FileName ?? '-';
    }

    /** Download document by file id; display name from item (fileName or FileName). */
    downloadDocument(item: EmployeeDocumentReferenceItem): void {
        const fileId = item.fileId ?? (item as { FileId?: number }).FileId;
        const fileName = item.fileName ?? (item as { FileName?: string }).FileName ?? 'download';
        if (fileId == null) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, fileName),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }
}
