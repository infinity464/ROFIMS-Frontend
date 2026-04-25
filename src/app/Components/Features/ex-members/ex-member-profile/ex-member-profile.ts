import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
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
import { DraftCourseService } from '@/services/draft-course.service';
import { RftsTrainingRow } from '@/models/draft-course.model';
import { PromotionInfoService, PromotionInfoByEmployeeView } from '@/services/promotion-info.service';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import { LocationType } from '@/models/enums';
import { PresentStatusInfoService } from '@/services/present-status-info.service';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { PROFILE_LABELS, type ProfileLabelKey, type ProfileLang } from '@/Core/i18n/profile-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { EmpPersonalInfo } from '@/Components/Features/Emp/emp-personal-info/emp-personal-info';
import { EmpAddressInfo } from '@/Components/Features/Emp/emp-address-info/emp-address-info';
import { EmpFamilyInfo } from '@/Components/Features/Emp/emp-family-info/emp-family-info';
import { EmpPreviousRabService } from '@/Components/Features/Emp/emp-previous-rab-service/emp-previous-rab-service';
import { EmpServiceHistory } from '@/Components/Features/Emp/emp-service-history/emp-service-history';
import { EmpPromotionInfo } from '@/Components/Features/Emp/emp-promotion-info/emp-promotion-info';
import { EmpEducationInfoComponent } from '@/Components/Features/Emp/emp-education-info/emp-education-info';
import { EmpCourseInfoComponent } from '@/Components/Features/Emp/emp-course-info/emp-course-info';
import { EmpForeignVisit } from '@/Components/Features/Emp/emp-foreign-visit/emp-foreign-visit.component';
import { EmpLeaveInfo } from '@/Components/Features/Emp/emp-leave-info/emp-leave-info.component';
import { EmpDisciplineInfoComponent } from '@/Components/Features/Emp/emp-discipline-info/emp-discipline-info';
import { EmpBankAccount } from '@/Components/Features/Emp/emp-bank-account/emp-bank-account.component';
import { EmpAdditionalRemarks } from '@/Components/Features/Emp/emp-additional-remarks/emp-additional-remarks.component';
import { ExportService, type ProfileExportConfig, type ProfileExportSection } from '@/services/export.service';
import { PartialDatePipe } from '@/shared/pipes/partial-date.pipe';
import { formatPartialDate } from '@/shared/utils/partial-date.util';

@Component({
    selector: 'app-ex-member-profile',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        ButtonModule,
        TableModule,
        Toast,
        DialogModule,
        TooltipModule,
        EmpPersonalInfo,
        EmpAddressInfo,
        EmpFamilyInfo,
        EmpPreviousRabService,
        EmpServiceHistory,
        EmpPromotionInfo,
        EmpEducationInfoComponent,
        EmpCourseInfoComponent,
        EmpForeignVisit,
        EmpLeaveInfo,
        EmpDisciplineInfoComponent,
        EmpBankAccount,
        EmpAdditionalRemarks,
        PartialDatePipe
    ],
    providers: [MessageService],
    templateUrl: './ex-member-profile.html',
    styleUrl: './ex-member-profile.scss'
})
export class ExMemberProfile implements OnInit, OnDestroy {
    employeeId: number | null = null;
    profile: EmployeePersonalServiceOverview | null = null;
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
    rftsTrainingList: RftsTrainingRow[] = [];
    promotionList: PromotionInfoByEmployeeView[] = [];
    documentList: EmployeeDocumentReferenceItem[] = [];
    previousYearSummary: LeaveInfoSummaryItem[] = [];
    previousYearSummaryDialogVisible = false;
    previousYearSummaryLoading = false;
    loading = false;
    activePresentStatus: string | null = null;

    /** Which section is in edit mode; null = all view. Only one section at a time. */
    editingSection: string | null = null;

