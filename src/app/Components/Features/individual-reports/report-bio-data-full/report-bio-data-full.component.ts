import { Component, EventEmitter, HostListener, Input, OnInit, Output, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ReportService } from '@/services/report.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { FamilyInfoService } from '@/services/family-info-service';
import { AddressInfoService } from '@/services/address-info.service';
import { PreviousRABServiceService } from '@/services/previous-rab-service.service';
import { MOServHistoryService } from '@/services/mo-serv-history.service';
import { PromotionInfoService } from '@/services/promotion-info.service';
import { EducationInfoService } from '@/services/education-info-service';
import { CourseInfoService } from '@/services/course-info-service';
import { DisciplineInfoService } from '@/services/discipline-info.service';
import { ForeignVisitInfoService } from '@/services/foreign-visit-info.service';
import { LeaveInfoService } from '@/services/leave-info.service';
import { BankAccInfoService } from '@/services/bank-acc-info-service';
import { AdditionalRemarksInfoService } from '@/services/additional-remarks-info.service';
import { MovementInfoService, MovementInfoByEmployeeDto } from '@/services/movement-info.service';
import { DraftCourseService } from '@/services/draft-course.service';
import { ExBdLeaveApplicationService } from '@/services/ex-bd-leave-application.service';
import { MovementType, MoveOrderType } from '@/models/enums';
import { environment } from '@/Core/Environments/environment';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { SharedService } from '@/shared/services/shared-service';
import { Router } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import type {
    ReportAccessibleScope,
    DynamicReportCriterion,
    DynamicReportRow,
} from '@/models/report.model';
import {
    AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, PageOrientation,
    Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
} from 'docx';
import { saveAs } from 'file-saver';

/** A column/field in a panel. For 'fields' panels the value comes from
    valueFor(key); for 'table' panels from the row via kind/bnKey. */
interface ColDef {
    key: string;
    labelEN: string;
    labelBN: string;
    defaultVisible: boolean;
    kind?: 'text' | 'date' | 'code';
    bnKey?: string;
}
interface PanelDef {
    id: string;
    titleEN: string;
    titleBN: string;
    type: 'fields' | 'table';
    columns: ColDef[];
}

/**
 * Detailed Bio-Data report — the full members/profile/{id} record rendered in
 * the short-bio-data sheet style. Sections ("panels") are either scalar field
 * grids (from the personal/service overview) or data tables (family, addresses,
 * service history, education, courses, etc.). A "Configure section" dropdown
 * scopes the field/column picker to one section at a time so the picker never
 * loads every field at once, plus a "Visible sections" picker hides whole
 * sections.
 */
@Component({
    selector: 'app-report-bio-data-full-individual',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, MultiSelectModule, SelectModule, TableModule, DialogModule, Toast],
    providers: [MessageService],
    templateUrl: './report-bio-data-full.component.html',
    styleUrls: ['../../employee-reports/report-theme.scss', '../../employee-reports/report-card-mtr.scss', './report-bio-data-full.component.scss'],
})
export class ReportBioDataFullIndividualComponent implements OnInit, OnDestroy {
    @Input() lang: ReportLang = 'en';
    @Output() langToggle = new EventEmitter<void>();

    searchRabId = '';
    searchServiceId = '';
    searchNid = '';

    profile: EmployeePersonalServiceOverview | null = null;
    profileImageUrl: string | null = null;
    private previousRabUnits: string[] = [];
    private promotionPresentDate: string | null = null;
    tableRows: Record<string, any[]> = {};

    loading = false;
    searched = false;
    exportDropdownOpen = false;
    exporting = false;
    filterOpen = true;
    showFieldEditor = false;

    accessibleScope: ReportAccessibleScope | null = null;
    get orgScopeRestricted(): boolean { return this.accessibleScope?.orgScopeRestricted === true; }

    showAccessDeniedDialog = false;
    accessDeniedMessage = 'You do not have permission to view this employee. Either they are outside your accessible scope or no longer presently serving.';
    showNotFoundDialog = false;
    notFoundMessage = 'No member found with the given RAB ID / Service ID / NID.';

    showPickerDialog = false;
    pickerRows: Array<{ employeeId: number; displayName: string; orgName: string; status: string; }> = [];
    private pickerLookupRows: DynamicReportRow[] = [];

