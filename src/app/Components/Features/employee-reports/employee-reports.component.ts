import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ReportMemberAppointmentComponent } from './report-member-appointment/report-member-appointment.component';
import { ReportBatchCourseComponent } from './report-batch-course/report-batch-course.component';
import { ReportEducationComponent } from './report-education/report-education.component';
import { ReportMotherOrgComponent } from './report-mother-org/report-mother-org.component';
import { ReportOfficerTypeComponent } from './report-officer-type/report-officer-type.component';
import { ReportRabUnitComponent } from './report-rab-unit/report-rab-unit.component';
import { ReportWingsComponent } from './report-wings/report-wings.component';
import { SelectModule } from 'primeng/select';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { CommonCodeService } from '@/services/common-code-service';
import type { CommonCodeModel } from '@/models/common-code-model';

export type ReportType =
    | 'memberAppointment'
    | 'batchCourse'
    | 'education'
    | 'motherOrg'
    | 'officerType'
    | 'rabUnit'
    | 'wings';

/** Common code type name per report type (for dropdown options). */
const COMMON_CODE_TYPE_BY_REPORT: Record<ReportType, string> = {
    memberAppointment: 'AppointmentCategory',
    batchCourse: 'CourseName',
    education: 'EducationQualification',
    motherOrg: 'MotherOrg',
    officerType: 'OfficerType',
    rabUnit: 'RabUnit',
    wings: 'Wing',
};

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
        ReportWingsComponent,
    ],
    templateUrl: './employee-reports.component.html',
    styleUrls: ['./employee-reports.component.scss', './report-theme.scss'],
})
export class EmployeeReportsComponent implements OnInit {
    reportLang: ReportLang = 'en';
    readonly L = REPORT_LABELS;

    reportType: ReportType = 'memberAppointment';
    reportTypes: { label: string; value: ReportType }[] = [
        { label: 'Appointment', value: 'memberAppointment' },
        { label: 'Course', value: 'batchCourse' },
        { label: 'Education', value: 'education' },
        { label: 'Mother Org', value: 'motherOrg' },
        { label: 'Officer Type', value: 'officerType' },
        { label: 'RAB UNIT', value: 'rabUnit' },
        { label: 'Wings', value: 'wings' },
    ];

    /** Common code options for the selected report type. When user selects one, filter fires. */
    commonCodeOptions: { label: string; value: number }[] = [];
    selectedCommonCodeId: number | null = null;

    constructor(private commonCodeService: CommonCodeService) {}

    ngOnInit(): void {
        this.loadCommonCodeOptions();
    }

    onReportTypeChange(): void {
        this.selectedCommonCodeId = null;
        this.loadCommonCodeOptions();
    }

    loadCommonCodeOptions(): void {
        const codeType = COMMON_CODE_TYPE_BY_REPORT[this.reportType];
        this.commonCodeService.getAllActiveCommonCodesType(codeType).subscribe({
            next: (list: CommonCodeModel[]) => {
                this.commonCodeOptions = (list || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }));
            },
            error: () => {
                this.commonCodeOptions = [];
            },
        });
    }

    /** When common code is selected, child report components receive it and run load (filter fires). */
    onCommonCodeChange(): void {
        // Child gets [commonCodeId]="selectedCommonCodeId" and runs load() on input change
    }

    toggleReportLang(): void {
        this.reportLang = this.reportLang === 'en' ? 'bn' : 'en';
    }
}