    profileLang: ProfileLang = 'en';
    exportDropdownOpen = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private location: Location,
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
        private draftCourseService: DraftCourseService,
        private messageService: MessageService,
        private empService: EmpService,
        private exportService: ExportService,
        private presentStatusInfoService: PresentStatusInfoService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    getExportData(): ProfileExportConfig {
        const L = this.L;
        const p = this.profile;
        const title = p ? `${L['pageTitle.exMember']} - ${this.getFormattedName(p)}` : L['pageTitle.exMember'];
        const sections: ProfileExportSection[] = [];
        const addSection = (secTitle: string, columns: string[], rows: string[][], noTableHeader?: boolean, addressSection?: boolean, colsPerRow?: 2 | 3) =>
            sections.push({ title: secTitle, columns, rows, noTableHeader, addressSection, colsPerRow });
        const kv = (label: string, value: string): [string, string] => [label, value];

        if (!p) return { title, lang: this.profileLang, sections, showPageNumbers: true };

        // Basic Service (same as web: label-value block, no "Field"/"Value" header)
        addSection(L['section.basicService'], [L['table.field'], L['table.value']], [
            kv(this.isBn ? L['field.nameBangla'] : L['field.nameEnglish'], this.getFormattedName(p)),
            kv(L['field.serviceId'], this.valDisplay(p.serviceId)),
            kv(L['field.rabId'], this.valDisplay(p.rabId)),
            kv(L['field.appointment'], this.codeValue(p.appointment, p.appointmentBN)),
            kv(L['field.memberType'], this.codeValue(p.memberType, p.memberTypeBN)),
            kv(L['field.motherOrganization'], this.codeValue(p.motherOrganization, p.motherOrganizationBN)),
            kv(L['field.rank'], this.codeValue(p.armyRank, p.armyRankBN)),
            kv(L['field.corps'], this.codeValue(p.corps, p.corpsBN)),
            kv(L['field.trade'], this.tradeDisplay(p)),
            kv(L['field.specialQualification'], this.codeValue(p.specialQualifications, p.specialQualificationsBN)),
            kv(L['field.dateOfCommission'], this.formatDateDisplay(p.dateOfCommission)),
            kv(L['field.dateOfJoiningInServiceTraining'], this.formatDateDisplay(p.dateOfJoiningInServiceTraining)),
            kv(L['field.motherUnit'], this.codeValue(p.motherUnit, p.motherUnitBN)),
            kv(L['field.location'], this.codeValue(p.location, p.locationBN)),
            kv(L['field.rabUnitLastPosting'], this.displayRabUnit),
            kv(L['field.joiningDate'], this.formatDateDisplay(p.joiningDate)),
            kv(L['field.maritalStatus'], this.codeValue(p.maritalStatus, p.maritalStatusBN)),
        ], true);

        // Own Address (label-value; one block per address)
        const ownAddrRows: string[][] = [];
        this.ownAddressList.forEach((addr) => {
            ownAddrRows.push(kv(L['addressType.address'], this.getAddressTypeLabel(addr)));
            ownAddrRows.push(kv(L['address.houseArea'], this.val(addr.houseRoad)));
            ownAddrRows.push(kv(L['address.village'], this.val(addr.addressAreaEN)));
            ownAddrRows.push(kv(L['address.postOffice'], this.codeValue(addr.postOffice, addr.postOfficeBN)));
            ownAddrRows.push(kv(L['address.thana'], this.codeValue(addr.thana, addr.thanaBN)));
            ownAddrRows.push(kv(L['address.district'], this.codeValue(addr.district, addr.districtBN)));
            ownAddrRows.push(kv(L['address.division'], this.codeValue(addr.division, addr.divisionBN)));
        });
        if (ownAddrRows.length === 0) ownAddrRows.push([L['empty.noOwnAddress'], '']);
        addSection(L['section.ownAddress'], [L['table.field'], L['table.value']], ownAddrRows, true, true);

        // Spouse Address
        const spouseAddrRows: string[][] = [];
        this.spouseAddressList.forEach((addr) => {
            spouseAddrRows.push(kv(L['addressType.address'], this.getAddressTypeLabel(addr)));
            spouseAddrRows.push(kv(L['address.houseArea'], this.val(addr.houseRoad)));
            spouseAddrRows.push(kv(L['address.village'], this.val(addr.addressAreaEN)));
            spouseAddrRows.push(kv(L['address.postOffice'], this.codeValue(addr.postOffice, addr.postOfficeBN)));
            spouseAddrRows.push(kv(L['address.thana'], this.codeValue(addr.thana, addr.thanaBN)));
            spouseAddrRows.push(kv(L['address.district'], this.codeValue(addr.district, addr.districtBN)));
            spouseAddrRows.push(kv(L['address.division'], this.codeValue(addr.division, addr.divisionBN)));
        });
        if (spouseAddrRows.length === 0) spouseAddrRows.push([L['empty.noSpouseAddress'], '']);
        addSection(L['section.spouseAddress'], [L['table.field'], L['table.value']], spouseAddrRows, true, true);

        // Other Personal (label-value)
        addSection(L['section.otherPersonal'], [L['table.field'], L['table.value']], [
            kv(L['field.courseBatch'], this.codeValue(p.batch, p.batchBN)),
            kv(L['field.dateOfJoinInService'], this.formatDateDisplay(p.dateOfJoiningInServiceTraining)),
            kv(L['field.dateOfCommission'], this.formatDateDisplay(p.dateOfCommission)),
            kv(L['field.educationQualification'], this.codeValue(p.educationQualification, p.educationQualificationBN)),
            kv(L['field.professionalQualification'], this.codeValue(p.professionalQualification, p.professionalQualificationBN)),
            kv(L['field.personalQualification'], this.codeValue(p.personalQualification, p.personalQualificationBN)),
            kv(L['field.gallantryAwards'], this.codeValue(p.gallantryAwardsDecoration, p.gallantryAwardsDecorationBN)),
            kv(L['field.bloodGroup'], this.val(p.bloodGroup)),
            kv(L['field.nid'], this.valDisplay(p.nid)),
            kv(L['field.nidOld'], this.valDisplay(p.nidOld)),
            kv(L['field.emailAddress'], this.val(p.emailAddress)),
            kv(L['field.dateOfBirth'], this.formatDateDisplay(p.dateOfBirth)),
            kv(L['field.passportNo'], this.valDisplay(p.passportNo)),
            kv(L['field.height'], this.heightDisplay(p)),
            kv(L['field.medicalCategory'], this.codeValue(p.medicalCategory, p.medicalCategoryBN)),
            kv(L['field.mobileNo'], this.valDisplay(p.mobileNo)),
            kv(L['field.mobileNoOfficial'], this.valDisplay(p.mobileNoOfficial)),
            kv(L['field.emergencyContactNo'], this.valDisplay(p.emergencyContactNo)),
            kv(L['field.religion'], this.codeValue(p.religion, p.religionBN)),
            kv(L['field.weight'], this.weightDisplay(p)),
            kv(L['field.identificationMark'], this.val(p.identificationMark)),
        ], true, false, 2);

        // Family Info (table: Ser, Name, Relation, DOB, Occupation, Mobile)
        const familyRows = this.familyInfoList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.name, row.nameBN),
            this.codeValue(row.relation, row.relationBN),
            this.formatFamilyDob(row.dateOfBirth),
            this.codeValue(row.occupation, row.occupationBN),
            this.familyMobile(row),
        ]);
        if (familyRows.length === 0) familyRows.push([L['empty.noFamilyRecords']]);
        addSection(L['section.familyInfo'], [L['table.ser'], L['table.name'], L['table.relation'], L['table.dateOfBirth'], L['table.occupation'], L['table.mobileNo']], familyRows);

        // Spouse Family Info
        const spouseFamilyRows = this.spouseFamilyInfoList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.name, row.nameBN),
            this.codeValue(row.relation, row.relationBN),
            this.formatFamilyDob(row.dateOfBirth),
            this.codeValue(row.occupation, row.occupationBN),
            this.familyMobile(row),
        ]);
        if (spouseFamilyRows.length === 0) spouseFamilyRows.push([L['empty.noSpouseFamilyRecords']]);
        addSection(L['section.spouseFamilyInfo'], [L['table.ser'], L['table.name'], L['table.relation'], L['table.dateOfBirth'], L['table.occupation'], L['table.mobileNo']], spouseFamilyRows);

        // Previous RAB Service
        const prevRabRows = this.previousOnlyRabList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.rabUnitName, row.rabUnitNameBN),
            formatPartialDate(row.serviceFrom, row.serviceFromPrecision),
            formatPartialDate(row.serviceTo, row.serviceToPrecision),
            this.codeValue(row.appointmentName, row.appointmentNameBN),
            this.val(row.postingAuth),
            this.val(row.remarks),
        ]);
        if (prevRabRows.length === 0) prevRabRows.push([L['empty.noPreviousRabRecords']]);
        addSection(L['section.previousRabService'], [L['table.ser'], L['table.rabUnit'], L['table.serviceFrom'], L['table.serviceTo'], L['table.appointment'], L['table.postingAuth'], L['table.remarks']], prevRabRows);

        // Service History MO
        const moRows = this.moServHistoryList.map((row, i) => [
            this.rowNum(i) + '.',
            this.val(row.organizationName),
            this.val(row.locationName),
            formatPartialDate(row.serviceFrom, (row as any).serviceFromPrecision),
            formatPartialDate(row.serviceTo, (row as any).serviceToPrecision),
            this.codeValue(row.appointment, row.appointmentBN),
            this.val(row.auth),
            this.val(row.remarks),
        ]);
        if (moRows.length === 0) moRows.push([L['empty.noServiceHistoryRecords']]);
        addSection(L['section.serviceHistoryMo'], [L['table.ser'], L['table.organization'], L['table.location'], L['table.serviceFrom'], L['table.serviceTo'], L['table.appointment'], L['table.auth'], L['table.remarks']], moRows);

        // Promotion
        const promRows = this.promotionList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.previousRank, row.previousRankBN),
            this.codeValue(row.promotedRank, row.promotedRankBN),
            this.formatDateOnly(row.promotedDate),
            this.formatDateOnly(row.fromDate),
            this.formatDateOnly(row.toDate),
            this.val(row.probationaryPeriod),
            this.val(row.auth),
            this.val(row.remarks),
        ]);
        if (promRows.length === 0) promRows.push([L['empty.noPromotionRecords']]);
        addSection(L['section.promotion'], [L['table.ser'], L['table.previousRank'], L['table.promotedRank'], L['table.promotedDate'], L['table.fromDate'], L['table.toDate'], L['table.probationaryPeriod'], L['table.auth'], L['table.remarks']], promRows);

        // Education
        const eduRows = this.educationList.map((row, i) => [
            this.rowNum(i) + '.',
            this.formatDateOnly(row.durationFrom),
            this.formatDateOnly(row.durationTo),
            this.codeValue(row.schoolCollegeUniversity, row.schoolCollegeUniversityBN),
            this.codeValue(row.nameOfExamDegree, row.nameOfExamDegreeBN),
            this.codeValue(row.subjectsDepartments, row.subjectsDepartmentsBN),
            this.codeValue(row.result, row.resultBN),
            this.valDisplay(row.gradePoint),
            this.valDisplay(row.passingYear),
        ]);
        if (eduRows.length === 0) eduRows.push([L['empty.noEducationRecords']]);
        addSection(L['section.education'], [L['table.ser'], L['table.durationFrom'], L['table.durationTo'], L['table.schoolCollegeUniversity'], L['table.examDegree'], L['table.subjectDepartment'], L['table.result'], L['table.gradePoint'], L['table.passingYear']], eduRows);

        // Course
        const courseRows = this.courseList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.courseType, row.courseTypeBN),
            this.codeValue(row.courseName, row.courseNameBN),
            this.val(row.trainingInstituteName),
            this.formatDateOnly(row.dateFrom),
            this.formatDateOnly(row.dateTo),
            this.val(row.result),
            this.val(row.auth),
            this.val(row.remarks),
        ]);
        if (courseRows.length === 0) courseRows.push([L['empty.noCourseRecords']]);
        addSection(L['section.course'], [L['table.ser'], L['table.courseType'], L['table.courseName'], L['table.trainingInstitute'], L['table.dateFrom'], L['table.dateTo'], L['table.result'], L['table.auth'], L['table.remarks']], courseRows);

        // Investigation (label-value, no header row)
        addSection(L['section.investigation'], [L['table.field'], L['table.value']], [
            p.hasInvestigationExp === true ? kv(L['field.details'], this.val(p.investigationExpDetails)) : [L['empty.noInvestigationRecorded'], ''],
        ], true);

        // Official Foreign Visit
        const offFvRows = this.officialForeignVisitList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.nameOfCountry, row.nameOfCountryBN),
            this.formatDateOnly(row.durationFrom),
            this.formatDateOnly(row.durationTo),
            this.codeValue(row.reasonForVisiting, row.reasonForVisitingBN),
            this.val(row.relatedDocuments),
        ]);
        if (offFvRows.length === 0) offFvRows.push([L['empty.noOfficialForeignVisit']]);
        addSection(L['section.officialForeignVisit'], [L['table.ser'], L['table.country'], L['table.durationFrom'], L['table.durationTo'], L['table.reasonForVisiting'], L['table.relatedDocuments']], offFvRows);

        // Unofficial Foreign Visit
        const unoffFvRows = this.unofficialForeignVisitList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.nameOfCountry, row.nameOfCountryBN),
            this.formatDateOnly(row.durationFrom),
            this.formatDateOnly(row.durationTo),
            this.codeValue(row.reasonForVisiting, row.reasonForVisitingBN),
            this.val(row.relatedDocuments),
        ]);
        if (unoffFvRows.length === 0) unoffFvRows.push([L['empty.noUnofficialForeignVisit']]);
        addSection(L['section.unofficialForeignVisit'], [L['table.ser'], L['table.country'], L['table.durationFrom'], L['table.durationTo'], L['table.reasonForVisiting'], L['table.relatedDocuments']], unoffFvRows);

        // Leave
        const leaveRows = this.leaveList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.typeOfLeave, row.typeOfLeaveBN),
            this.formatDateOnly(row.durationFrom),
            this.formatDateOnly(row.durationTo),
        ]);
        if (leaveRows.length === 0) leaveRows.push([L['empty.noLeaveCurrentYear']]);
        addSection(`${L['section.leave']} (${this.currentYearDisplay})`, [L['table.ser'], L['table.typeOfLeave'], L['table.durationFrom'], L['table.durationTo']], leaveRows);

        // Discipline
        const discRows = this.disciplineList.map((row, i) => [
            this.rowNum(i) + '.',
            this.formatDateOnly(row.offenseDate),
            this.codeValue(row.offenseType, row.offenseTypeBN),
            this.codeValue(row.briefStatementOfOffence, row.briefStatementOfOffenceBN),
            this.val(row.offenseDetails),
            this.codeValue(row.punishmentTypeRAB, row.punishmentTypeRABBN),
            this.formatDateOnly(row.punishmentDate),
            this.codeValue(row.punishmentTypeMotherOrg, row.punishmentTypeMotherOrgBN),
            this.formatDateOnly(row.punishmentDateMotherOrg),
            this.val(row.auth),
            this.val(row.remarks),
        ]);
        if (discRows.length === 0) discRows.push([L['empty.noDisciplineRecords']]);
        addSection(L['section.discipline'], [L['table.ser'], L['table.offenseDate'], L['table.offenseType'], L['table.briefStatement'], L['table.offenseDetails'], L['table.punishmentRab'], L['table.punishmentDate'], L['table.punishmentMo'], L['table.punishmentDateMo'], L['table.auth'], L['table.remarks']], discRows);

        // Bank Account
        const bankRows = this.bankAccList.map((row, i) => [
            this.rowNum(i) + '.',
            this.codeValue(row.bankName, row.bankNameBN),
            this.codeValue(row.branchName, row.branchNameBN),
            this.codeValue(row.accountName, row.accountNameBN),
            this.valDisplay(row.accountNumber),
            this.val(row.remarks),
        ]);
        if (bankRows.length === 0) bankRows.push([L['empty.noBankAccountRecords']]);
        addSection(L['section.bankAccount'], [L['table.ser'], L['table.bankName'], L['table.branchName'], L['table.accountName'], L['table.accountNumber'], L['table.remarks']], bankRows);

        // Additional Remarks
        const remRows = this.additionalRemarksList.map((row, i) => [this.rowNum(i) + '.', this.val(row.additionalRemarks)]);
        if (remRows.length === 0) remRows.push([L['empty.noAdditionalRemarks']]);
        addSection(L['section.additionalRemarks'], [L['table.ser'], L['table.additionalRemarks']], remRows);

        // Documents
        const docRows = this.documentList.map((row, i) => [this.rowNum(i) + '.', this.getDocumentSourceLabel(row), this.getDocumentFileName(row)]);
        if (docRows.length === 0) docRows.push([L['empty.noDocuments']]);
        addSection(L['section.documents'], [L['table.ser'], L['table.section'], L['table.fileName']], docRows);

        return { title, lang: this.profileLang, sections, showPageNumbers: true };
    }

    async exportAs(type: 'pdf' | 'word'): Promise<void> {
        const config: ProfileExportConfig = { ...this.getExportData(), lang: this.profileLang };
        if (this.profileImageUrl) {
            try {
                const blob = await fetch(this.profileImageUrl).then((r) => r.blob());
                const dataUrl = await new Promise<string>((res, rej) => {
                    const r = new FileReader();
                    r.onload = () => res(r.result as string);
                    r.onerror = rej;
                    r.readAsDataURL(blob);
                });
                config.imageDataUrl = dataUrl;
            } catch {
                // omit image if fetch/read fails
            }
        }
        if (type === 'pdf') this.exportService.exportProfilePDF(config);
        else if (type === 'word') await this.exportService.exportProfileWord(config);
        this.exportDropdownOpen = false;
    }

    readonly LocationType = LocationType;

    get L(): (typeof PROFILE_LABELS)[ProfileLang] {
        return PROFILE_LABELS[this.profileLang];
    }

    get isBn(): boolean {
        return this.profileLang === 'bn';
    }

    get translatedPresentStatus(): string | null {
        if (!this.activePresentStatus) return null;
        const key = `presentStatus.${this.activePresentStatus}` as ProfileLabelKey;
        return this.L[key] ?? this.activePresentStatus;
    }

    toggleProfileLang(): void {
        this.profileLang = this.profileLang === 'en' ? 'bn' : 'en';
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.isBn && (bnVal != null && bnVal !== '')) return bnVal;
        return enVal != null && enVal !== '' ? enVal : '-';
    }

    valDisplay(v: string | number | null | undefined): string {
        const s = this.val(v);
        if (s === '-') return s;
        return this.isBn ? BanglaNumerals.toBangla(s) : s;
    }

    formatDateDisplay(value: string | null | undefined): string {
        const s = this.formatDateShort(value ?? null);
        return this.isBn ? BanglaNumerals.toBangla(s) : s;
    }

    get currentYear(): number {
        return new Date().getFullYear();
    }

    get currentYearDisplay(): string {
        return this.isBn ? BanglaNumerals.toBangla(String(this.currentYear)) : String(this.currentYear);
    }

    get previousYearDisplay(): string {
        return this.isBn ? BanglaNumerals.toBangla(String(this.previousYear)) : String(this.previousYear);
    }

    rowNum(i: number): string {
        return this.isBn ? BanglaNumerals.toBangla(String(i + 1)) : String(i + 1);
    }

    /** RAB Unit for ex-member: Top 1 from previousServiceInfo ORDER BY durationFrom (serviceFrom) DESC. Uses BN when profileLang is bn. */
    get displayRabUnit(): string {
        if (!this.previousRabList?.length) return this.codeValue(this.profile?.rabUnit ?? null, this.profile?.rabUnitBN ?? null);
        const sorted = [...this.previousRabList].sort((a, b) => {
            const fromA = a.serviceFrom ?? '';
            const fromB = b.serviceFrom ?? '';
            return fromB.localeCompare(fromA);
        });
        const first = sorted[0];
        const nameEn = first?.rabUnitName ?? (first as { RABUnitName?: string })?.RABUnitName;
        const nameBn = first?.rabUnitNameBN ?? (first as { RABUnitNameBN?: string })?.RABUnitNameBN;
        return this.codeValue(nameEn ?? this.profile?.rabUnit ?? null, nameBn ?? this.profile?.rabUnitBN ?? null);
    }

    /** Own addresses: one active Permanent and one active Present. */
    get ownAddressList(): AddressInfoByEmployeeView[] {
        if (!this.addressList?.length) return [];
        const result: AddressInfoByEmployeeView[] = [];
        const permanent = this.addressList.find((a) => (a.locationType ?? '').trim() === LocationType.Permanent);
        const present = this.addressList.find((a) => (a.locationType ?? '').trim() === LocationType.Present);
        if (permanent) result.push(permanent);
        if (present) result.push(present);
        return result;
    }

    get spouseAddressList(): AddressInfoByEmployeeView[] {
        if (!this.addressList?.length) return [];
        const spouse = [LocationType.SpousePermanent, LocationType.SpousePresent];
        return this.addressList.filter((a) => {
            const t = (a.locationType ?? '').trim();
            return spouse.some((type) => t === type);
        });
    }

    getAddressTypeLabel(addr: AddressInfoByEmployeeView): string {
        const t = (addr.locationType ?? '').trim();
        if (t === LocationType.Permanent || t === LocationType.SpousePermanent) return this.L['addressType.permanent'];
        if (t === LocationType.Present || t === LocationType.SpousePresent) return this.L['addressType.present'];
        return t || this.L['addressType.address'];
    }

    get familyInfoList(): FamilyInfoByEmployeeView[] {
        if (!this.familyList?.length) return [];
        const inLawPattern = /in-law/i;
        return this.familyList.filter((f) => !inLawPattern.test((f.relation ?? '').trim()));
    }

    get spouseFamilyInfoList(): FamilyInfoByEmployeeView[] {
        if (!this.familyList?.length) return [];
        const inLawPattern = /in-law/i;
        return this.familyList.filter((f) => inLawPattern.test((f.relation ?? '').trim()));
    }

    /** Ex-member: all RAB service records are "previous" (no present section). */
    get previousOnlyRabList(): VwPreviousRABServiceInfoModel[] {
        return this.previousRabList ?? [];
    }

    get officialForeignVisitList(): ForeignVisitInfoByEmployeeView[] {
        if (!this.foreignVisitList?.length) return [];
        return this.foreignVisitList.filter((v) => (v.visitType ?? '').toString().trim().toLowerCase() === 'official');
    }

    get unofficialForeignVisitList(): ForeignVisitInfoByEmployeeView[] {
        if (!this.foreignVisitList?.length) return [];
        return this.foreignVisitList.filter((v) => (v.visitType ?? '').toString().trim().toLowerCase() !== 'official');
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

    loadProfile(onComplete?: () => void): void {
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
            documents: this.empService.getEmployeeDocumentReferences(id).pipe(catchError(() => of([]))),
            rftsTraining: this.draftCourseService.getRftsTrainingByEmployeeId(id).pipe(catchError(() => of([]))),
            presentStatus: this.presentStatusInfoService.getAllByEmployeeId(id).pipe(catchError(() => of([])))
        }).subscribe({
            next: ({ profile, family, previousRab, bankAcc, education, foreignVisit, leaveCurrentYear, additionalRemarks, address, moServHistory, discipline, course, promotion, documents, rftsTraining, presentStatus }) => {
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
                this.rftsTrainingList = rftsTraining ?? [];
                const activeRecord = (presentStatus ?? []).find((r: any) => (r.IsActive ?? r.isActive));
                if (activeRecord) {
                    const statusValue = activeRecord.PresentStatusType ?? activeRecord.presentStatusType;
                    this.activePresentStatus = statusValue || null;
                } else {
                    this.activePresentStatus = null;
                }
                this.loading = false;
                onComplete?.();
            },
            error: (err) => {
                console.error('Failed to load profile', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load profile'
                });
                this.loading = false;
                onComplete?.();
            }
        });
    }

    goBack(): void {
        this.location.back();
    }

    setEditingSection(section: string | null): void {
        this.editingSection = section;
    }

    onSectionSaved(section: string): void {
        this.editingSection = null;
        if (this.employeeId != null) {
            this.loadProfile();
        }
    }

    /** Close edit mode and refresh profile (e.g. when user clicks Cancel/Back in embedded form). Preserves scroll position. */
    closeSectionAndRefresh(): void {
        const scrollY = window.scrollY;
        this.editingSection = null;
        if (this.employeeId != null) {
            this.loadProfile(() => {
                requestAnimationFrame(() => window.scrollTo(0, scrollY));
            });
        }
    }

    ngOnDestroy(): void {
        if (this.profileImageUrl) {
            URL.revokeObjectURL(this.profileImageUrl);
            this.profileImageUrl = null;
        }
    }

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
            error: () => {}
        });
    }

    private onError(message: string): void {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: message });
        this.loading = false;
    }

    formatDateShort(value: string | null | undefined): string {
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
        const t = this.isBn ? (p.tradeBN ?? p.trade)?.trim() : p.trade?.trim();
        const r = p.tradeRemarks?.trim();
        if (t) return t;
        if (r) return `N/A (${r})`;
        return '-';
    }

    heightDisplay(p: EmployeePersonalServiceOverview | null): string {
        if (!p || p.height == null) return '-';
        const h = this.isBn ? BanglaNumerals.toBangla(String(p.height)) : String(p.height);
        return `${h} Inch`;
    }

    weightDisplay(p: EmployeePersonalServiceOverview | null): string {
        if (!p || p.weight == null) return '-';
        const w = this.isBn ? BanglaNumerals.toBangla(String(p.weight)) : String(p.weight);
        return `${w} lbs`;
    }

    formatFamilyDob(value: string | null | undefined): string {
        return this.formatDateDisplay(value);
    }

    familyMobile(row: FamilyInfoByEmployeeView): string {
        return this.valDisplay(row.mobileNo);
    }

    formatDateOnly(value: string | null | undefined): string {
        const s = this.formatDateShort(value);
        return this.isBn ? BanglaNumerals.toBangla(s) : s;
    }

    formatDateTime(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return value;
            const s = d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            return this.isBn ? BanglaNumerals.toBangla(s) : s;
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

    getInitials(name: string | null | undefined): string {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    getFormattedName(profile: EmployeePersonalServiceOverview | null): string {
        if (!profile) return '-';
        const namePart = this.isBn ? (profile.nameBN ?? profile.nameEnglish) : profile.nameEnglish;
        const deco = this.isBn ? (profile.gallantryAwardsDecorationBN ?? profile.gallantryAwardsDecoration) : profile.gallantryAwardsDecoration;
        const prof = this.isBn ? (profile.professionalQualificationBN ?? profile.professionalQualification) : profile.professionalQualification;
        const crps = this.isBn ? (profile.corpsBN ?? profile.corps) : profile.corps;
        return [namePart, deco, prof, crps].filter((value) => value && String(value).trim() !== '' && String(value).trim() !== 'N/A').join(', ');
    }

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

    getDocumentFileName(row: { fileName?: string; FileName?: string }): string {
        return row?.fileName ?? row?.FileName ?? '-';
    }

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