    // ── Panels (declarative) ───────────────────────────────────────────
    readonly panels: PanelDef[] = [
        {
            id: 'service', titleEN: 'Service & Posting', titleBN: 'চাকরি ও পদায়ন', type: 'fields',
            columns: [
                { key: 'orgUnitLocation', labelEN: 'Mother Organization, Unit & Location', labelBN: 'মাতৃ সংস্থা, ইউনিট ও অবস্থান', defaultVisible: true },
                { key: 'appointment', labelEN: 'Appointment', labelBN: 'নিয়োগ', defaultVisible: true },
                { key: 'memberType', labelEN: 'Member Type', labelBN: 'সদস্যের ধরন', defaultVisible: true },
                { key: 'rank', labelEN: 'Rank', labelBN: 'পদবি', defaultVisible: true },
                { key: 'corps', labelEN: 'Corps / Regiment', labelBN: 'কোর / রেজিমেন্ট', defaultVisible: true },
                { key: 'trade', labelEN: 'Trade', labelBN: 'ট্রেড', defaultVisible: true },
                { key: 'batch', labelEN: 'Long Course / BCS', labelBN: 'লং কোর্স / বিসিএস', defaultVisible: true },
                { key: 'dateOfCommission', labelEN: 'Date of Commission', labelBN: 'কমিশনের তারিখ', defaultVisible: true },
                { key: 'enrolment', labelEN: 'Enrolment in Service', labelBN: 'চাকরিতে যোগদান', defaultVisible: true },
                { key: 'promotionPresent', labelEN: 'Promotion in Present Rank', labelBN: 'বর্তমান পদবিতে পদোন্নতি', defaultVisible: true },
                { key: 'joiningRab', labelEN: 'Joining in RAB', labelBN: 'র‍্যাবে যোগদান', defaultVisible: true },
                { key: 'rabUnit', labelEN: 'RAB Present Unit', labelBN: 'র‍্যাব বর্তমান ইউনিট', defaultVisible: true },
                { key: 'motherUnit', labelEN: 'Mother Unit', labelBN: 'মাতৃ ইউনিট', defaultVisible: false },
                { key: 'location', labelEN: 'Location', labelBN: 'অবস্থান', defaultVisible: false },
            ],
        },
        {
            id: 'personal', titleEN: 'Personal Information', titleBN: 'ব্যক্তিগত তথ্য', type: 'fields',
            columns: [
                { key: 'dateOfBirth', labelEN: 'Date of Birth', labelBN: 'জন্ম তারিখ', defaultVisible: true },
                { key: 'bloodGroup', labelEN: 'Blood Group', labelBN: 'রক্তের গ্রুপ', defaultVisible: true },
                { key: 'height', labelEN: 'Height', labelBN: 'উচ্চতা', defaultVisible: true },
                { key: 'weight', labelEN: 'Weight', labelBN: 'ওজন', defaultVisible: false },
                { key: 'religion', labelEN: 'Religion', labelBN: 'ধর্ম', defaultVisible: true },
                { key: 'maritalStatus', labelEN: 'Marital Status', labelBN: 'বৈবাহিক অবস্থা', defaultVisible: true },
                { key: 'gender', labelEN: 'Gender', labelBN: 'লিঙ্গ', defaultVisible: false },
                { key: 'gallantry', labelEN: 'Gallantry Award', labelBN: 'বীরত্বসূচক পদক', defaultVisible: true },
                { key: 'professionalQual', labelEN: 'Professional Qualification', labelBN: 'পেশাগত যোগ্যতা', defaultVisible: true },
                { key: 'personalQual', labelEN: 'Personal Qualification', labelBN: 'ব্যক্তিগত যোগ্যতা', defaultVisible: true },
                { key: 'educationQual', labelEN: 'Last Educational Qualification', labelBN: 'সর্বশেষ শিক্ষাগত যোগ্যতা', defaultVisible: true },
                { key: 'medicalCategory', labelEN: 'Medical Category', labelBN: 'মেডিকেল ক্যাটাগরি', defaultVisible: false },
                { key: 'mobileNo', labelEN: 'Mobile No', labelBN: 'মোবাইল নম্বর', defaultVisible: true },
                { key: 'officeMobile', labelEN: 'Office Mobile No', labelBN: 'অফিস মোবাইল নম্বর', defaultVisible: true },
                { key: 'email', labelEN: 'Email Address', labelBN: 'ইমেইল', defaultVisible: true },
                { key: 'emergencyContact', labelEN: 'Emergency Contact', labelBN: 'জরুরি যোগাযোগ', defaultVisible: false },
                { key: 'nid', labelEN: 'NID', labelBN: 'এনআইডি', defaultVisible: true },
                { key: 'nidOld', labelEN: 'NID (Old)', labelBN: 'পুরাতন এনআইডি', defaultVisible: false },
                { key: 'passport', labelEN: 'Passport No', labelBN: 'পাসপোর্ট নম্বর', defaultVisible: false },
                { key: 'identificationMark', labelEN: 'Identification Marks', labelBN: 'সনাক্তকরণ চিহ্ন', defaultVisible: true },
            ],
        },
        {
            id: 'address', titleEN: 'Address', titleBN: 'ঠিকানা', type: 'table',
            columns: [
                { key: 'typeLabel', labelEN: 'Type', labelBN: 'ধরন', kind: 'text', defaultVisible: true },
                { key: 'houseRoad', labelEN: 'House / Road', labelBN: 'বাসা / রোড', kind: 'text', defaultVisible: true },
                { key: 'addressAreaEN', labelEN: 'Village / Area', labelBN: 'গ্রাম / এলাকা', kind: 'text', defaultVisible: true },
                { key: 'postOffice', bnKey: 'postOfficeBN', labelEN: 'Post Office', labelBN: 'ডাকঘর', kind: 'code', defaultVisible: true },
                { key: 'thana', bnKey: 'thanaBN', labelEN: 'Upazila / Thana', labelBN: 'উপজেলা / থানা', kind: 'code', defaultVisible: true },
                { key: 'district', bnKey: 'districtBN', labelEN: 'District', labelBN: 'জেলা', kind: 'code', defaultVisible: true },
                { key: 'division', bnKey: 'divisionBN', labelEN: 'Division', labelBN: 'বিভাগ', kind: 'code', defaultVisible: true },
                { key: 'postCode', labelEN: 'Post Code', labelBN: 'পোস্ট কোড', kind: 'text', defaultVisible: false },
            ],
        },
        {
            id: 'family', titleEN: 'Family Information', titleBN: 'পরিবারের তথ্য', type: 'table',
            columns: [
                { key: 'name', bnKey: 'nameBN', labelEN: 'Name', labelBN: 'নাম', kind: 'code', defaultVisible: true },
                { key: 'relation', bnKey: 'relationBN', labelEN: 'Relation', labelBN: 'সম্পর্ক', kind: 'code', defaultVisible: true },
                { key: 'dateOfBirth', labelEN: 'Date of Birth', labelBN: 'জন্ম তারিখ', kind: 'date', defaultVisible: true },
                { key: 'occupation', bnKey: 'occupationBN', labelEN: 'Occupation', labelBN: 'পেশা', kind: 'code', defaultVisible: true },
                { key: 'mobileNo', labelEN: 'Mobile No', labelBN: 'মোবাইল', kind: 'text', defaultVisible: true },
            ],
        },
        {
            id: 'spouseFamily', titleEN: 'Spouse Family Info', titleBN: 'স্ত্রী/পতির পরিবারের তথ্য', type: 'table',
            columns: [
                { key: 'name', bnKey: 'nameBN', labelEN: 'Name', labelBN: 'নাম', kind: 'code', defaultVisible: true },
                { key: 'relation', bnKey: 'relationBN', labelEN: 'Relation', labelBN: 'সম্পর্ক', kind: 'code', defaultVisible: true },
                { key: 'dateOfBirth', labelEN: 'Date of Birth', labelBN: 'জন্ম তারিখ', kind: 'date', defaultVisible: true },
                { key: 'occupation', bnKey: 'occupationBN', labelEN: 'Occupation', labelBN: 'পেশা', kind: 'code', defaultVisible: true },
                { key: 'mobileNo', labelEN: 'Mobile No', labelBN: 'মোবাইল', kind: 'text', defaultVisible: true },
            ],
        },
        {
            id: 'previousRab', titleEN: 'Service in RAB', titleBN: 'র‍্যাবে চাকরি', type: 'table',
            columns: [
                { key: 'rabUnitName', bnKey: 'rabUnitNameBN', labelEN: 'RAB Unit', labelBN: 'র‍্যাব ইউনিট', kind: 'code', defaultVisible: true },
                { key: 'serviceFrom', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: true },
                { key: 'serviceTo', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: true },
                { key: 'appointmentName', bnKey: 'appointmentNameBN', labelEN: 'Appointment', labelBN: 'নিয়োগ', kind: 'code', defaultVisible: true },
                { key: 'postingAuth', labelEN: 'Posting Auth', labelBN: 'পদায়ন কর্তৃপক্ষ', kind: 'text', defaultVisible: false },
                { key: 'remarks', labelEN: 'Remarks', labelBN: 'মন্তব্য', kind: 'text', defaultVisible: false },
            ],
        },
        {
            id: 'permanentMovement', titleEN: 'Permanent Movement History', titleBN: 'স্থায়ী মুভমেন্ট ইতিহাস', type: 'table',
            columns: [
                { key: 'orderType', labelEN: 'Order Type', labelBN: 'আদেশের ধরন', kind: 'text', defaultVisible: true },
                { key: 'destinedUnit', bnKey: 'destinedUnitBN', labelEN: 'Destined Unit', labelBN: 'গন্তব্য ইউনিট', kind: 'code', defaultVisible: true },
                { key: 'reason', labelEN: 'Reason', labelBN: 'কারণ', kind: 'text', defaultVisible: true },
                { key: 'dateOfRelease', labelEN: 'Date of Release', labelBN: 'অবমুক্তির তারিখ', kind: 'date', defaultVisible: true },
                { key: 'dateOfReduce', labelEN: 'Date of Reduce from RAB', labelBN: 'র‍্যাব শক্তি হ্রাসের তারিখ', kind: 'date', defaultVisible: true },
            ],
        },
        {
            id: 'temporaryMovement', titleEN: 'Temporary Movement History', titleBN: 'অস্থায়ী মুভমেন্ট ইতিহাস', type: 'table',
            columns: [
                { key: 'orderType', labelEN: 'Order Type', labelBN: 'আদেশের ধরন', kind: 'text', defaultVisible: true },
                { key: 'destinedUnit', bnKey: 'destinedUnitBN', labelEN: 'Destined Unit', labelBN: 'গন্তব্য ইউনিট', kind: 'code', defaultVisible: true },
                { key: 'reason', labelEN: 'Reason', labelBN: 'কারণ', kind: 'text', defaultVisible: true },
                { key: 'dateOfRelease', labelEN: 'Date of Release', labelBN: 'অবমুক্তির তারিখ', kind: 'date', defaultVisible: true },
                { key: 'dateOfReduce', labelEN: 'Date of Reduce from RAB', labelBN: 'র‍্যাব শক্তি হ্রাসের তারিখ', kind: 'date', defaultVisible: true },
            ],
        },
        {
            id: 'moService', titleEN: 'Service History (Mother Org)', titleBN: 'মাতৃ সংস্থায় চাকরির ইতিহাস', type: 'table',
            columns: [
                { key: 'organizationName', labelEN: 'Organization', labelBN: 'সংস্থা/ইউনিট', kind: 'text', defaultVisible: true },
                { key: 'locationName', labelEN: 'Location', labelBN: 'অবস্থান', kind: 'text', defaultVisible: true },
                { key: 'serviceFrom', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: true },
                { key: 'serviceTo', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: true },
                { key: 'appointment', bnKey: 'appointmentBN', labelEN: 'Appointment', labelBN: 'নিয়োগ', kind: 'code', defaultVisible: true },
                { key: 'auth', labelEN: 'Auth', labelBN: 'কর্তৃপক্ষ', kind: 'text', defaultVisible: false },
                { key: 'remarks', labelEN: 'Remarks', labelBN: 'মন্তব্য', kind: 'text', defaultVisible: false },
            ],
        },
        {
            id: 'promotion', titleEN: 'Promotion History', titleBN: 'পদোন্নতির ইতিহাস', type: 'table',
            columns: [
                { key: 'previousRank', bnKey: 'previousRankBN', labelEN: 'Previous Rank', labelBN: 'পূর্বের পদবি', kind: 'code', defaultVisible: true },
                { key: 'promotedRank', bnKey: 'promotedRankBN', labelEN: 'Promoted Rank', labelBN: 'পদোন্নত পদবি', kind: 'code', defaultVisible: true },
                { key: 'promotedDate', labelEN: 'Promotion Date', labelBN: 'পদোন্নতির তারিখ', kind: 'date', defaultVisible: true },
                { key: 'fromDate', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: false },
                { key: 'toDate', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: false },
                { key: 'probationaryPeriod', labelEN: 'Probation', labelBN: 'প্রবেশনকাল', kind: 'text', defaultVisible: false },
                { key: 'auth', labelEN: 'Authority', labelBN: 'কর্তৃপক্ষ', kind: 'text', defaultVisible: false },
                { key: 'remarks', labelEN: 'Remarks', labelBN: 'মন্তব্য', kind: 'text', defaultVisible: false },
            ],
        },
        {
            id: 'education', titleEN: 'Education', titleBN: 'শিক্ষা', type: 'table',
            columns: [
                { key: 'nameOfExamDegree', bnKey: 'nameOfExamDegreeBN', labelEN: 'Exam / Degree', labelBN: 'পরীক্ষা / ডিগ্রি', kind: 'code', defaultVisible: true },
                { key: 'schoolCollegeUniversity', bnKey: 'schoolCollegeUniversityBN', labelEN: 'Institute', labelBN: 'প্রতিষ্ঠান', kind: 'code', defaultVisible: true },
                { key: 'subjectsDepartments', bnKey: 'subjectsDepartmentsBN', labelEN: 'Subject', labelBN: 'বিষয়', kind: 'code', defaultVisible: true },
                { key: 'result', bnKey: 'resultBN', labelEN: 'Result', labelBN: 'ফলাফল', kind: 'code', defaultVisible: true },
                { key: 'gradePoint', labelEN: 'Grade Point', labelBN: 'গ্রেড পয়েন্ট', kind: 'text', defaultVisible: false },
                { key: 'passingYear', labelEN: 'Passing Year', labelBN: 'পাসের বছর', kind: 'text', defaultVisible: true },
                { key: 'durationFrom', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: false },
                { key: 'durationTo', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: false },
            ],
        },
        {
            id: 'course', titleEN: 'Course / Training', titleBN: 'কোর্স / প্রশিক্ষণ', type: 'table',
            columns: [
                { key: 'courseType', bnKey: 'courseTypeBN', labelEN: 'Course Type', labelBN: 'কোর্সের ধরন', kind: 'code', defaultVisible: true },
                { key: 'courseName', bnKey: 'courseNameBN', labelEN: 'Course Name', labelBN: 'কোর্সের নাম', kind: 'code', defaultVisible: true },
                { key: 'trainingInstituteName', labelEN: 'Institute', labelBN: 'প্রতিষ্ঠান', kind: 'text', defaultVisible: true },
                { key: 'dateFrom', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: true },
                { key: 'dateTo', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: true },
                { key: 'result', labelEN: 'Result', labelBN: 'ফলাফল', kind: 'text', defaultVisible: false },
                { key: 'auth', labelEN: 'Auth', labelBN: 'কর্তৃপক্ষ', kind: 'text', defaultVisible: false },
                { key: 'remarks', labelEN: 'Remarks', labelBN: 'মন্তব্য', kind: 'text', defaultVisible: false },
            ],
        },
        {
            id: 'rfts', titleEN: 'RFTS', titleBN: 'আরএফটিএস', type: 'table',
            columns: [
                { key: 'courseNo', labelEN: 'Course No', labelBN: 'কোর্স নং', kind: 'text', defaultVisible: true },
                { key: 'dateFrom', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: true },
                { key: 'dateTo', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: true },
                { key: 'remarks', labelEN: 'Remark', labelBN: 'মন্তব্য', kind: 'text', defaultVisible: true },
            ],
        },
        {
            id: 'foreignVisit', titleEN: 'Foreign Visit', titleBN: 'বিদেশ ভ্রমণ', type: 'table',
            columns: [
                { key: 'nameOfCountry', bnKey: 'nameOfCountryBN', labelEN: 'Country', labelBN: 'দেশ', kind: 'code', defaultVisible: true },
                { key: 'visitType', bnKey: 'visitTypeBN', labelEN: 'Visit Type', labelBN: 'ভ্রমণের ধরন', kind: 'code', defaultVisible: true },
                { key: 'durationFrom', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: true },
                { key: 'durationTo', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: true },
                { key: 'reasonForVisiting', bnKey: 'reasonForVisitingBN', labelEN: 'Reason', labelBN: 'কারণ', kind: 'code', defaultVisible: true },
                { key: 'relatedDocuments', labelEN: 'Documents', labelBN: 'নথি', kind: 'text', defaultVisible: false },
            ],
        },
        {
            id: 'exBdLeave', titleEN: 'Ex-Bangladesh Leave Application Status', titleBN: 'বহির্বাংলাদেশ ছুটির আবেদনের অবস্থা', type: 'table',
            columns: [
                { key: 'visitType', bnKey: 'visitTypeBN', labelEN: 'Purpose of Visit', labelBN: 'ভ্রমণের উদ্দেশ্য', kind: 'code', defaultVisible: true },
                { key: 'country', bnKey: 'countryBN', labelEN: 'Country', labelBN: 'দেশ', kind: 'code', defaultVisible: true },
                { key: 'fromDate', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: true },
                { key: 'toDate', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: true },
                { key: 'totalDays', labelEN: 'Days', labelBN: 'দিন', kind: 'text', defaultVisible: true },
                { key: 'familyMembers', bnKey: 'familyMembersBN', labelEN: 'Family Members', labelBN: 'পরিবারের সদস্য', kind: 'code', defaultVisible: false },
                { key: 'status', bnKey: 'statusBN', labelEN: 'Status', labelBN: 'অবস্থা', kind: 'code', defaultVisible: true },
            ],
        },
        {
            id: 'discipline', titleEN: 'Discipline', titleBN: 'শৃঙ্খলা', type: 'table',
            columns: [
                { key: 'offenseDate', labelEN: 'Offence Date', labelBN: 'অপরাধের তারিখ', kind: 'date', defaultVisible: true },
                { key: 'offenseType', bnKey: 'offenseTypeBN', labelEN: 'Offence Type', labelBN: 'অপরাধের ধরন', kind: 'code', defaultVisible: true },
                { key: 'briefStatementOfOffence', bnKey: 'briefStatementOfOffenceBN', labelEN: 'Brief Statement', labelBN: 'সংক্ষিপ্ত বিবরণ', kind: 'code', defaultVisible: true },
                { key: 'punishmentTypeRAB', bnKey: 'punishmentTypeRABBN', labelEN: 'Punishment (RAB)', labelBN: 'শাস্তি (র‍্যাব)', kind: 'code', defaultVisible: true },
                { key: 'punishmentDate', labelEN: 'Punishment Date', labelBN: 'শাস্তির তারিখ', kind: 'date', defaultVisible: false },
                { key: 'punishmentTypeMotherOrg', bnKey: 'punishmentTypeMotherOrgBN', labelEN: 'Punishment (Org)', labelBN: 'শাস্তি (সংস্থা)', kind: 'code', defaultVisible: false },
                { key: 'offenseDetails', labelEN: 'Details', labelBN: 'বিবরণ', kind: 'text', defaultVisible: false },
                { key: 'auth', labelEN: 'Auth', labelBN: 'কর্তৃপক্ষ', kind: 'text', defaultVisible: false },
                { key: 'remarks', labelEN: 'Remarks', labelBN: 'মন্তব্য', kind: 'text', defaultVisible: false },
            ],
        },
        {
            id: 'leave', titleEN: 'Leave (Current Year)', titleBN: 'ছুটি (বর্তমান বছর)', type: 'table',
            columns: [
                { key: 'typeOfLeave', bnKey: 'typeOfLeaveBN', labelEN: 'Type of Leave', labelBN: 'ছুটির ধরন', kind: 'code', defaultVisible: true },
                { key: 'durationFrom', labelEN: 'From', labelBN: 'হতে', kind: 'date', defaultVisible: true },
                { key: 'durationTo', labelEN: 'To', labelBN: 'পর্যন্ত', kind: 'date', defaultVisible: true },
            ],
        },
        {
            id: 'bank', titleEN: 'Bank Account', titleBN: 'ব্যাংক হিসাব', type: 'table',
            columns: [
                { key: 'bankName', bnKey: 'bankNameBN', labelEN: 'Bank', labelBN: 'ব্যাংক', kind: 'code', defaultVisible: true },
                { key: 'branchName', bnKey: 'branchNameBN', labelEN: 'Branch', labelBN: 'শাখা', kind: 'code', defaultVisible: true },
                { key: 'accountName', bnKey: 'accountNameBN', labelEN: 'Account Name', labelBN: 'হিসাবের নাম', kind: 'code', defaultVisible: true },
                { key: 'accountNumber', labelEN: 'Account Number', labelBN: 'হিসাব নম্বর', kind: 'text', defaultVisible: true },
                { key: 'remarks', labelEN: 'Remarks', labelBN: 'মন্তব্য', kind: 'text', defaultVisible: false },
            ],
        },
        {
            id: 'additionalRemarks', titleEN: 'Additional Remarks', titleBN: 'অতিরিক্ত মন্তব্য', type: 'table',
            columns: [
                { key: 'additionalRemarks', labelEN: 'Additional Remarks', labelBN: 'অতিরিক্ত মন্তব্য', kind: 'text', defaultVisible: true },
            ],
        },
        {
            id: 'approvedNoteSheets', titleEN: 'Approved Note Sheets', titleBN: 'অনুমোদিত নোটশীট', type: 'table',
            columns: [
                { key: 'noteSheetNo', labelEN: 'NoteSheet No', labelBN: 'নোটশীট নং', kind: 'text', defaultVisible: true },
                { key: 'noteSheetDate', labelEN: 'NoteSheet Date', labelBN: 'নোটশীট তারিখ', kind: 'date', defaultVisible: true },
                { key: 'subject', labelEN: 'Subject', labelBN: 'বিষয়', kind: 'text', defaultVisible: true },
                { key: 'finalApprovalApprovedDate', labelEN: 'Approved Date', labelBN: 'অনুমোদনের তারিখ', kind: 'date', defaultVisible: true },
                { key: 'officeOrderLetterNo', labelEN: 'Office Order No', labelBN: 'অফিস আদেশ নং', kind: 'text', defaultVisible: true },
                { key: 'officeOrderStatus', labelEN: 'Office Order Status', labelBN: 'অফিস আদেশ অবস্থা', kind: 'text', defaultVisible: true },
            ],
        },
        {
            id: 'documents', titleEN: 'Documents', titleBN: 'নথিপত্র', type: 'table',
            columns: [
                { key: 'section', labelEN: 'Section', labelBN: 'বিভাগ', kind: 'text', defaultVisible: true },
                { key: 'fileName', labelEN: 'File Name', labelBN: 'ফাইলের নাম', kind: 'text', defaultVisible: true },
            ],
        },
    ];

