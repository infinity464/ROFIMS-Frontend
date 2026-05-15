import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ReportMemberAppointmentComponent } from './report-member-appointment/report-member-appointment.component';
import { ReportBatchCourseComponent } from './report-batch-course/report-batch-course.component';
import { ReportEducationComponent } from './report-education/report-education.component';
import { ReportMotherOrgComponent } from './report-mother-org/report-mother-org.component';
import { ReportOfficerTypeComponent } from './report-officer-type/report-officer-type.component';
import { ReportRabUnitComponent } from './report-rab-unit/report-rab-unit.component';
import { ReportBloodGroupComponent } from './report-blood-group/report-blood-group.component';
import { ReportPersonalQualificationComponent } from './report-personal-qualification/report-personal-qualification.component';
import { ReportProfessionalQualificationComponent } from './report-professional-qualification/report-professional-qualification.component';
import { ReportSpecialQualificationComponent } from './report-special-qualification/report-special-qualification.component';
import { ReportRabRankComponent } from './report-rab-rank/report-rab-rank.component';
import { SelectModule } from 'primeng/select';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { CommonCodeService } from '@/services/common-code-service';
import { UserMenuService } from '@/services/user-menu.service';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';

export type ReportType =
    | 'memberAppointment'
    | 'batchCourse'
    | 'education'
    | 'motherOrg'
    | 'officerType'
    | 'rabUnit'
    | 'bloodGroup'
    | 'personalQualification'
    | 'professionalQualification'
    | 'specialQualification'
    | 'rabRank';

/** Common code type name per report type (for dropdown options). */
const COMMON_CODE_TYPE_BY_REPORT: Record<ReportType, string> = {
    memberAppointment: 'AppointmentCategory',
    batchCourse: 'CourseName',
    education: 'EducationQualification',
    motherOrg: 'MotherOrg',
    officerType: 'OfficerType',
    rabUnit: 'RabUnit',
    bloodGroup: '', // Blood Group options are hardcoded standard values, not a CommonCode type.
    personalQualification: 'PersonalQualification',
    professionalQualification: 'ProfessionalQualification',
    specialQualification: 'SpecialQualification',
    rabRank: 'EquivalentName',
};

/**
 * Standard blood group dropdown options. Stored as free-text strings on PersonalInfo.BloodGroup,
 * so the parent passes the literal string value to the child via commonCodeLabel.
 */
const BLOOD_GROUP_OPTIONS: { label: string; labelBn: string; value: number }[] = [
    { label: 'A+',  labelBn: 'A+',  value: 1 },
    { label: 'A-',  labelBn: 'A-',  value: 2 },
    { label: 'B+',  labelBn: 'B+',  value: 3 },
    { label: 'B-',  labelBn: 'B-',  value: 4 },
    { label: 'O+',  labelBn: 'O+',  value: 5 },
    { label: 'O-',  labelBn: 'O-',  value: 6 },
    { label: 'AB+', labelBn: 'AB+', value: 7 },
    { label: 'AB-', labelBn: 'AB-', value: 8 },
];

