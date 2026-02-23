import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ReportMemberAppointmentComponent } from './report-member-appointment/report-member-appointment.component';
import { ReportBatchCourseComponent } from './report-batch-course/report-batch-course.component';
import { ReportEducationComponent } from './report-education/report-education.component';
import { SelectModule } from 'primeng/select';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';

export type ReportType = 'memberAppointment' | 'batchCourse' | 'education';

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
    ],
    templateUrl: './employee-reports.component.html',
    styleUrls: ['./employee-reports.component.scss', './report-theme.scss'],
})
export class EmployeeReportsComponent {
    /** English by default; toggle button switches to Bangla. */
    reportLang: ReportLang = 'en';
    readonly L = REPORT_LABELS;

    reportType: ReportType = 'memberAppointment';
    reportTypes: { label: string; value: ReportType }[] = [
        { label: 'Member / Appointment', value: 'memberAppointment' },
        { label: 'Batch / Course', value: 'batchCourse' },
        { label: 'Education', value: 'education' },
    ];

    toggleReportLang(): void {
        this.reportLang = this.reportLang === 'en' ? 'bn' : 'en';
    }
}