    /** Panels unchecked by default in the "Visible sections" picker (still available to add). */
    private readonly defaultHiddenPanelIds = ['documents'];
    /** Which panels render (master show/hide). */
    visiblePanelIds: string[] = this.panels.map(p => p.id).filter(id => !this.defaultHiddenPanelIds.includes(id));
    /** Selected columns per panel, in display order (drag mutates these). */
    selectedCols: Record<string, string[]> = {};
    /** Panel currently being configured in the editor. */
    editPanelId: string = '';

    constructor(
        private reportService: ReportService,
        private servingMembersService: ServingMembersService,
        private empService: EmpService,
        private familyInfoService: FamilyInfoService,
        private addressInfoService: AddressInfoService,
        private previousRabService: PreviousRABServiceService,
        private moServHistoryService: MOServHistoryService,
        private promotionInfoService: PromotionInfoService,
        private educationInfoService: EducationInfoService,
        private courseInfoService: CourseInfoService,
        private disciplineInfoService: DisciplineInfoService,
        private foreignVisitInfoService: ForeignVisitInfoService,
        private leaveInfoService: LeaveInfoService,
        private bankAccInfoService: BankAccInfoService,
        private additionalRemarksInfoService: AdditionalRemarksInfoService,
        private movementInfoService: MovementInfoService,
        private draftCourseService: DraftCourseService,
        private exBdLeaveService: ExBdLeaveApplicationService,
        private http: HttpClient,
        private messageService: MessageService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private sharedService: SharedService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {
        for (const p of this.panels) this.selectedCols[p.id] = p.columns.filter(c => c.defaultVisible).map(c => c.key);
        this.editPanelId = this.panels[0].id;
    }

    ngOnInit(): void { this._userMenuService.getPermissionsByRoute(this._router.url); }
    ngOnDestroy(): void { if (this.profileImageUrl) { URL.revokeObjectURL(this.profileImageUrl); this.profileImageUrl = null; } }

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    get isBn(): boolean { return this.lang === 'bn'; }

    // ── value helpers ──────────────────────────────────────────────────
    val(v: string | number | null | undefined): string {
        if (v == null || String(v).trim() === '') return '-';
        return String(v);
    }
    displayNum(v: string | number | null | undefined): string {
        if (v == null || String(v).trim() === '') return '-';
        return this.isBn ? BanglaNumerals.toBangla(String(v)) : String(v);
    }
    codeValue(en: string | null | undefined, bn: string | null | undefined): string {
        if (this.isBn && bn != null && bn.trim() !== '') return bn.trim();
        const v = en ?? bn;
        return v != null && v.toString().trim() !== '' ? v : '-';
    }
    formatDate(v: string | null | undefined): string {
        if (v == null || v === '') return '-';
        try {
            const d = new Date(v);
            if (isNaN(d.getTime())) return v;
            const s = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
            return this.isBn ? BanglaNumerals.toBangla(s) : s;
        } catch { return v; }
    }
    private lx(en: string, bn: string): string { return this.isBn ? bn : en; }
    private joinParts(parts: (string | null | undefined)[], sep: string): string {
        const list = parts.map(p => (p ?? '').toString().trim()).filter(p => p && p !== '-');
        return list.length ? list.join(sep) : '-';
    }

    // ── Header ─────────────────────────────────────────────────────────
    get docTypeLabel(): string { return this.lx('Detailed Bio-Data', 'বিস্তারিত জীবনবৃত্তান্ত'); }
    get confidentialLine(): string { return this.lx('Confidential · Personnel Record', 'গোপনীয়'); }
    get heroName(): string {
        const p = this.profile;
        if (!p) return '-';
        return this.isBn ? this.val(p.nameBN ?? p.nameEnglish) : this.val(p.nameEnglish);
    }
    get heroNameAlt(): string {
        const p = this.profile;
        if (!p) return '-';
        return this.isBn ? this.val(p.nameEnglish) : this.val(p.nameBN);
    }
    get postNom(): string {
        const p = this.profile;
        if (!p) return '';
        const s = this.joinParts([
            this.codeValue(p.gallantryAwardsDecoration, p.gallantryAwardsDecorationBN),
            this.codeValue(p.professionalQualification, p.professionalQualificationBN),
            this.codeValue(p.corps, p.corpsBN),
        ], ' · ');
        return s === '-' ? '' : s;
    }
    get headMetaParts(): string[] {
        const p = this.profile;
        if (!p) return [];
        const orgUnitLoc = this.joinParts([
            this.codeValue(p.motherOrganization, p.motherOrganizationBN),
            this.codeValue(p.motherUnit, p.motherUnitBN),
            this.codeValue(p.location, p.locationBN),
        ], ' · ');
        return [this.codeValue(p.armyRank, p.armyRankBN), this.codeValue(p.appointment, p.appointmentBN), orgUnitLoc].filter(s => s && s !== '-');
    }
    get personalNoDisplay(): string {
        const p = this.profile;
        if (!p) return '-';
        const sid = this.displayNum(p.serviceId);
        if (sid === '-') return '-';
        const prefix = this.codeValue(p.prefix, p.prefixBN);
        return prefix && prefix !== '-' ? `${prefix}-${sid}` : sid;
    }
    get idStrip(): { k: string; v: string }[] {
        const p = this.profile;
        if (!p) return [];
        return [
            { k: this.lx('Personal No', 'ব্যক্তিগত নম্বর'), v: this.personalNoDisplay },
            { k: this.lx('RAB ID', 'র‍্যাব আইডি'), v: this.displayNum(p.rabId) },
        ];
    }

    // ── Panel/column accessors ─────────────────────────────────────────
    panelTitle(p: PanelDef): string { return this.isBn ? p.titleBN : p.titleEN; }
    colLabel(c: ColDef): string { return this.isBn ? c.labelBN : c.labelEN; }

    get visiblePanels(): PanelDef[] {
        return this.panels.filter(p => this.visiblePanelIds.includes(p.id) && this.panelHasContent(p));
    }
    panelHasContent(p: PanelDef): boolean {
        if (this.visibleCols(p).length === 0) return false;
        if (p.type === 'table') return (this.tableRows[p.id] ?? []).length > 0;
        return this.profile != null;
    }
    visibleCols(p: PanelDef): ColDef[] {
        const byKey = new Map(p.columns.map(c => [c.key, c]));
        return (this.selectedCols[p.id] ?? []).map(k => byKey.get(k)).filter((c): c is ColDef => c != null);
    }
    rowsFor(p: PanelDef): any[] { return this.tableRows[p.id] ?? []; }

    panelById(id: string): PanelDef | null { return this.panels.find(p => p.id === id) ?? null; }

    // ── Address — rendered as owner-grouped cards (Own / Spouse → Present / Permanent) ──
    private addrIsSpouse(row: any): boolean { return /spouse/i.test(String(row?.locationType ?? '')); }
    private addrIsPresent(row: any): boolean { return /pres/i.test(String(row?.locationType ?? '')); }

    addressGroups(): { key: string; heading: string; cards: any[] }[] {
        const p = this.panelById('address');
        const rows = p ? this.rowsFor(p) : [];
        const order = (arr: any[]) => arr.slice().sort((a, b) => (this.addrIsPresent(a) ? 0 : 1) - (this.addrIsPresent(b) ? 0 : 1));
        const own = order(rows.filter(r => !this.addrIsSpouse(r)));
        const spouse = order(rows.filter(r => this.addrIsSpouse(r)));
        const groups: { key: string; heading: string; cards: any[] }[] = [];
        if (own.length) groups.push({ key: 'own', heading: this.lx('Own Address', 'নিজ ঠিকানা'), cards: own });
        if (spouse.length) groups.push({ key: 'spouse', heading: this.lx('Spouse Address', 'স্ত্রী/স্বামীর ঠিকানা'), cards: spouse });
        return groups;
    }

    addrTypeLabel(row: any): string {
        return this.addrIsPresent(row) ? this.lx('Present Address', 'বর্তমান ঠিকানা') : this.lx('Permanent Address', 'স্থায়ী ঠিকানা');
    }

    /** Card field rows = visible address columns minus the type badge and post code (post code is merged into post office). */
    addrCardCols(): ColDef[] {
        const p = this.panelById('address');
        if (!p) return [];
        return this.visibleCols(p).filter(c => c.key !== 'typeLabel' && c.key !== 'postCode');
    }

    addrFieldValue(row: any, col: ColDef): string {
        const p = this.panelById('address');
        if (!p) return '-';
        const base = this.cellText(p, col, row);
        if (col.key === 'postOffice') {
            const pc = row?.postCode ?? row?.PostCode;
            return pc && base !== '-' ? `${base} (${pc})` : base;
        }
        return base;
    }

    /** Cell text for a column — scalar (fields) or per-row (table). */
    cellText(p: PanelDef, col: ColDef, row?: any): string {
        if (p.type === 'fields') return this.valueFor(col.key);
        if (!row) return '-';
        switch (col.kind) {
            case 'date': return this.formatDate(row[col.key]);
            case 'code': return this.codeValue(row[col.key], col.bnKey ? row[col.bnKey] : null);
            default:     return this.val(row[col.key]);
        }
    }

    /** Scalar field value (profile overview). */
    valueFor(key: string): string {
        const p = this.profile;
        if (!p) return '-';
        switch (key) {
            case 'orgUnitLocation':    return this.joinParts([this.codeValue(p.motherOrganization, p.motherOrganizationBN), this.codeValue(p.motherUnit, p.motherUnitBN), this.codeValue(p.location, p.locationBN)], ' – ');
            case 'appointment':        return this.codeValue(p.appointment, p.appointmentBN);
            case 'memberType':         return this.codeValue(p.memberType, p.memberTypeBN);
            case 'rank':               return this.codeValue(p.armyRank, p.armyRankBN);
            case 'corps':              return this.codeValue(p.corps, p.corpsBN);
            case 'trade':              return this.codeValue(p.trade, p.tradeBN);
            case 'batch':              return this.codeValue(p.batch ?? p.courseBatch, p.batchBN);
            case 'dateOfCommission':   return this.formatDate(p.dateOfCommission);
            case 'enrolment':          return this.formatDate(p.dateOfJoiningInServiceTraining);
            case 'promotionPresent':   return this.formatDate(this.promotionPresentDate);
            case 'joiningRab':         return this.formatDate(p.joiningDate);
            case 'rabUnit':            return this.codeValue(p.rabUnit, p.rabUnitBN);
            case 'motherUnit':         return this.codeValue(p.motherUnit, p.motherUnitBN);
            case 'location':           return this.codeValue(p.location, p.locationBN);
            case 'dateOfBirth':        return this.formatDate(p.dateOfBirth);
            case 'bloodGroup':         return this.val(p.bloodGroup);
            case 'height':             return p.height != null ? `${this.displayNum(p.height)} ${this.lx('Inch', 'ইঞ্চি')}` : '-';
            case 'weight':             return p.weight != null ? `${this.displayNum(p.weight)} ${this.lx('lbs', 'পাউন্ড')}` : '-';
            case 'religion':           return this.codeValue(p.religion, p.religionBN);
            case 'maritalStatus':      return this.codeValue(p.maritalStatus, p.maritalStatusBN);
            case 'gender':             return this.codeValue(p.gender, p.genderBN);
            case 'gallantry':          return this.codeValue(p.gallantryAwardsDecoration, p.gallantryAwardsDecorationBN);
            case 'professionalQual':   return this.codeValue(p.professionalQualification, p.professionalQualificationBN);
            case 'personalQual':       return this.codeValue(p.personalQualification, p.personalQualificationBN);
            case 'educationQual':      return this.codeValue(p.educationQualification, p.educationQualificationBN);
            case 'medicalCategory':    return this.codeValue(p.medicalCategory, p.medicalCategoryBN);
            case 'mobileNo':           return this.displayNum(p.mobileNo);
            case 'officeMobile':       return this.displayNum(p.mobileNoOfficial);
            case 'email':              return this.val(p.emailAddress);
            case 'emergencyContact':   return this.displayNum(p.emergencyContactNo);
            case 'nid':                return this.displayNum(p.nid);
            case 'nidOld':             return this.displayNum(p.nidOld);
            case 'passport':           return this.displayNum(p.passportNo);
            case 'identificationMark': return this.val(p.identificationMark);
            default:                   return '-';
        }
    }

    // ── Section editor (visibility + per-section column picker) ────────
    get sectionOptions(): { label: string; value: string }[] {
        return this.panels.map(p => ({ label: this.panelTitle(p), value: p.id }));
    }
    get editPanel(): PanelDef | undefined { return this.panels.find(p => p.id === this.editPanelId); }
    get editPanelColumnOptions(): { label: string; value: string }[] {
        const p = this.editPanel;
        return p ? p.columns.map(c => ({ label: this.colLabel(c), value: c.key })) : [];
    }
    /** MultiSelect binding for the edited panel — membership only, order kept. */
    get editPanelModel(): string[] { return this.editPanelId ? (this.selectedCols[this.editPanelId] ?? []) : []; }
    set editPanelModel(keys: string[]) {
        const p = this.editPanel;
        if (!p) return;
        const set = new Set(keys);
        const kept = (this.selectedCols[p.id] ?? []).filter(k => set.has(k));
        const existing = new Set(kept);
        const added = p.columns.map(c => c.key).filter(k => set.has(k) && !existing.has(k));
        this.selectedCols[p.id] = [...kept, ...added];
    }
    editPanelVisibleCols(): ColDef[] { const p = this.editPanel; return p ? this.visibleCols(p) : []; }

    draggingColKey: string | null = null;
    onColumnDragStart(key: string, event: DragEvent): void {
        this.draggingColKey = key;
        event.dataTransfer?.setData('text/plain', key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }
    onColumnDragOver(event: DragEvent): void { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }
    onColumnDrop(targetKey: string, event: DragEvent): void {
        event.preventDefault();
        const sourceKey = this.draggingColKey;
        this.draggingColKey = null;
        const p = this.editPanel;
        if (!p || !sourceKey || sourceKey === targetKey) return;
        const arr = [...(this.selectedCols[p.id] ?? [])];
        const fromIdx = arr.indexOf(sourceKey);
        const toIdx = arr.indexOf(targetKey);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        this.selectedCols[p.id] = arr;
    }
    onColumnDragEnd(): void { this.draggingColKey = null; }
    removeColumn(key: string): void {
        const p = this.editPanel;
        if (!p) return;
        this.selectedCols[p.id] = (this.selectedCols[p.id] ?? []).filter(k => k !== key);
    }

    // ── Search / lookup ────────────────────────────────────────────────
    get activeFilterCount(): number {
        let c = 0;
        if (this.searchRabId.trim()) c++;
        if (this.searchServiceId.trim()) c++;
        if (this.searchNid.trim()) c++;
        return c;
    }
    toggleFilter(): void { this.filterOpen = !this.filterOpen; }
    filterSubtitle(): string {
        if (this.activeFilterCount === 0) return 'Enter RAB ID, Service ID or NID to begin';
        const n = this.isBn ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' active filter(s)';
    }
    clearFilters(): void { this.searchRabId = ''; this.searchServiceId = ''; this.searchNid = ''; }

    private isMemberTypeAllowed(memberTypeId: number | null | undefined): boolean {
        if (memberTypeId == null) return true;
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) return true;
        const allowed = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (allowed === null) return true;
        return allowed.includes(memberTypeId as number);
    }

    load(): void {
        if (!this.searchRabId.trim() && !this.searchServiceId.trim() && !this.searchNid.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Search', detail: 'Enter RAB ID, Service ID or NID.' });
            return;
        }
        this.loading = true;
        const lookupCriteria: DynamicReportCriterion[] = [];
        if (this.searchRabId.trim())     lookupCriteria.push({ fieldKey: 'rabId',     textValue: this.searchRabId.trim() });
        if (this.searchServiceId.trim()) lookupCriteria.push({ fieldKey: 'serviceId', textValue: this.searchServiceId.trim() });
        if (this.searchNid.trim())       lookupCriteria.push({ fieldKey: 'nid',       textValue: this.searchNid.trim() });
        const lookupColumns = ['rabId', 'serviceId', 'nameEnglish', 'nameBangla', 'armyRank', 'corps', 'trade', 'motherOrganization', 'rabUnit', 'prefix', 'postingStatus'];

        this.reportService.runDynamicEmployeeBaseReport({
            columns: lookupColumns, criteria: lookupCriteria, pagination: { page_no: 1, row_per_page: 100 },
        }).subscribe({
            next: (lookup) => {
                this.searched = true;
                this.accessibleScope = lookup.accessibleScope ? {
                    rabUnitNames: null, rabUnitNamesBN: null, memberTypeNames: null, memberTypeNamesBN: null,
                    orgScopeRestricted: lookup.accessibleScope.orgScopeRestricted,
                } as ReportAccessibleScope : null;
                const employees = (lookup.datalist ?? []) as Array<DynamicReportRow>;
                if (employees.length === 0) {
                    this.resetResults(); this.loading = false;
                    const unrestrictedHasMatches = (lookup.accessibleScope as any)?.unrestrictedHasMatches === true;
                    if (unrestrictedHasMatches) this.showAccessDeniedDialog = true; else this.showNotFoundDialog = true;
                    return;
                }
                const allowed = employees.filter((d) => this.isMemberTypeAllowed(d['memberTypeId'] as number | null | undefined));
                if (allowed.length === 0) { this.resetResults(); this.loading = false; this.showAccessDeniedDialog = true; return; }
                if (allowed.length === 1) { this.fetchForEmployee(allowed[0]['employeeId'] as number); return; }
                this.loading = false;
                this.openPickerForCandidates(allowed);
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to look up member' });
                this.loading = false;
            },
        });
    }

    private resetResults(): void {
        this.profile = null;
        this.tableRows = {};
        this.previousRabUnits = [];
        this.promotionPresentDate = null;
        if (this.profileImageUrl) { URL.revokeObjectURL(this.profileImageUrl); this.profileImageUrl = null; }
    }

    private fetchForEmployee(employeeId: number): void {
        this.loading = true;
        this.resetResults();
        const year = new Date().getFullYear();
        const list = <T>(o: any) => (Array.isArray(o) ? o : []) as T[];
        const mine = (arr: any[]) => arr.filter(r => (r.employeeID ?? r.EmployeeID ?? r.employeeId ?? r.EmployeeId) === employeeId);

        forkJoin({
            profile: this.servingMembersService.getEmployeePersonalServiceOverview(employeeId).pipe(catchError(() => of(null))),
            family: this.familyInfoService.getFamilyInfoByEmployeeView(employeeId).pipe(catchError(() => of([] as any[]))),
            address: this.addressInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            previousRab: this.previousRabService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            moService: this.moServHistoryService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            promotion: this.promotionInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            education: this.educationInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            course: this.courseInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            discipline: this.disciplineInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            foreignVisit: this.foreignVisitInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            leave: this.leaveInfoService.getViewByEmployeeIdAndYear(employeeId, year).pipe(catchError(() => of([] as any[]))),
            bank: this.bankAccInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            additionalRemarks: this.additionalRemarksInfoService.getByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            movements: this.movementInfoService.getByEmployeeId(employeeId).pipe(catchError(() => of([] as MovementInfoByEmployeeDto[]))),
            rfts: this.draftCourseService.getRftsTrainingByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            exBdLeave: this.exBdLeaveService.getProgressByEmployee(employeeId).pipe(catchError(() => of([] as any[]))),
            documents: this.empService.getEmployeeDocumentReferences(employeeId).pipe(catchError(() => of([] as any[]))),
            approvedNoteSheets: this.http.get<any[]>(`${environment.apis.core}/NoteSheetReferenceEmployee/GetApprovedNoteSheetsByEmployeeId/${employeeId}`).pipe(catchError(() => of([] as any[]))),
        }).subscribe({
            next: (r) => {
                if (!r.profile) { this.profile = null; this.loading = false; this.showAccessDeniedDialog = true; return; }
                this.profile = r.profile;

                const prev = mine(list<any>(r.previousRab));
                this.previousRabUnits = prev.map((x: any) => x.rabUnitName ?? x.RABUnitName ?? '').filter(Boolean);
                const proms = mine(list<any>(r.promotion));
                const matchRank = proms.filter((x: any) => (x.promotedRankId ?? x.PromotedRankId) === r.profile!.armyRankId);
                this.promotionPresentDate = (matchRank.length ? matchRank : proms)
                    .map((x: any) => x.promotedDate ?? x.PromotedDate ?? null).filter(Boolean)
                    .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

                const isInLaw = (f: any) => /in-law/i.test(String(f?.relation ?? '').trim());
                const family = list<any>(r.family);
                const movements = list<MovementInfoByEmployeeDto>(r.movements);

                this.tableRows = {
                    address: this.pickActiveAddresses(list<any>(r.address))
                        .map(a => ({ ...a, typeLabel: this.locTypeLabel(a.locationType) })),
                    family: family.filter(f => !isInLaw(f)),
                    spouseFamily: family.filter(isInLaw),
                    previousRab: prev,
                    permanentMovement: movements.filter(m => m.movementType === MovementType.Permanent).map(m => this.mapMovement(m)),
                    temporaryMovement: movements.filter(m => m.movementType === MovementType.Temporary).map(m => this.mapMovement(m)),
                    moService: mine(list<any>(r.moService)),
                    promotion: proms,
                    education: list<any>(r.education),
                    course: list<any>(r.course),
                    rfts: list<any>(r.rfts),
                    foreignVisit: mine(list<any>(r.foreignVisit)),
                    exBdLeave: list<any>(r.exBdLeave).map(x => this.mapExBdLeave(x)),
                    discipline: mine(list<any>(r.discipline)),
                    leave: list<any>(r.leave),
                    bank: list<any>(r.bank),
                    additionalRemarks: list<any>(r.additionalRemarks),
                    approvedNoteSheets: list<any>(r.approvedNoteSheets),
                    documents: list<any>(r.documents).map(d => ({
                        section: this.documentSourceLabel(d),
                        fileName: d?.fileName ?? d?.FileName ?? '-',
                        _fileId: d?.fileId ?? d?.FileId ?? null,
                    })),
                };

                this.loadProfileImage(r.profile);
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load detailed bio-data' });
                this.loading = false;
            },
        });
    }

    /**
     * Keep only the current/active address per location type — drops address-change
     * history. The `active` flag is preferred when present (tolerant of bool/0-1/"true"
     * encodings); otherwise the first row for a type is treated as current (matching the
     * serving/ex-member profile pages, where the view returns the active record first).
     */
    private pickActiveAddresses(rows: any[]): any[] {
        const isActive = (a: any): boolean => {
            const v = a?.active ?? a?.Active ?? a?.isActive ?? a?.IsActive;
            return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
        };
        const byType = new Map<string, any>();
        for (const a of rows) {
            const t = String(a?.locationType ?? '').trim().toLowerCase();
            const existing = byType.get(t);
            if (!existing || (!isActive(existing) && isActive(a))) byType.set(t, a);
        }
        return [...byType.values()];
    }

    // ── Movement / Ex-BD leave / document row shaping (mirrors ex-member-profile) ──
    private readonly moveOrderTypeMap: Record<number, string> = {
        [MoveOrderType.CC]: 'CC',
        [MoveOrderType.MO]: 'MO',
        [MoveOrderType.Article47Handover]: 'Article 47 (Handover)',
        [MoveOrderType.Article47Takeover]: 'Article 47 (Takeover)',
    };
    private readonly progressStatusMap: Record<string, { en: string; bn: string }> = {
        Submitted: { en: 'Submitted', bn: 'জমা দেওয়া হয়েছে' },
        UnderRecommendation: { en: 'Under Recommendation', bn: 'সুপারিশাধীন' },
        FinalApprovalPending: { en: 'Final Approval Pending', bn: 'চূড়ান্ত অনুমোদন মুলতুবি' },
        NoteSheetApproved: { en: 'Notesheet Approved', bn: 'নোটশিট অনুমোদিত' },
        OfficeOrderGenerated: { en: 'Office Order Generated', bn: 'অফিস আদেশ তৈরি' },
        OfficeOrderApproved: { en: 'Office Order Approved', bn: 'অফিস আদেশ অনুমোদিত' },
        Cancelled: { en: 'Cancelled', bn: 'বাতিল' },
    };
    private readonly availStatusMap: Record<string, { en: string; bn: string }> = {
        Availed: { en: 'Availed', bn: 'গ্রহণকৃত' },
        NotAvailed: { en: 'Not Availed', bn: 'গ্রহণ করা হয়নি' },
    };

    private mapMovement(m: MovementInfoByEmployeeDto): any {
        const dest = (m as any).destinedMotherUnitId != null
            ? { en: (m as any).destinedMotherUnit, bn: (m as any).destinedMotherUnitBN }
            : ((m as any).destinedRABUnitId != null
                ? { en: (m as any).destinedRABUnit, bn: (m as any).destinedRABUnitBN }
                : { en: null, bn: null });
        return {
            orderType: this.moveOrderTypeMap[(m as any).moveOrderType] ?? '-',
            destinedUnit: dest.en,
            destinedUnitBN: dest.bn,
            reason: (m as any).movementReasonBN ?? null,
            dateOfRelease: (m as any).dateOfRelease ?? null,
            dateOfReduce: (m as any).dateOfReduce ?? null,
        };
    }

    private mapExBdLeave(x: any): any {
        const statusFor = (lang: 'en' | 'bn'): string => {
            const ps = this.progressStatusMap[x?.progressStatus]?.[lang] ?? (x?.progressStatus ?? '-');
            const av = x?.availStatus && this.availStatusMap[x.availStatus] ? this.availStatusMap[x.availStatus][lang] : '';
            return av ? `${ps}, ${av}` : ps;
        };
        return {
            visitType: x?.visitTypeName ?? null,
            visitTypeBN: x?.visitTypeNameBN ?? null,
            country: x?.countriesDisplay ?? null,
            countryBN: x?.countriesDisplayBN ?? null,
            fromDate: x?.fromDate ?? null,
            toDate: x?.toDate ?? null,
            totalDays: x?.totalDays ?? null,
            familyMembers: x?.familyMembersDisplay ?? null,
            familyMembersBN: x?.familyMembersDisplayBN ?? null,
            status: statusFor('en'),
            statusBN: statusFor('bn'),
        };
    }

    private documentSourceLabel(row: any): string {
        const src = row?.sourceTable ?? row?.SourceTable ?? '';
        const labels: Record<string, string> = {
            PersonalInfo: 'Personal Info', EmployeeInfo: 'Employee Info', PreviousRABServiceInfo: 'Previous RAB Service',
            PromotionInfo: 'Promotion', RankConfirmationInfo: 'Rank Confirmation', BankAccInfo: 'Bank Account',
            CourseInfo: 'Course', DisciplineInfo: 'Discipline', EducationInfo: 'Education', ForeignVisitInfo: 'Foreign Visit',
            MedicalInfo: 'Medical', MOServHistory: 'MO Service History', NomineeInfo: 'Nominee',
        };
        return labels[src] ?? (src || 'Document');
    }

    /** Download a document file (mirrors ex-member-profile). */
    downloadDocument(row: any): void {
        const fileId = row?._fileId;
        const fileName = row?.fileName && row.fileName !== '-' ? row.fileName : 'download';
        if (fileId == null) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, fileName),
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' }),
        });
    }

    private locTypeLabel(raw: string | null | undefined): string {
        const s = (raw ?? '').toString().toLowerCase();
        const bn = this.isBn;
        if (s.includes('spouse') && s.includes('perm')) return bn ? 'স্ত্রী/স্বামীর স্থায়ী' : 'Spouse Permanent';
        if (s.includes('spouse')) return bn ? 'স্ত্রী/স্বামীর বর্তমান' : 'Spouse Present';
        if (s.includes('perm')) return bn ? 'স্থায়ী' : 'Permanent';
        if (s.includes('pres')) return bn ? 'বর্তমান' : 'Present';
        return raw ? String(raw) : '-';
    }

    private loadProfileImage(profile: EmployeePersonalServiceOverview): void {
        const json = profile?.profileImages ?? (profile as { ProfileImages?: string })?.ProfileImages ?? null;
        if (!json || typeof json !== 'string') return;
        let refs: { FileId?: number; fileName?: string }[];
        try { refs = JSON.parse(json); } catch { return; }
        const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
        const fileId = first?.FileId ?? (first as { fileId?: number })?.fileId;
        if (fileId == null || fileId <= 0) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => { if (blob && blob.size > 0) this.profileImageUrl = URL.createObjectURL(blob); },
            error: () => {},
        });
    }

    private openPickerForCandidates(candidates: DynamicReportRow[]): void {
        const sansEmptyDash = (s: string) => (!s || s === '-' || s === '—' ? '' : s);
        this.pickerRows = candidates.map((d) => {
            const prefix    = sansEmptyDash(this.codeValue(d['prefix'] as string, d['prefixBN'] as string));
            const serviceId = d['serviceId'] ? this.displayNum(d['serviceId'] as string) : '';
            const rank      = sansEmptyDash(this.codeValue(d['armyRank'] as string, d['armyRankBN'] as string));
            const name      = this.codeValue(d['nameEnglish'] as string, d['nameBangla'] as string);
            const parts: string[] = [];
            if (prefix && serviceId) parts.push(`${prefix}-${serviceId}`);
            else if (prefix)         parts.push(prefix);
            else if (serviceId)      parts.push(serviceId);
            if (rank) parts.push(rank);
            if (name) parts.push(name);
            return {
                employeeId: d['employeeId'] as number,
                displayName: parts.join(' '),
                orgName:     this.codeValue(d['motherOrganization'] as string, d['motherOrganizationBN'] as string),
                status:      this.formatPostingStatus(d['postingStatus']),
            };
        });
        this.showPickerDialog = true;
        this.pickerLookupRows = candidates;
    }
    pickerSelect(employeeId: number): void { this.showPickerDialog = false; this.pickerRows = []; this.fetchForEmployee(employeeId); }
    pickerClose(): void { this.showPickerDialog = false; this.pickerRows = []; this.pickerLookupRows = []; this.resetResults(); }

    private static readonly statusDisplayMap: Record<string, { en: string; bn: string }> = {
        Servings: { en: 'Serving', bn: 'কর্মরত' }, Serving: { en: 'Serving', bn: 'কর্মরত' },
        ExMember: { en: 'Ex-Member', bn: 'সাবেক সদস্য' },
        Pending: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' }, PendingForJoining: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' },
        Supernumerary: { en: 'Supernumerary', bn: 'সুপারনিউমারারি' },
    };
    private formatPostingStatus(raw: unknown): string {
        const s = (raw ?? '').toString().trim();
        if (!s) return '-';
        const mapped = ReportBioDataFullIndividualComponent.statusDisplayMap[s];
        if (mapped) return this.isBn ? mapped.bn : mapped.en;
        return s;
    }

    // ── Export ─────────────────────────────────────────────────────────
    toggleExportDropdown(event: Event): void { event.stopPropagation(); this.exportDropdownOpen = !this.exportDropdownOpen; }
    async exportAs(type: 'print' | 'word'): Promise<void> {
        this.exportDropdownOpen = false;
        if (!this.profile) return;
        if (type === 'print') { this.printDoc(); return; }
        await this.exportWord();
    }

    private printDoc(): void {
        const win = window.open('', '_blank', 'width=1100,height=900');
        if (!win) { this.messageService.add({ severity: 'warn', summary: 'Popup blocked', detail: 'Allow popups for this site to use Print.', life: 6000 }); return; }
        const html = this.buildPrintHtml();
        win.document.open(); win.document.write(html); win.document.close();
        setTimeout(() => { try { win.focus(); win.print(); } catch { /* user can Ctrl+P */ } }, 600);
    }

    private buildPrintHtml(): string {
        const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const isBn = this.isBn;
        const grotesk = isBn ? "'Hind Siliguri', 'Noto Sans Bengali', 'Space Grotesk', sans-serif" : "'Space Grotesk', 'Helvetica Neue', Helvetica, sans-serif";
        const mono = isBn ? "'Hind Siliguri', 'Noto Sans Bengali', 'IBM Plex Mono', monospace" : "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";

        const photo = this.profileImageUrl
            ? `<div class="photo"><img src="${this.profileImageUrl}" alt="Photo" /></div>`
            : `<div class="photo photo-ph">${esc(this.lx('PHOTO', 'ছবি'))}</div>`;
        const headMeta = this.headMetaParts.map(p => `<span>${esc(p)}</span>`).join('<span class="dot"></span>');
        const idStrip = this.idStrip.map(b => `<div class="blk"><span class="ik">${esc(b.k)}</span><span class="iv">${esc(b.v)}</span></div>`).join('');

        const sections = this.visiblePanels.map(p => {
            if (p.id === 'address') {
                const cardCols = this.addrCardCols();
                const blocks = this.addressGroups().map(g => {
                    const cards = g.cards.map(row => {
                        const fields = cardCols.map(c => {
                            const v = this.addrFieldValue(row, c);
                            const vv = v === '-' ? `<span class="v empty">—</span>` : `<span class="v">${esc(v)}</span>`;
                            return `<div class="f"><span class="k">${esc(this.colLabel(c))}</span>${vv}</div>`;
                        }).join('');
                        return `<div class="addr-card"><div class="addr-type">${esc(this.addrTypeLabel(row))}</div>${fields}</div>`;
                    }).join('');
                    return `<div class="sec-head sec-head-sub"><span class="sec-title">${esc(g.heading)}</span><span class="sec-rule"></span></div><div class="addr-grid">${cards}</div>`;
                }).join('');
                return `<section class="section">${blocks}</section>`;
            }
            const cols = this.visibleCols(p);
            const head = `<div class="sec-head"><span class="sec-title">${esc(this.panelTitle(p))}</span><span class="sec-rule"></span></div>`;
            if (p.type === 'fields') {
                const cells = cols.map(c => {
                    const v = this.valueFor(c.key);
                    const vv = v === '-' ? `<span class="v empty">—</span>` : `<span class="v">${esc(v)}</span>`;
                    return `<div class="f"><span class="k">${esc(this.colLabel(c))}</span>${vv}</div>`;
                }).join('');
                return `<section class="section">${head}<div class="grid">${cells}</div></section>`;
            }
            const rows = this.rowsFor(p);
            const thead = `<tr><th class="ser">#</th>${cols.map(c => `<th>${esc(this.colLabel(c))}</th>`).join('')}</tr>`;
            const tbody = rows.map((row, i) => `<tr><td class="ser">${esc(this.displayNum(i + 1))}</td>${cols.map(c => `<td>${esc(this.cellText(p, c, row))}</td>`).join('')}</tr>`).join('');
            return `<section class="section">${head}<table class="tbl"><thead>${thead}</thead><tbody>${tbody}</tbody></table></section>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="${isBn ? 'bn' : 'en'}">
<head><meta charset="UTF-8" /><title>${esc(this.docTypeLabel)} — ${esc(this.heroName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root { --paper:#fbfbf9; --sheet:#fff; --ink:#141413; --ink-soft:#3c3c39; --muted:#8d8d88; --faint:#bcbcb6; --line:#e8e7e3; --line-strong:#d3d2cc; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:${grotesk}; background:var(--paper); color:var(--ink); -webkit-font-smoothing:antialiased; display:flex; justify-content:center; padding:36px 18px 64px; }
  .sheet { background:var(--sheet); width:100%; max-width:920px; border:1px solid var(--line); box-shadow:0 36px 70px -48px rgba(0,0,0,0.3); padding:40px 44px 36px; }
  .meta-bar { display:flex; justify-content:space-between; align-items:baseline; gap:16px; font-family:${mono}; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--muted); padding-bottom:16px; border-bottom:1.5px solid var(--ink); flex-wrap:wrap; }
  .meta-bar .lead { color:var(--ink); font-weight:600; }
  .head { display:grid; grid-template-columns:1fr 110px; gap:32px; align-items:start; padding:16px 0 18px; border-bottom:1px solid var(--line); }
  .name { font-size:30px; font-weight:600; letter-spacing:-0.025em; line-height:1.02; }
  .postnom { font-family:${mono}; font-size:10.5px; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-soft); margin-top:8px; }
  .name-bn { font-size:13px; color:var(--ink-soft); margin-top:5px; }
  .head-meta { display:flex; flex-wrap:wrap; gap:6px 12px; margin-top:14px; font-family:${mono}; font-size:10px; letter-spacing:0.05em; text-transform:uppercase; color:var(--ink); }
  .head-meta .dot { width:4px; height:4px; border-radius:50%; background:var(--line-strong); align-self:center; }
  .id-strip { display:flex; flex-wrap:wrap; gap:10px 36px; margin-top:16px; }
  .id-strip .blk { display:grid; gap:3px; }
  .id-strip .ik { font-family:${mono}; font-size:8.5px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); }
  .id-strip .iv { font-family:${mono}; font-size:13px; font-weight:600; word-break:break-all; }
  .photo { width:110px; height:134px; border:1px solid var(--line-strong); overflow:hidden; }
  .photo img { width:100%; height:100%; object-fit:cover; display:block; }
  .photo-ph { display:flex; align-items:center; justify-content:center; font-family:${mono}; font-size:9px; letter-spacing:0.2em; color:var(--muted); background:#fafafa; height:100%; }
  .section { padding:0; }
  .sec-head { display:flex; align-items:center; gap:12px; padding:30px 0 18px; }
  .sec-head::before { content:""; width:9px; height:9px; background:var(--ink); border-radius:2px; flex:none; }
  .sec-num { font-family:${mono}; font-size:9px; font-weight:600; letter-spacing:0.06em; color:var(--paper); background:var(--ink); padding:3px 6px; line-height:1; }
  .sec-title { font-family:${mono}; font-size:13px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; white-space:nowrap; }
  .sec-rule { flex:1; height:1px; background:var(--line-strong); }
  .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:0 48px; }
  .f { display:grid; grid-template-columns:44% 1fr; gap:12px; align-items:baseline; padding:8px 0; border-bottom:1px solid var(--line); min-width:0; }
  .k { font-family:${mono}; font-size:8.5px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); line-height:1.4; }
  .v { font-size:12.5px; color:var(--ink); line-height:1.4; word-break:break-word; }
  .v.empty { color:var(--faint); }
  .addr-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:28px; }
  .addr-card { min-width:0; }
  .addr-card .f:last-child { border-bottom:none; }
  .addr-type { font-family:${mono}; font-size:10px; letter-spacing:0.16em; text-transform:uppercase; color:var(--sheet); background:var(--ink); display:inline-block; padding:4px 9px; margin-bottom:14px; border-radius:3px; }
  .sec-head-sub .sec-title { font-size:13px; }
  .tbl { width:100%; border-collapse:collapse; font-size:11px; }
  .tbl th { font-family:${mono}; font-size:8.5px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink); text-align:left; padding:0 8px 8px; border-bottom:2px solid var(--ink); white-space:nowrap; vertical-align:bottom; }
  .tbl td { padding:7px 8px; border-bottom:1px solid var(--line); color:var(--ink); vertical-align:top; word-break:break-word; }
  .tbl tbody tr:last-child td { border-bottom:none; }
  .tbl .ser { width:2.4rem; color:var(--faint); font-family:${mono}; }
  @media print { body { background:#fff; padding:0; } .sheet { border:none; box-shadow:none; max-width:none; padding:10mm 12mm; } @page { size:A4; margin:8mm; } .section { break-inside:avoid; } .tbl tr { break-inside:avoid; } }
</style></head>
<body>
  <div class="sheet">
    <div class="meta-bar"><span class="lead">${esc(this.docTypeLabel)}</span><span>${esc(this.confidentialLine)}</span></div>
    <header class="head">
      <div>
        <div class="name">${esc(this.heroName)}</div>
        ${this.postNom ? `<div class="postnom">${esc(this.postNom)}</div>` : ''}
        <div class="head-meta">${headMeta}</div>
        <div class="id-strip">${idStrip}</div>
      </div>
      ${photo}
    </header>
    ${sections}
  </div>
</body></html>`;
    }

    private async exportWord(): Promise<void> {
        this.exporting = true;
        try {
            const isBn = this.isBn;
            const bnFont = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', eastAsia: 'Nirmala UI', hint: 'cs' as const };
            const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD', eastAsia: 'bn-BD' } as any;
            const sans = isBn ? (bnFont as any) : 'Calibri';
            const serif = isBn ? (bnFont as any) : 'Cambria';
            const mono = isBn ? (bnFont as any) : 'Consolas';
            const ext = (size: number) => isBn ? { language: bnLang, sizeComplexScript: size } : {};
            const ws = (s: string | null | undefined) => s ?? '';
            const C = { ink: '141413', muted: '8D8D88', line: 'D3D2CC', soft: '3C3C39' };
            const cellBorder = { top: { style: BorderStyle.SINGLE, size: 2, color: C.line }, bottom: { style: BorderStyle.SINGLE, size: 2, color: C.line }, left: { style: BorderStyle.SINGLE, size: 2, color: C.line }, right: { style: BorderStyle.SINGLE, size: 2, color: C.line } };

            const headerPars: Paragraph[] = [
                new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: ws(this.docTypeLabel) + '   ·   ' + ws(this.confidentialLine), font: mono, size: 16, ...ext(16), color: C.muted, allCaps: !isBn, characterSpacing: isBn ? 0 : 30 })] }),
                new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: ws(this.heroName), font: serif, size: 38, ...ext(38), bold: true, color: C.ink })] }),
            ];
            if (this.postNom) headerPars.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: ws(this.postNom), font: mono, size: 18, ...ext(18), color: C.soft, allCaps: !isBn })] }));
            if (this.heroNameAlt !== '-') headerPars.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: ws(this.heroNameAlt), font: serif, size: 22, ...ext(22), color: C.soft })] }));
            headerPars.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: this.headMetaParts.join('   ·   '), font: mono, size: 18, ...ext(18), color: C.ink, allCaps: !isBn })] }));
            headerPars.push(new Paragraph({ spacing: { after: 220 }, children: [new TextRun({ text: this.idStrip.map(b => `${b.k}: ${b.v}`).join('     '), font: mono, size: 18, ...ext(18), bold: true, color: C.ink })] }));

            const heading = (num: string, title: string): Paragraph => new Paragraph({
                spacing: { before: 240, after: 90 },
                children: [new TextRun({ text: `${num}  ·  ${title}`, font: mono, size: 19, ...ext(19), bold: true, color: C.ink, allCaps: !isBn, characterSpacing: isBn ? 0 : 26 })],
            });
            const cellPar = (text: string, opts: { bold?: boolean; color?: string; muted?: boolean; sz?: number } = {}) =>
                new Paragraph({ children: [new TextRun({ text: ws(text), font: opts.muted ? mono : serif, size: opts.sz ?? 18, ...ext(opts.sz ?? 18), bold: opts.bold ?? false, color: opts.color ?? C.ink, ...(opts.muted && !isBn ? { allCaps: true, characterSpacing: 12 } : {}) })] });

            const blocks: (Paragraph | Table)[] = [...headerPars];
            let num = 0;
            for (const p of this.visiblePanels) {
                num++;
                const sn = String(num).padStart(2, '0');
                const cols = this.visibleCols(p);
                blocks.push(heading(sn, this.panelTitle(p)));
                if (p.type === 'fields') {
                    blocks.push(new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3400, 6600],
                        rows: cols.map(c => new TableRow({ cantSplit: true, children: [
                            new TableCell({ borders: cellBorder, width: { size: 34, type: WidthType.PERCENTAGE }, margins: { top: 50, bottom: 50, left: 110, right: 110 }, shading: { type: 'clear' as const, fill: 'F7F7F5', color: 'auto' }, children: [cellPar(this.colLabel(c), { muted: true, sz: 16, color: C.muted })] }),
                            new TableCell({ borders: cellBorder, width: { size: 66, type: WidthType.PERCENTAGE }, margins: { top: 50, bottom: 50, left: 110, right: 110 }, children: [cellPar(this.valueFor(c.key) === '-' ? '—' : this.valueFor(c.key))] }),
                        ] })),
                    }));
                } else {
                    const rows = this.rowsFor(p);
                    const headRow = new TableRow({ tableHeader: true, cantSplit: true, children: [
                        new TableCell({ borders: cellBorder, margins: { top: 50, bottom: 50, left: 90, right: 90 }, shading: { type: 'clear' as const, fill: '141413', color: 'auto' }, children: [cellPar('#', { muted: true, sz: 14, color: 'FFFFFF' })] }),
                        ...cols.map(c => new TableCell({ borders: cellBorder, margins: { top: 50, bottom: 50, left: 90, right: 90 }, shading: { type: 'clear' as const, fill: '141413', color: 'auto' }, children: [cellPar(this.colLabel(c), { muted: true, sz: 14, color: 'FFFFFF' })] })),
                    ] });
                    const bodyRows = rows.map((row, i) => new TableRow({ cantSplit: true, children: [
                        new TableCell({ borders: cellBorder, margins: { top: 50, bottom: 50, left: 90, right: 90 }, children: [cellPar(this.displayNum(i + 1), { muted: true, sz: 14, color: C.muted })] }),
                        ...cols.map(c => { const v = this.cellText(p, c, row); return new TableCell({ borders: cellBorder, margins: { top: 50, bottom: 50, left: 90, right: 90 }, children: [cellPar(v === '-' ? '—' : v, { sz: 16 })] }); }),
                    ] }));
                    blocks.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: [headRow, ...bodyRows] }));
                }
            }

            const doc = new Document({
                sections: [{
                    properties: { page: { size: { orientation: PageOrientation.PORTRAIT }, margin: { top: 680, bottom: 680, left: 700, right: 700 } } },
                    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${isBn ? 'পৃষ্ঠা' : 'PAGE'} `, PageNumber.CURRENT, ` ${isBn ? '/' : 'OF'} `, PageNumber.TOTAL_PAGES], font: mono, size: 13, ...ext(13), color: C.muted, allCaps: !isBn })] })] }) },
                    children: blocks,
                }],
            });
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `detailed-bio-data_${this.lang}.docx`);
        } finally {
            this.exporting = false;
        }
    }
}