@Component({
    selector: 'app-employee-reports',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        SelectModule,
        ReportMemberAppointmentComponent,
        ReportBatchCourseComponent,
        ReportEducationComponent,
        ReportMotherOrgComponent,
        ReportOfficerTypeComponent,
        ReportRabUnitComponent,
        ReportBloodGroupComponent,
        ReportPersonalQualificationComponent,
        ReportProfessionalQualificationComponent,
        ReportSpecialQualificationComponent,
        ReportRabRankComponent,
    ],
    templateUrl: './employee-reports.component.html',
    styleUrls: ['./report-theme.scss', './employee-reports.component.scss'],
})
export class EmployeeReportsComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    reportLang: ReportLang = 'en';
    readonly L = REPORT_LABELS;

    reportType: ReportType = 'memberAppointment';
    reportTypes: { label: string; labelBn: string; value: ReportType }[] = [
        { label: 'Appointment', labelBn: 'নিয়োগ', value: 'memberAppointment' },
        { label: 'Course', labelBn: 'কোর্স', value: 'batchCourse' },
        { label: 'Education', labelBn: 'শিক্ষা', value: 'education' },
        { label: 'Mother Org', labelBn: 'মাতৃ সংস্থা', value: 'motherOrg' },
        { label: 'Officer Type', labelBn: 'অফিসার ধরণ', value: 'officerType' },
        { label: 'RAB UNIT', labelBn: 'র‍্যাব ইউনিট', value: 'rabUnit' },
        { label: 'Blood Group', labelBn: 'রক্তের গ্রুপ', value: 'bloodGroup' },
        { label: 'Personal Qualification', labelBn: 'ব্যক্তিগত যোগ্যতা', value: 'personalQualification' },
        { label: 'Professional Qualification', labelBn: 'পেশাগত যোগ্যতা', value: 'professionalQualification' },
        { label: 'Special Qualification', labelBn: 'বিশেষ যোগ্যতা', value: 'specialQualification' },
        { label: 'RAB Rank', labelBn: 'র‍্যাব পদবি', value: 'rabRank' },
    ];

    /** Common code options for the selected report type. When user selects one, filter fires. */
    commonCodeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedCommonCodeId: number | null = null;

    /**
     * Status (PostingStatus) dropdown options and selection. Default: Presently Serving.
     * "Supernumerary" includes Pending and PendingForJoining statuses.
     * "All" sends empty/null to backend (no filter).
     */
    statusOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: '' },
        { label: 'Presently Serving', labelBn: 'কর্মরত', value: 'Servings' },
        { label: 'Ex Member', labelBn: 'সাবেক সদস্য', value: 'ExMember' },
        { label: 'Supernumerary', labelBn: 'সুপারনিউমারারি', value: 'Supernumerary' },
    ];
    selectedPostingStatus: string = 'Servings';

    constructor(private _router: Router, private _userMenuService: UserMenuService, private commonCodeService: CommonCodeService) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadCommonCodeOptions();
    }

    onReportTypeChange(): void {
        this.selectedCommonCodeId = null;
        this.loadCommonCodeOptions();
    }

    loadCommonCodeOptions(): void {
        if (this.reportType === 'motherOrg') {
            this.commonCodeService.getAllActiveMotherOrgs().subscribe({
                next: (list: MotherOrganizationModel[]) => {
                    this.commonCodeOptions = (list || []).map((c) => ({
                        label: c.orgNameEN || String(c.orgId),
                        labelBn: c.orgNameBN || c.orgNameEN || String(c.orgId),
                        value: c.orgId,
                    }));
                },
                error: () => {
                    this.commonCodeOptions = [];
                },
            });
            return;
        }
        if (this.reportType === 'bloodGroup') {
            // Blood groups are free-text values on PersonalInfo, not CommonCodes — use a fixed list.
            this.commonCodeOptions = [...BLOOD_GROUP_OPTIONS];
            return;
        }
        const codeType = COMMON_CODE_TYPE_BY_REPORT[this.reportType];
        this.commonCodeService.getAllActiveCommonCodesType(codeType).subscribe({
            next: (list: CommonCodeModel[]) => {
                this.commonCodeOptions = (list || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }));
            },
            error: () => {
                this.commonCodeOptions = [];
            },
        });
    }

    onStatusChange(): void {
        // Child components receive [postingStatus] binding and react on input change
    }

    /** Top section (report type card) stays in English only. */
    get commonCodeDropdownLabelEn(): string {
        return this.reportType === 'motherOrg'
            ? this.L['en']['report.motherOrgLabel']
            : this.L['en']['report.commonCodeLabel'];
    }

    get commonCodePlaceholderEn(): string {
        return this.reportType === 'motherOrg'
            ? this.L['en']['report.placeholderMotherOrg']
            : this.L['en']['report.placeholderCommonCode'];
    }

    /** Label of the currently selected common code (language-aware, for child report titles). */
    get selectedCommonCodeLabel(): string {
        if (this.selectedCommonCodeId == null) return '';
        const opt = this.commonCodeOptions.find((o) => o.value === this.selectedCommonCodeId);
        if (!opt) return '';
        return this.reportLang === 'bn' ? opt.labelBn : opt.label;
    }

    /** The report type label for the currently selected report type (language-aware). */
    get selectedReportTypeLabel(): string {
        const opt = this.reportTypes.find((o) => o.value === this.reportType);
        if (!opt) return '';
        return this.reportLang === 'bn' ? opt.labelBn : opt.label;
    }

    /** Selected status label (English). */
    get selectedStatusLabel(): string {
        const opt = this.statusOptions.find((o) => o.value === this.selectedPostingStatus);
        return opt?.label ?? '';
    }

    /** Selected status label (Bangla). */
    get selectedStatusLabelBn(): string {
        const opt = this.statusOptions.find((o) => o.value === this.selectedPostingStatus);
        return opt?.labelBn ?? '';
    }

    /** When common code is selected, child report components receive it and run load (filter fires). */
    onCommonCodeChange(): void {
        // Child gets [commonCodeId]="selectedCommonCodeId" and runs load() on input change
    }

    toggleReportLang(): void {
        this.reportLang = this.reportLang === 'en' ? 'bn' : 'en';
    }
}
