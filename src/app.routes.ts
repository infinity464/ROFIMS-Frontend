import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Dashboard } from './app/pages/dashboard/dashboard';
import { Documentation } from './app/pages/documentation/documentation';
import { Landing } from './app/pages/landing/landing';
import { Notfound } from './app/pages/notfound/notfound';
// import { Login } from '@/pages/auth/login';
import { Login } from '@/Components/Features/Authentication/Login/login';
import { ChangePassword } from '@/Components/Features/Authentication/change-password/change-password';
import { AuthGuard } from '@/Core/Guard/auth.guard';
import { MemberTypePermissionGuard } from '@/Core/Guard/member-type-permission.guard';
import { DynamicSearchComponent } from '@/Components/Shared/dynamic-search/dynamic-search';
// import { MotherOrg } from '@/Components/basic-setup/mother-org/mother-org';
import { Employeeinfo } from '@/Components/Features/EmployeeInfo/employeeinfo/employeeinfo';
import { Division } from '@/Components/basic-setup/division/division';
import { District } from '@/Components/basic-setup/district/district';
import { Upazila } from '@/Components/basic-setup/upazila/upazila';
import { BloodGroup } from '@/Components/basic-setup/blood-group/blood-group';
import { MovementReason } from '@/Components/basic-setup/movement-reason/movement-reason';
import { MovementInfoComponent } from '@/Components/Features/movement-info/movement-info';
import { MovementListComponent } from '@/Components/Features/movement-list/movement-list';
import { Article47TakeoverBulkComponent } from '@/Components/Features/article-47-takeover-bulk/article-47-takeover-bulk';
import { NotesheetPreviewArticle47TakeoverComponent } from '@/Components/Features/notesheet-preview/article-47-takeover/notesheet-preview-article-47-takeover';
import { NotesheetPreviewArticle47HandoverComponent } from '@/Components/Features/notesheet-preview/article-47-handover/notesheet-preview-article-47-handover';
import { NotesheetPreviewMOComponent } from '@/Components/Features/notesheet-preview/mo/notesheet-preview-mo';
import { NotesheetPreviewCCComponent } from '@/Components/Features/notesheet-preview/cc/notesheet-preview-cc';
import { MovementLetterNumberConfigComponent } from '@/Components/basic-setup/movement-letter-number-config/movement-letter-number-config';
import { Relationship } from '@/Components/basic-setup/relationship/relationship';
import { MaritalStatus } from '@/Components/basic-setup/marital-status/marital-status';
import { Occupation } from '@/Components/basic-setup/occupation/occupation';
import { EducationQualification } from '@/Components/basic-setup/education-qualification/education-qualification';
import { EducationInstitutionType } from '@/Components/basic-setup/education-institution-type/education-institution-type';
import { CourseType } from '@/Components/basic-setup/course-type/course-type';
import { CourseGrade } from '@/Components/basic-setup/course-grade/course-grade';
import { PersonalQualification } from '@/Components/basic-setup/personal-qualification/personal-qualification';
import { SpecialQualification } from '@/Components/basic-setup/special-qualification/special-qualification';
import { VisitType } from '@/Components/basic-setup/visit-type/visit-type';
import { PunishmentType } from '@/Components/basic-setup/punishment-type/punishment-type';
import { OffenceType } from '@/Components/basic-setup/offence-type/offence-type';
import { BriefStatementOfOffence } from '@/Components/basic-setup/brief-statement-of-offence/brief-statement-of-offence';
import { MedicalCategoryType } from '@/Components/basic-setup/medical-category-type/medical-category-type';
import { PurposeOfVisitType } from '@/Components/basic-setup/purpose-of-visit-type/purpose-of-visit-type';
import { SubjectType } from '@/Components/basic-setup/subject-type/subject-type';
import { LeaveType } from '@/Components/basic-setup/leave-type/leave-type';
import { EquivalentName } from '@/Components/basic-setup/equivalent-name/equivalent-name';
import { EmployeeStatusType } from '@/Components/basic-setup/employee-status-type/employee-status-type';
import { EmployeeType } from '@/Components/basic-setup/employee-type/employee-type';
import { AppointmentCategory } from '@/Components/basic-setup/appointment-category/appointment-category';
import { RabId } from '@/Components/basic-setup/rab-id/rab-id';
import { RabUnit } from '@/Components/basic-setup/rab-unit/rab-unit';
import { RabStructureComponent } from '@/Components/basic-setup/rab-structure/rab-structure';
import { OrgTreeComponent } from '@/Components/basic-setup/org-tree/org-tree.component';
import { OfficerType } from '@/Components/basic-setup/officer-type/officer-type';
import { RabWing } from '@/Components/basic-setup/rab-wing/rab-wing';
import { EducationInstitution } from '@/Components/basic-setup/education-institution/education-institution';
import { EducationResult } from '@/Components/basic-setup/education-result/education-result';
import { PersonalInfo } from '@/Components/Features/PersonalInfo/personal-info/personal-info';
import { Organization } from '@/Components/basic-setup/organization-setup/organization/organization';
import { OrganizationUnit } from '@/Components/basic-setup/organization-setup/organization-unit/organization-unit';
import { MotherOrgRank } from '@/Components/basic-setup/mother-org-rank/mother-org-rank';
import { MotherOrgRankVacancyDistributionComponent } from '@/Components/basic-setup/mother-org-rank-vacancy-distribution/mother-org-rank-vacancy-distribution';
import { VacancyDistributionSummaryComponent } from '@/Components/basic-setup/vacancy-distribution-summary/vacancy-distribution-summary';
import { Corps } from '@/Components/basic-setup/corps/corps';
import { Batch } from '@/Components/basic-setup/batch/batch';
import { Decoration } from '@/Components/basic-setup/decoration/decoration';
import { ProfessionalQualification } from '@/Components/basic-setup/professional-qualification/professional-qualification';
import { PostOffice } from '@/Components/basic-setup/post-office/post-office';
import { EducationalDepartment } from '@/Components/basic-setup/educational-department/educational-department';
import { EducationSubject } from '@/Components/basic-setup/education-subject/education-subject';
import { Trade } from '@/Components/basic-setup/trade/trade';
import { Country } from '@/Components/basic-setup/country/country';
import { RabBranch } from '@/Components/basic-setup/rab-branch/rab-branch';
import { CourseName } from '@/Components/basic-setup/course-name/course-name';
import { EmpBasicInfo } from '@/Components/Features/Emp/emp-basic-info/emp-basic-info';
import { ServingMemberEntry } from '@/Components/Features/Emp/serving-member-entry/serving-member-entry';
import { ServicePostingEntry } from '@/Components/Features/Emp/service-posting-entry/service-posting-entry';
import { EmpBulkImport } from '@/Components/Features/Emp/emp-bulk-import/emp-bulk-import';
import { EmpList } from '@/Components/Features/Emp/emp-list/emp-list';
import { EmpPersonalInfo } from '@/Components/Features/Emp/emp-personal-info/emp-personal-info';
import { EmpAddressInfo } from '@/Components/Features/Emp/emp-address-info/emp-address-info';
import { EmpFamilyInfo } from '@/Components/Features/Emp/emp-family-info/emp-family-info';
import { EmpNomineeInfo } from '@/Components/Features/Emp/emp-nominee-info/emp-nominee-info';
import { EmpPreviousRabService } from '@/Components/Features/Emp/emp-previous-rab-service/emp-previous-rab-service';
import { EmpServiceHistory } from '@/Components/Features/Emp/emp-service-history/emp-service-history';
import { EmpPromotionInfo } from '@/Components/Features/Emp/emp-promotion-info/emp-promotion-info';
import { EmpRankConfirmationComponent } from '@/Components/Features/Emp/emp-rank-confirmation/emp-rank-confirmation';
import { EmpEducationInfoComponent } from '@/Components/Features/Emp/emp-education-info/emp-education-info';
import { EmpCourseInfoComponent } from '@/Components/Features/Emp/emp-course-info/emp-course-info';
import { EmpSendToCourseComponent } from '@/Components/Features/Emp/emp-send-to-course/emp-send-to-course';
import { EmpDraftListComponent } from '@/Components/Features/Emp/emp-draft-list/emp-draft-list';
import { EmpPendingFinalApprovalComponent } from '@/Components/Features/Emp/emp-pending-final-approval/emp-pending-final-approval';
import { EmpRftsCompletedComponent } from '@/Components/Features/Emp/emp-rfts-completed/emp-rfts-completed';
import { EmpDisciplineInfoComponent } from '@/Components/Features/Emp/emp-discipline-info/emp-discipline-info';
import { EmpBankAccount } from '@/Components/Features/Emp/emp-bank-account/emp-bank-account.component';
import { EmpForeignVisit } from '@/Components/Features/Emp/emp-foreign-visit/emp-foreign-visit.component';
import { EmpLeaveInfo } from '@/Components/Features/Emp/emp-leave-info/emp-leave-info.component';
import { EmpMedicalCategory } from '@/Components/Features/Emp/emp-medical-category/emp-medical-category.component';
import { EmpAdditionalRemarks } from '@/Components/Features/Emp/emp-additional-remarks/emp-additional-remarks.component';
import { EmpConfidentialRemarks } from '@/Components/Features/Emp/emp-confidential-remarks/emp-confidential-remarks.component';
import { EmpPermPostingMotherOrg } from '@/Components/Features/Emp/emp-perm-posting-mother-org/emp-perm-posting-mother-org.component';
import { PermanentPostingMORecordComponent } from '@/Components/Features/permanent-posting-mo-record/permanent-posting-mo-record';
import { PostedOutPersonListComponent } from '@/Components/Features/posted-out-person-list/posted-out-person-list';
import { NewJoiningPersonListComponent } from '@/Components/Features/new-joining-person-list/new-joining-person-list';
import { PostedOutRelieverReportComponent } from '@/Components/Features/posted-out-reliever-report/posted-out-reliever-report';
import { PostedOutServedReportComponent } from '@/Components/Features/posted-out-served-report/posted-out-served-report';
import { EmpPresentStatus } from '@/Components/Features/Emp/emp-present-status/emp-present-status';
import { EmpPersonalServiceInfoComponent } from '@/Components/Features/Emp/emp-personal-service-info/emp-personal-service-info';
import { EmpPresentMemberCheckComponent } from '@/Components/Features/Emp/emp-present-member-check/emp-present-member-check.component';
import { RabIdAllocation } from '@/Components/Features/rab-id-allocation/rab-id-allocation';
import { SupernumeraryList } from '@/Components/Features/supernumerary-list/supernumerary-list';
import { SupernumeraryProfile } from '@/Components/Features/supernumerary-profile/supernumerary-profile';
import { NewJoineeSendingNotesheet } from '@/Components/Features/new-joinee-sending-notesheet/new-joinee-sending-notesheet';
import { AddDraftNewPostingComponent } from '@/Components/Features/add-draft-new-posting/add-draft-new-posting';
import { PostingNotesheetGenerateComponent } from '@/Components/Features/posting-notesheet-generate/posting-notesheet-generate';
import { PostingOrderReceiveComponent } from '@/Components/Features/posting-order-receive/posting-order-receive';
import { PendingPostingJoiningComponent } from '@/Components/Features/pending-posting-joining/pending-posting-joining';
import { PendingInterPostingJoiningComponent } from '@/Components/Features/pending-inter-posting-joining/pending-inter-posting-joining';
import { PostingOrderGenerateComponent } from '@/Components/Features/posting-order-generate/posting-order-generate';
import { PostingOrderListComponent } from '@/Components/Features/posting-order-list/posting-order-list';
import { PostingOrderPreviewPageComponent } from '@/Components/Features/posting-order-preview/posting-order-preview';
import { EmployeeSignatureUploadComponent } from '@/Components/Features/employee-signature-upload/employee-signature-upload';
import { EmployeeFaceSearchComponent } from '@/Components/Features/employee-face-search/employee-face-search';
import { EmployeeFaceSearchHistoryComponent } from '@/Components/Features/employee-face-search-history/employee-face-search-history';
import { AddDraftInterPostingComponent } from '@/Components/Features/add-draft-inter-posting/add-draft-inter-posting';
import { InterPostingNotesheetGenerateComponent } from '@/Components/Features/inter-posting-notesheet-generate/inter-posting-notesheet-generate';
import { PresentlyServingMembers } from '@/Components/Features/presently-serving-members/presently-serving-members';
import { OrgTreeServingComponent } from '@/Components/Features/presently-serving-members/org-tree-serving/org-tree-serving';
import { ServingMemberProfile } from '@/Components/Features/presently-serving-members/serving-member-profile/serving-member-profile';
import { RabOrganogramComponent } from '@/Components/Features/presently-serving-members/rab-organogram/rab-organogram';
import { RabOrganogramMembersComponent } from '@/Components/Features/presently-serving-members/rab-organogram/rab-organogram-members/rab-organogram-members';
import { ExMembers } from '@/Components/Features/ex-members/ex-members';
import { ExMemberProfile } from '@/Components/Features/ex-members/ex-member-profile/ex-member-profile';
import { Prefix } from '@/Components/basic-setup/prefix/prefix';
import { Gender } from '@/Components/basic-setup/gender/gender';
import { Bank } from '@/Components/basic-setup/bank/bank';
import { BankBranchComponent } from '@/Components/basic-setup/bank-branch/bank-branch';
import { TrainingInstitution } from '@/Components/basic-setup/training-institution/training-institution';
import { RankEquivalent } from '@/Components/basic-setup/rank-equivalent/rank-equivalent';
import { Religion } from '@/Components/basic-setup/religion/religion';
import { RabIdSerial } from '@/Components/basic-setup/rab-id-serial/rab-id-serial';
import { AbsentType } from '@/Components/basic-setup/absent-type/absent-type';
import { NotesheetTemplateComponent } from '@/Components/basic-setup/notesheet-template/notesheet-template';
import { NoteSheetNumberConfigComponent } from '@/Components/basic-setup/notesheet-number-config/notesheet-number-config';
import { LeaveCardNumberConfigComponent } from '@/Components/basic-setup/leave-card-number-config/leave-card-number-config';
import { NoteSheetApproverConfigComponent } from '@/Components/basic-setup/notesheet-approver-config/notesheet-approver-config';
import { PostingOrderNumberConfigComponent } from '@/Components/basic-setup/posting-order-number-config/posting-order-number-config';
import { OnulipiConfigComponent } from '@/Components/basic-setup/onulipi-config/onulipi-config';
import { NotesheetGenerateComponent } from '@/Components/Features/notesheet-generate/notesheet-generate';
import { NotesheetExBdLeaveComponent } from '@/Components/Features/notesheet-ex-bd-leave/notesheet-ex-bd-leave';
import { ExBdLeaveApplyComponent } from '@/Components/Features/ex-bd-leave-application/ex-bd-leave-apply/ex-bd-leave-apply.component';
import { ExBdLeaveListComponent } from '@/Components/Features/ex-bd-leave-application/ex-bd-leave-list/ex-bd-leave-list.component';
import { NotesheetListComponent } from '@/Components/Features/notesheet-list/notesheet-list';
import { NotesheetPreviewComponent } from '@/Components/Features/notesheet-preview/notesheet-preview';
import { NotesheetPreviewGeneralComponent } from '@/Components/Features/notesheet-preview/general/notesheet-preview-general';
import { NotesheetPreviewPostingComponent } from '@/Components/Features/notesheet-preview/posting/notesheet-preview-posting';
import { NotesheetPreviewExbdComponent } from '@/Components/Features/notesheet-preview/exbd/notesheet-preview-exbd';
import { LeaveApplicationApplyComponent } from '@/Components/Features/leave-application/leave-application-apply/leave-application-apply.component';
import { LeaveApplicationListComponent } from '@/Components/Features/leave-application/leave-application-list/leave-application-list.component';
import { LeavePendingApprovalListComponent } from '@/Components/Features/leave-application/leave-pending-approval-list/leave-pending-approval-list.component';
import { LeavePendingApprovalPreviewComponent } from '@/Components/Features/leave-application/leave-pending-approval-preview/leave-pending-approval-preview.component';
import { LeaveHistoryListComponent } from '@/Components/Features/leave-application/leave-history-list/leave-history-list.component';
import { LeaveMyApplicationsComponent } from '@/Components/Features/leave-application/leave-my-applications/leave-my-applications.component';
import { LeaveApplyForOtherComponent } from '@/Components/Features/leave-application/leave-apply-for-other/leave-apply-for-other.component';
import { LeaveActionTakenByMeComponent } from '@/Components/Features/leave-application/leave-action-taken-by-me/leave-action-taken-by-me.component';
import { LeaveCardComponent } from '@/Components/Features/leave-application/leave-card/leave-card.component';
import { CalendarComponent } from '@/Components/Features/calendar/calendar.component';
import { TaskEventListComponent } from '@/Components/Features/calendar/task-event-list.component';
import { ChatContainerComponent } from '@/Components/Features/chat/chat-container.component';
import { IdentityUserCreateComponent } from '@/Components/Features/identity/identity-user-create/identity-user-create.component';
import { RoleListComponent } from '@/Components/Features/identity/role-list/role-list.component';
import { NoticeListComponent } from '@/Components/Features/notice/notice-list/notice-list.component';
import { AuditTimelineComponent } from '@/Components/Features/audit/audit-timeline.component';
import { MenuManagement } from '@/Components/Features/menu-management/menu-management';
import { RoleMenuPermission } from '@/Components/Features/role-menu-permission/role-menu-permission';
import { LoginAuditComponent } from '@/Components/Features/login-audit/login-audit.component';
import { MyLoginAuditComponent } from '@/Components/Features/my-login-audit/my-login-audit.component';
import { SessionPolicyComponent } from '@/Components/Features/settings/session-policy/session-policy.component';
import { EmployeeReportsComponent } from '@/Components/Features/employee-reports/employee-reports.component';
import { ReportFamilyOccupationComponent } from '@/Components/Features/employee-reports/report-family-occupation/report-family-occupation.component';
import { ReportRftsCompletionComponent } from '@/Components/Features/employee-reports/report-rfts-completion/report-rfts-completion.component';
import { ReportAddressLocationComponent } from '@/Components/Features/employee-reports/report-address-location/report-address-location.component';
import { ReportDynamicComponent } from '@/Components/Features/employee-reports/report-dynamic/report-dynamic.component';
import { ReportMemberTypeServingComponent } from '@/Components/Features/employee-reports/report-member-type-serving/report-member-type-serving.component';
import { ReportPendingInterPostingComponent } from '@/Components/Features/employee-reports/report-pending-inter-posting/report-pending-inter-posting.component';
import { ReportSupernumeraryComponent } from '@/Components/Features/employee-reports/report-supernumerary/report-supernumerary.component';
import { ReportPresentStatusByMotherOrgComponent } from '@/Components/Features/employee-reports/report-present-status-by-mother-org/report-present-status-by-mother-org.component';
import { ReportPresentStatusUnitWiseComponent } from '@/Components/Features/employee-reports/report-present-status-unit-wise/report-present-status-unit-wise.component';
import { ReportUnitDurationNominalRollComponent } from '@/Components/Features/employee-reports/report-unit-duration-nominal-roll/report-unit-duration-nominal-roll.component';
import { ReportLongStayNominalRollComponent } from '@/Components/Features/employee-reports/report-long-stay-nominal-roll/report-long-stay-nominal-roll.component';
import { ReportStayAfterRelieverJoinedComponent } from '@/Components/Features/employee-reports/report-stay-after-reliever-joined/report-stay-after-reliever-joined.component';
import { ReportNearHomeDistrictComponent } from '@/Components/Features/employee-reports/report-near-home-district/report-near-home-district.component';
import { ReportJoiningLeaveComponent } from '@/Components/Features/employee-reports/report-joining-leave/report-joining-leave.component';
import { ReportMovementComponent } from '@/Components/Features/employee-reports/report-movement/report-movement.component';
import { ReportLeaveComponent } from '@/Components/Features/employee-reports/report-leave/report-leave.component';
import { ReportPunishmentComponent } from '@/Components/Features/employee-reports/report-punishment/report-punishment.component';
import { ReportPresentStatusComponent } from '@/Components/Features/employee-reports/report-present-status/report-present-status.component';
import { ReportRankWiseComponent } from '@/Components/Features/employee-reports/report-rank-wise/report-rank-wise.component';
import { ReportDeceasedComponent } from '@/Components/Features/employee-reports/report-deceased/report-deceased.component';
import { IndividualReportsComponent } from '@/Components/Features/individual-reports/individual-reports.component';
import { RabUnitAor } from '@/Components/basic-setup/rab-unit-aor/rab-unit-aor';
import { RabUnitAorMap } from '@/Components/basic-setup/rab-unit-aor-map/rab-unit-aor-map';
import { ManpowerSummaryComponent } from '@/Components/Features/statistics/manpower-summary/manpower-summary';
import { ManpowerChartComponent } from '@/Components/Features/statistics/manpower-chart/manpower-chart';
import { RankWiseManpowerComponent } from '@/Components/Features/statistics/rank-wise-manpower/rank-wise-manpower';
import { MotherUnitWiseManpowerComponent } from '@/Components/Features/statistics/mother-unit-wise-manpower/mother-unit-wise-manpower';
import { CorpsWiseManpowerComponent } from '@/Components/Features/statistics/corps-wise-manpower/corps-wise-manpower';
import { TradeWiseManpowerComponent } from '@/Components/Features/statistics/trade-wise-manpower/trade-wise-manpower';
import { MemberTypeWiseManpowerComponent } from '@/Components/Features/statistics/member-type-wise-manpower/member-type-wise-manpower';
import { UnitWiseBarChartComponent } from '@/Components/Features/statistics/unit-wise-bar-chart/unit-wise-bar-chart';
import { UnitRankWiseManpowerComponent } from '@/Components/Features/statistics/unit-rank-wise-manpower/unit-rank-wise-manpower';
import { SystemMonitoringComponent } from '@/Components/Features/system-monitoring/system-monitoring';
import { OfficeOrderGenerateComponent } from '@/Components/Features/office-order-generate/office-order-generate';
import { OfficeOrderPreviewComponent } from '@/Components/Features/office-order-preview/office-order-preview';
import { OfficeOrderExBdLeaveGenerateComponent } from '@/Components/Features/office-order-ex-bd-leave-generate/office-order-ex-bd-leave-generate';
import { OfficeOrderExBdLeavePreviewComponent } from '@/Components/Features/office-order-ex-bd-leave-preview/office-order-ex-bd-leave-preview';
import { ClearanceExBdLeaveGenerateComponent } from '@/Components/Features/clearance-ex-bd-leave-generate/clearance-ex-bd-leave-generate';
import { ClearanceExBdLeavePreviewComponent } from '@/Components/Features/clearance-ex-bd-leave-preview/clearance-ex-bd-leave-preview';
import { ClearanceExBdLeaveListComponent } from '@/Components/Features/clearance-ex-bd-leave-list/clearance-ex-bd-leave-list';

