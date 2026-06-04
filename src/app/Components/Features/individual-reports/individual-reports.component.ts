import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ReportCourseComponent } from './report-course/report-course.component';
import { ReportEducationIndividualComponent } from './report-education/report-education.component';
import { ReportAddressIndividualComponent } from './report-address/report-address.component';
import { ReportNomineeIndividualComponent } from './report-nominee/report-nominee.component';
import { ReportRabServiceIndividualComponent } from './report-rab-service/report-rab-service.component';
import { ReportMoServiceIndividualComponent } from './report-mo-service/report-mo-service.component';
import { ReportPromotionIndividualComponent } from './report-promotion/report-promotion.component';
import { ReportRankConfirmationIndividualComponent } from './report-rank-confirmation/report-rank-confirmation.component';
import { ReportDisciplineIndividualComponent } from './report-discipline/report-discipline.component';
import { ReportBankIndividualComponent } from './report-bank/report-bank.component';
import { ReportForeignVisitIndividualComponent } from './report-foreign-visit/report-foreign-visit.component';
import { ReportLeaveIndividualComponent } from './report-leave/report-leave.component';
import { ReportBioDataIndividualComponent } from './report-bio-data/report-bio-data.component';
import { ReportBioDataFullIndividualComponent } from './report-bio-data-full/report-bio-data-full.component';
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
    imports: [CommonModule, FormsModule, SelectModule, ReportCourseComponent, ReportEducationIndividualComponent, ReportAddressIndividualComponent, ReportNomineeIndividualComponent, ReportRabServiceIndividualComponent, ReportMoServiceIndividualComponent, ReportPromotionIndividualComponent, ReportRankConfirmationIndividualComponent, ReportDisciplineIndividualComponent, ReportBankIndividualComponent, ReportForeignVisitIndividualComponent, ReportLeaveIndividualComponent, ReportBioDataIndividualComponent, ReportBioDataFullIndividualComponent],
    templateUrl: './individual-reports.component.html',
    styleUrls: ['./individual-reports.component.scss'],
})
export class IndividualReportsComponent implements OnInit {
    L = REPORT_LABELS;
    reportLang: ReportLang = 'en';

    /** Picker options — extend as new individual reports are added. */
    reportTypes: { label: string; value: string }[] = [
        { label: 'Course Report',                            value: 'course' },
        { label: 'Education Report',                         value: 'education' },
        { label: 'Address Info Report',                      value: 'address' },
        { label: 'Nominee Information Report',               value: 'nominee' },
        { label: 'Service History in RAB',                   value: 'rab-service' },
        { label: 'Service History in Mother Organization',   value: 'mo-service' },
        { label: 'Promotion History',                        value: 'promotion' },
        { label: 'Rank Confirmation Report',                 value: 'rank-confirmation' },
        { label: 'Discipline Issue Report',                  value: 'discipline' },
        { label: 'Bank Account Report',                      value: 'bank' },
        { label: 'Ex-Bangladesh Leave (Foreign Visit)',      value: 'foreign-visit' },
        { label: 'Leave Information Report',                 value: 'leave' },
        { label: 'Short Bio-Data',                           value: 'bio-data' },
        { label: 'Detailed Bio-Data',                        value: 'bio-data-full' },
    ];

    reportType: string = 'course';

    ngOnInit(): void { /* no-op for now */ }

    toggleReportLang(): void {
        this.reportLang = this.reportLang === 'en' ? 'bn' : 'en';
    }
}
