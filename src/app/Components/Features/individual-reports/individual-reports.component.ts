import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ReportCourseComponent } from './report-course/report-course.component';
import { ReportEducationIndividualComponent } from './report-education/report-education.component';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';

/**
 * Individual Personnel Report — parent page that hosts standalone
 * employee-centric reports. Each child report defines its own filters
 * (e.g. the Course
 * report takes RAB ID / Service ID / NID), unlike employee-reports which
 * share global Status + CommonCode picks across all of its children.
 *
 * Add new reports by extending `reportTypes`, declaring the child case in
 * the template @switch, and importing the child component.
 */
@Component({
    selector: 'app-individual-reports',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule, ReportCourseComponent, ReportEducationIndividualComponent],
    templateUrl: './individual-reports.component.html',
    styleUrls: ['./individual-reports.component.scss'],
})
export class IndividualReportsComponent implements OnInit {
    L = REPORT_LABELS;
    reportLang: ReportLang = 'en';

    /** Picker options — extend as new individual reports are added. */
    reportTypes: { label: string; value: string }[] = [
        { label: 'Course Report',    value: 'course' },
        { label: 'Education Report', value: 'education' },
    ];

    reportType: string = 'course';

    ngOnInit(): void { /* no-op for now */ }

    toggleReportLang(): void {
        this.reportLang = this.reportLang === 'en' ? 'bn' : 'en';
    }
}