export const appRoutes: Routes = [
    // Public routes
    { path: 'login', component: Login },
    { path: 'landing', component: Landing },

    // Protected routes (inside layout)
    {
        path: '',
        component: AppLayout,
        canActivate: [AuthGuard],
        canActivateChild: [AuthGuard],
        children: [
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            { path: 'dashboard', component: Dashboard },
            { path: 'calendar', component: CalendarComponent },
            { path: 'task-event-list', component: TaskEventListComponent },
            { path: 'chat', component: ChatContainerComponent },
            { path: 'identity/user-create', component: IdentityUserCreateComponent },
            { path: 'identity/roles', component: RoleListComponent },
            { path: 'notice/list', component: NoticeListComponent },
            { path: 'admin/audit', component: AuditTimelineComponent },
            { path: 'employee-info', component: Employeeinfo },
            { path: 'basic-setup/division', component: Division },
            { path: 'basic-setup/district', component: District },
            { path: 'basic-setup/upazila', component: Upazila },
            { path: 'basic-setup/blood-group', component: BloodGroup },
            { path: 'basic-setup/movement-reason', component: MovementReason },
            { path: 'basic-setup/movement-letter-number-config', component: MovementLetterNumberConfigComponent },
            { path: 'movement-info', component: MovementInfoComponent },
            { path: 'movement/article-47-takeover-bulk', component: Article47TakeoverBulkComponent },
            { path: 'movement-list', component: MovementListComponent },
            { path: 'movement-preview/article-47-takeover', component: NotesheetPreviewArticle47TakeoverComponent },
            { path: 'movement-preview/article-47-handover', component: NotesheetPreviewArticle47HandoverComponent },
            { path: 'movement-preview/mo', component: NotesheetPreviewMOComponent },
            { path: 'movement-preview/cc', component: NotesheetPreviewCCComponent },
            { path: 'movement-preview/cc/:token', component: NotesheetPreviewCCComponent },
            { path: 'basic-setup/relationship', component: Relationship },
            { path: 'basic-setup/marital-status', component: MaritalStatus },
            { path: 'basic-setup/occupation', component: Occupation },
            { path: 'basic-setup/education-qualification', component: EducationQualification },
            { path: 'basic-setup/education-institution-type', component: EducationInstitutionType },
            { path: 'basic-setup/education-institution', component: EducationInstitution },
            { path: 'basic-setup/education-result', component: EducationResult },
            { path: 'basic-setup/course-type', component: CourseType },
            { path: 'basic-setup/course-grade', component: CourseGrade },
            { path: 'basic-setup/personal-qualification', component: PersonalQualification },
            { path: 'basic-setup/special-qualification', component: SpecialQualification },
            { path: 'basic-setup/visit-type', component: VisitType },
            { path: 'basic-setup/punishment-type', component: PunishmentType },
            { path: 'basic-setup/offence-type', component: OffenceType },
            { path: 'basic-setup/brief-statement-of-offence', component: BriefStatementOfOffence },
            { path: 'basic-setup/medical-category-type', component: MedicalCategoryType },
            { path: 'basic-setup/purpose-of-visit-type', component: PurposeOfVisitType },
            { path: 'basic-setup/subject-type', component: SubjectType },
            { path: 'basic-setup/leave-type', component: LeaveType },
            { path: 'basic-setup/equivalent-name', component: EquivalentName },
            { path: 'basic-setup/employee-status-type', component: EmployeeStatusType },
            { path: 'basic-setup/employee-type', component: EmployeeType },
            { path: 'basic-setup/appointment-category', component: AppointmentCategory },
            { path: 'basic-setup/rab-id', component: RabId },
            { path: 'basic-setup/rab-structure', component: RabStructureComponent },
            { path: 'basic-setup/org-tree', component: OrgTreeComponent },
            { path: 'basic-setup/rab-unit', component: RabUnit },
            { path: 'basic-setup/rab-unit-aor', component: RabUnitAor },
            { path: 'basic-setup/rab-unit-aor-map', component: RabUnitAorMap },
            { path: 'basic-setup/officer-type', component: OfficerType },
            { path: 'basic-setup/rab-wing', component: RabWing },
            { path: 'basic-setup/mother-org', component: Organization },
            { path: 'basic-setup/organization-unit', component: OrganizationUnit },
            { path: 'basic-setup/mother-org-rank', component: MotherOrgRank },
            { path: 'basic-setup/mother-org-rank-vacancy-distribution', component: MotherOrgRankVacancyDistributionComponent },
            { path: 'basic-setup/vacancy-distribution-summary', component: VacancyDistributionSummaryComponent },
            { path: 'basic-setup/corps', component: Corps },
            { path: 'basic-setup/prefix', component: Prefix },
            { path: 'basic-setup/gender', component: Gender },
            { path: 'basic-setup/batch', component: Batch },
            { path: 'basic-setup/decoration', component: Decoration },
            { path: 'basic-setup/professional-qualification', component: ProfessionalQualification },
            { path: 'basic-setup/post-office', component: PostOffice },
            { path: 'basic-setup/educational-department', component: EducationalDepartment },
            { path: 'basic-setup/education-subject', component: EducationSubject },
            { path: 'basic-setup/trade', component: Trade },
            { path: 'basic-setup/country', component: Country },
            { path: 'basic-setup/rab-branch', component: RabBranch },
            { path: 'basic-setup/course-name', component: CourseName },
            { path: 'personal-info', component: PersonalInfo },
            { path: 'basic-setup/bank', component: Bank },
            { path: 'basic-setup/bank-branch', component: BankBranchComponent },
            { path: 'basic-setup/training-institution', component: TrainingInstitution },
            { path: 'basic-setup/rank-equivalent', component: RankEquivalent },
            { path: 'basic-setup/religion', component: Religion },
            { path: 'basic-setup/rab-id-serial', component: RabIdSerial },
            { path: 'basic-setup/absent-type', component: AbsentType },
            { path: 'basic-setup/notesheet-template', component: NotesheetTemplateComponent },
            { path: 'basic-setup/notesheet-number-config', component: NoteSheetNumberConfigComponent },
            { path: 'basic-setup/leave-card-number-config', component: LeaveCardNumberConfigComponent },
            { path: 'basic-setup/notesheet-approver-config', component: NoteSheetApproverConfigComponent },
            { path: 'basic-setup/posting-order-number-config', component: PostingOrderNumberConfigComponent },
            { path: 'basic-setup/onulipi-config', component: OnulipiConfigComponent },
            { path: 'notesheet-generate', component: NotesheetGenerateComponent },
            { path: 'notesheet-ex-bd-leave', component: NotesheetExBdLeaveComponent },
            { path: 'ex-bd-leave/apply', component: ExBdLeaveApplyComponent },
            { path: 'ex-bd-leave/apply/:id', component: ExBdLeaveApplyComponent },
            { path: 'ex-bd-leave/list', component: ExBdLeaveListComponent },
            { path: 'notesheet-list', redirectTo: 'notesheet-list/draft', pathMatch: 'full' },
            { path: 'notesheet-list/draft', component: NotesheetListComponent, data: { section: 'draft', noteSheetTypeFilter: 'General' } },
            { path: 'notesheet-list/pending', component: NotesheetListComponent, data: { section: 'pending', noteSheetTypeFilter: 'General' } },
            { path: 'notesheet-list/approved', component: NotesheetListComponent, data: { section: 'approved', noteSheetTypeFilter: 'General' } },
            { path: 'notesheet-list/declined', component: NotesheetListComponent, data: { section: 'declined', noteSheetTypeFilter: 'General' } },
            { path: 'notesheet-list/all', component: NotesheetListComponent, data: { section: 'all', noteSheetTypeFilter: 'General' } },
            { path: 'notesheet-list/draft-ex-bd-leave', component: NotesheetListComponent, data: { section: 'draft', noteSheetTypeFilter: 'ExBDLeave' } },
            { path: 'notesheet-list/pending-ex-bd-leave', component: NotesheetListComponent, data: { section: 'pending', noteSheetTypeFilter: 'ExBDLeave' } },
            { path: 'notesheet-list/approved-ex-bd-leave', component: NotesheetListComponent, data: { section: 'approved', noteSheetTypeFilter: 'ExBDLeave' } },
            { path: 'notesheet-list/declined-ex-bd-leave', component: NotesheetListComponent, data: { section: 'declined', noteSheetTypeFilter: 'ExBDLeave' } },
            { path: 'notesheet-list/all-ex-bd-leave', component: NotesheetListComponent, data: { section: 'all', noteSheetTypeFilter: 'ExBDLeave' } },
            { path: 'notesheet-list/pending-new-posting', component: NotesheetListComponent, data: { section: 'pending', noteSheetTypeFilter: 'NewPosting' } },
            { path: 'notesheet-list/pending-finalized-new-posting', component: NotesheetListComponent, data: { section: 'draft', noteSheetTypeFilter: 'NewPosting' } },
            { path: 'notesheet-list/approved-new-posting', component: NotesheetListComponent, data: { section: 'approved', noteSheetTypeFilter: 'NewPosting' } },
            { path: 'notesheet-list/declined-new-posting', component: NotesheetListComponent, data: { section: 'declined', noteSheetTypeFilter: 'NewPosting' } },
            { path: 'notesheet-list/all-new-posting', component: NotesheetListComponent, data: { section: 'all', noteSheetTypeFilter: 'NewPosting' } },
            { path: 'notesheet-list/draft-inter-posting', component: NotesheetListComponent, data: { section: 'draft', noteSheetTypeFilter: 'InterPosting' } },
            { path: 'notesheet-list/pending-inter-posting', component: NotesheetListComponent, data: { section: 'pending', noteSheetTypeFilter: 'InterPosting' } },
            { path: 'notesheet-list/approved-inter-posting', component: NotesheetListComponent, data: { section: 'approved', noteSheetTypeFilter: 'InterPosting' } },
            { path: 'notesheet-list/declined-inter-posting', component: NotesheetListComponent, data: { section: 'declined', noteSheetTypeFilter: 'InterPosting' } },
            { path: 'notesheet-list/all-inter-posting', component: NotesheetListComponent, data: { section: 'all', noteSheetTypeFilter: 'InterPosting' } },
            // System-generate "My Approval" lists — per-logged-in-user, only note sheets currently awaiting their action.
            { path: 'notesheet-list/my-approval', component: NotesheetListComponent, data: { section: 'my-pending', noteSheetTypeFilter: 'General' } },
            { path: 'notesheet-list/my-approval-ex-bd-leave', component: NotesheetListComponent, data: { section: 'my-pending', noteSheetTypeFilter: 'ExBDLeave' } },
            { path: 'notesheet-list/my-approval-new-posting', component: NotesheetListComponent, data: { section: 'my-pending', noteSheetTypeFilter: 'NewPosting' } },
            { path: 'notesheet-list/my-approval-inter-posting', component: NotesheetListComponent, data: { section: 'my-pending', noteSheetTypeFilter: 'InterPosting' } },
            { path: 'notesheet-preview',         component: NotesheetPreviewComponent },
            { path: 'notesheet-preview/general', component: NotesheetPreviewGeneralComponent },
            { path: 'notesheet-preview/posting', component: NotesheetPreviewPostingComponent },
            { path: 'notesheet-preview/exbd',    component: NotesheetPreviewExbdComponent },

            // Leave Application (apply and approve/reject - standalone from notesheet)
            { path: 'leave-application/apply', component: LeaveApplicationApplyComponent },
            { path: 'leave-application/list', component: LeaveApplicationListComponent },
            { path: 'leave-application/pending-approval', component: LeavePendingApprovalListComponent },
            { path: 'leave-application/preview', component: LeavePendingApprovalPreviewComponent },
            { path: 'leave-application/history', component: LeaveHistoryListComponent },
            { path: 'leave-application/my-applications', component: LeaveMyApplicationsComponent },
            { path: 'leave-application/apply-for-other', component: LeaveApplyForOtherComponent },
            { path: 'leave-application/action-taken-by-me', component: LeaveActionTakenByMeComponent },
            { path: 'leave-application/card', component: LeaveCardComponent },
            
            // EMP
            { path: 'emp-list', component: EmpList },
            { path: 'emp-basic-info', component: EmpBasicInfo, canActivate: [MemberTypePermissionGuard] },
            { path: 'serving-member-entry', component: ServingMemberEntry, canActivate: [MemberTypePermissionGuard] },
            { path: 'service-posting-entry', component: ServicePostingEntry, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-bulk-import', component: EmpBulkImport, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-personal-service-info', component: EmpPersonalServiceInfoComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-personal-info', component: EmpPersonalInfo, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-address-info', component: EmpAddressInfo, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-family-info', component: EmpFamilyInfo, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-nominee-info', component: EmpNomineeInfo, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-previous-rab-service', component: EmpPreviousRabService, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-service-history', component: EmpServiceHistory, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-promotion-info', component: EmpPromotionInfo, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-rank-confirmation', component: EmpRankConfirmationComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-education-info', component: EmpEducationInfoComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-course-info', component: EmpCourseInfoComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-send-to-course', component: EmpSendToCourseComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-draft-list', component: EmpDraftListComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-pending-final-approval', component: EmpPendingFinalApprovalComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-rfts-completed', component: EmpRftsCompletedComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-discipline-info', component: EmpDisciplineInfoComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-bank-account', component: EmpBankAccount, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-foreign-visit', component: EmpForeignVisit, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-leave-info', component: EmpLeaveInfo, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-medical-category', component: EmpMedicalCategory, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-additional-remarks', component: EmpAdditionalRemarks, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-confidential-remarks', component: EmpConfidentialRemarks, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-perm-posting-mother-org', component: EmpPermPostingMotherOrg, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-present-status', component: EmpPresentStatus, canActivate: [MemberTypePermissionGuard] },
            { path: 'emp-present-member-check', component: EmpPresentMemberCheckComponent, canActivate: [MemberTypePermissionGuard] },
            { path: 'rab-id-allocation', component: RabIdAllocation },
            { path: 'supernumerary-list', component: SupernumeraryList },
            { path: 'supernumerary-profile/:id', component: SupernumeraryProfile },
            { path: 'new-joinee-sending-notesheet', component: NewJoineeSendingNotesheet },
            { path: 'posting/permanent-posting-mo-record', component: PermanentPostingMORecordComponent },
            { path: 'posting/posted-out-person-list', component: PostedOutPersonListComponent },
            { path: 'posting/new-joining-person-list', component: NewJoiningPersonListComponent },
            { path: 'posting/posted-out-reliever-report', component: PostedOutRelieverReportComponent },
            { path: 'posting/posted-out-served-report', component: PostedOutServedReportComponent },
            { path: 'posting/add-draft-new-posting', component: AddDraftNewPostingComponent },
            { path: 'posting/notesheet-generate', component: PostingNotesheetGenerateComponent },
            { path: 'posting/add-draft-inter-posting', component: AddDraftInterPostingComponent },
            { path: 'posting/inter-posting-notesheet-generate', component: InterPostingNotesheetGenerateComponent },
            { path: 'posting/posting-order-generate', component: PostingOrderGenerateComponent, data: { postingType: 'NewPosting' } },
            { path: 'posting/inter-posting-order-generate', component: PostingOrderGenerateComponent, data: { postingType: 'InterPosting' } },
            { path: 'posting/posting-order-receive', component: PostingOrderReceiveComponent },
            { path: 'posting/pending-posting-joining', component: PendingPostingJoiningComponent },
            { path: 'posting/pending-inter-posting-joining', component: PendingInterPostingJoiningComponent },
            { path: 'posting/posting-order-list', component: PostingOrderListComponent },
            { path: 'posting/posting-order-preview', component: PostingOrderPreviewPageComponent },
            { path: 'office-order/generate', component: OfficeOrderGenerateComponent },
            { path: 'office-order/preview', component: OfficeOrderPreviewComponent },
            { path: 'office-order-ex-bd-leave/generate', component: OfficeOrderExBdLeaveGenerateComponent },
            { path: 'office-order-ex-bd-leave/list', component: OfficeOrderExBdLeavePreviewComponent },
            { path: 'office-order-ex-bd-leave/preview', component: OfficeOrderExBdLeavePreviewComponent },
            { path: 'clearance-ex-bd-leave/generate', component: ClearanceExBdLeaveGenerateComponent },
            { path: 'clearance-ex-bd-leave/preview', component: ClearanceExBdLeavePreviewComponent },
            { path: 'clearance-ex-bd-leave-list', component: ClearanceExBdLeaveListComponent },
            { path: 'employee-signature-upload', component: EmployeeSignatureUploadComponent },
            { path: 'employee-face-search', component: EmployeeFaceSearchComponent },
            { path: 'employee-face-search-history', component: EmployeeFaceSearchHistoryComponent },
            { path: 'presently-serving-members', component: PresentlyServingMembers },
            { path: 'serving-members-for-inter-posting', component: PresentlyServingMembers, data: { mode: 'interPosting' } },
            { path: 'presently-serving-members/organogram', component: OrgTreeServingComponent },
            { path: 'organogram', component: RabOrganogramComponent },
            { path: 'presently-serving-members/rab-organogram-members', component: RabOrganogramMembersComponent },
            { path: 'presently-serving-members/profile/:employeeId', component: ServingMemberProfile },
            { path: 'ex-members', component: ExMembers },
            { path: 'ex-members/profile/:employeeId', component: ExMemberProfile },
            { path: 'members/profile/:employeeId', component: ExMemberProfile },

            // Employee Reports
            { path: 'employee-reports', component: EmployeeReportsComponent },
            { path: 'report-family-occupation', component: ReportFamilyOccupationComponent },
            { path: 'report-rfts-completion', component: ReportRftsCompletionComponent },
            { path: 'report-address-location', component: ReportAddressLocationComponent },
            { path: 'report-dynamic', component: ReportDynamicComponent },
            { path: 'member-type-reporting', component: ReportMemberTypeServingComponent },
            { path: 'report-pending-inter-posting', component: ReportPendingInterPostingComponent },
            { path: 'report-supernumerary', component: ReportSupernumeraryComponent },
            { path: 'report-present-status-by-mother-org', component: ReportPresentStatusByMotherOrgComponent },
            { path: 'report-present-status-unit-wise', component: ReportPresentStatusUnitWiseComponent },
            { path: 'report-unit-duration-nominal-roll', component: ReportUnitDurationNominalRollComponent },
            { path: 'report-long-stay-nominal-roll', component: ReportLongStayNominalRollComponent },
            { path: 'report-stay-after-reliever-joined', component: ReportStayAfterRelieverJoinedComponent },
            { path: 'report-near-home-district', component: ReportNearHomeDistrictComponent },
            { path: 'report-joining-leave', component: ReportJoiningLeaveComponent },
            { path: 'report-movement', component: ReportMovementComponent },
            { path: 'report-leave', component: ReportLeaveComponent },
            { path: 'report-punishment', component: ReportPunishmentComponent },
            { path: 'report-present-status', component: ReportPresentStatusComponent },
            { path: 'report-rank-wise', component: ReportRankWiseComponent },
            { path: 'report-deceased', component: ReportDeceasedComponent },

            // Individual Personnel Report (parent with dropdown — Course, then more)
            { path: 'individual-reports', component: IndividualReportsComponent },

            // Statistics
            { path: 'statistics/manpower-summary', component: ManpowerSummaryComponent },
            { path: 'statistics/manpower-chart', component: ManpowerChartComponent },
            { path: 'statistics/rank-wise-manpower', component: RankWiseManpowerComponent },
            { path: 'statistics/mother-unit-wise-manpower', component: MotherUnitWiseManpowerComponent },
            { path: 'statistics/corps-wise-manpower', component: CorpsWiseManpowerComponent },
            { path: 'statistics/trade-wise-manpower', component: TradeWiseManpowerComponent },
            { path: 'statistics/member-type-wise-manpower', component: MemberTypeWiseManpowerComponent },
            { path: 'statistics/unit-wise-bar-chart', component: UnitWiseBarChartComponent },
            { path: 'statistics/unit-rank-wise-manpower', component: UnitRankWiseManpowerComponent },

            // Dynamic Search
            { path: 'dynamic-search', component: DynamicSearchComponent },

            // System Monitoring
            { path: 'system-monitoring', component: SystemMonitoringComponent },

            // Menu Management
            { path: 'menu-management', component: MenuManagement },

            // Role Menu Permissions
            { path: 'identity/role-menu-permission', component: RoleMenuPermission },

            // Login Audit
            { path: 'identity/login-audit', component: LoginAuditComponent },
            { path: 'identity/my-login-audit', component: MyLoginAuditComponent },

            // Change Password
            { path: 'change-password', component: ChangePassword },

            // Settings
            { path: 'settings/session-policy', component: SessionPolicyComponent },

            { path: 'uikit', loadChildren: () => import('./app/pages/uikit/uikit.routes') },
            { path: 'documentation', component: Documentation },
            { path: 'pages', loadChildren: () => import('./app/pages/pages.routes') }
        ]
    },

    { path: 'notfound', component: Notfound },
    { path: '**', redirectTo: '/notfound' }
];
