import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Dashboard } from './app/pages/dashboard/dashboard';
import { Documentation } from './app/pages/documentation/documentation';
import { Landing } from './app/pages/landing/landing';
import { Notfound } from './app/pages/notfound/notfound';
// import { Login } from '@/pages/auth/login';
import { Login } from '@/Components/Features/Authentication/Login/login';
import { AuthGuard } from '@/Core/Guard/auth.guard';
// import { MotherOrg } from '@/Components/basic-setup/mother-org/mother-org';
import { Employeeinfo } from '@/Components/Features/EmployeeInfo/employeeinfo/employeeinfo';
import { Division } from '@/Components/basic-setup/division/division';
import { District } from '@/Components/basic-setup/district/district';
import { Upazila } from '@/Components/basic-setup/upazila/upazila';
import { BloodGroup } from '@/Components/basic-setup/blood-group/blood-group';
import { Relationship } from '@/Components/basic-setup/relationship/relationship';
import { MaritalStatus } from '@/Components/basic-setup/marital-status/marital-status';
import { Occupation } from '@/Components/basic-setup/occupation/occupation';
import { EducationQualification } from '@/Components/basic-setup/education-qualification/education-qualification';
import { EducationInstitutionType } from '@/Components/basic-setup/education-institution-type/education-institution-type';
import { CourseType } from '@/Components/basic-setup/course-type/course-type';
import { CourseGrade } from '@/Components/basic-setup/course-grade/course-grade';
import { PersonalQualification } from '@/Components/basic-setup/personal-qualification/personal-qualification';
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
import { OfficerType } from '@/Components/basic-setup/officer-type/officer-type';
import { RabWing } from '@/Components/basic-setup/rab-wing/rab-wing';
import { EducationInstitution } from '@/Components/basic-setup/education-institution/education-institution';
import { EducationResult } from '@/Components/basic-setup/education-result/education-result';
import { PersonalInfo } from '@/Components/Features/PersonalInfo/personal-info/personal-info';
import { Organization } from '@/Components/basic-setup/organization-setup/organization/organization';
import { OrganizationUnit } from '@/Components/basic-setup/organization-setup/organization-unit/organization-unit';
import { MotherOrgRank } from '@/Components/basic-setup/mother-org-rank/mother-org-rank';
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
import { EmpDisciplineInfoComponent } from '@/Components/Features/Emp/emp-discipline-info/emp-discipline-info';
import { EmpBankAccount } from '@/Components/Features/Emp/emp-bank-account/emp-bank-account.component';
import { EmpForeignVisit } from '@/Components/Features/Emp/emp-foreign-visit/emp-foreign-visit.component';
import { EmpLeaveInfo } from '@/Components/Features/Emp/emp-leave-info/emp-leave-info.component';
import { EmpMedicalCategory } from '@/Components/Features/Emp/emp-medical-category/emp-medical-category.component';
import { EmpAdditionalRemarks } from '@/Components/Features/Emp/emp-additional-remarks/emp-additional-remarks.component';
import { EmpPresentMemberCheckComponent } from '@/Components/Features/Emp/emp-present-member-check/emp-present-member-check.component';
import { RabIdAllocation } from '@/Components/Features/rab-id-allocation/rab-id-allocation';
import { SupernumeraryList } from '@/Components/Features/supernumerary-list/supernumerary-list';
import { SupernumeraryProfile } from '@/Components/Features/supernumerary-profile/supernumerary-profile';
import { PresentlyServingMembers } from '@/Components/Features/presently-serving-members/presently-serving-members';
import { Prefix } from '@/Components/basic-setup/prefix/prefix';
import { Gender } from '@/Components/basic-setup/gender/gender';
import { Bank } from '@/Components/basic-setup/bank/bank';
import { BankBranchComponent } from '@/Components/basic-setup/bank-branch/bank-branch';
import { TrainingInstitution } from '@/Components/basic-setup/training-institution/training-institution';
import { RankEquivalent } from '@/Components/basic-setup/rank-equivalent/rank-equivalent';
import { Religion } from '@/Components/basic-setup/religion/religion';
import { RabIdSerial } from '@/Components/basic-setup/rab-id-serial/rab-id-serial';
import { CalendarComponent } from '@/Components/Features/calendar/calendar.component';
import { TaskEventListComponent } from '@/Components/Features/calendar/task-event-list.component';
import { ChatContainerComponent } from '@/Components/Features/chat/chat-container.component';
import { IdentityUserCreateComponent } from '@/Components/Features/identity/identity-user-create/identity-user-create.component';
import { RoleListComponent } from '@/Components/Features/identity/role-list/role-list.component';
import { IdentityUserEmployeeMappingComponent } from '@/Components/Features/identity/identity-user-employee-mapping/identity-user-employee-mapping.component';

export const appRoutes: Routes = [
    // Public routes
    { path: 'login', component: Login },
    { path: 'landing', component: Landing },

    // Protected routes (inside layout)
    {
        path: '',
        component: AppLayout,
        canActivate: [AuthGuard],
        children: [
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            { path: 'dashboard', component: Dashboard },
            { path: 'calendar', component: CalendarComponent },
            { path: 'task-event-list', component: TaskEventListComponent },
            { path: 'chat', component: ChatContainerComponent },
            { path: 'identity/user-create', component: IdentityUserCreateComponent },
            { path: 'identity/roles', component: RoleListComponent },
            { path: 'identity/user-employee-mapping', component: IdentityUserEmployeeMappingComponent },
            { path: 'employee-info', component: Employeeinfo },
            { path: 'basic-setup/division', component: Division },
            { path: 'basic-setup/district', component: District },
            { path: 'basic-setup/upazila', component: Upazila },
            { path: 'basic-setup/blood-group', component: BloodGroup },
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
            { path: 'basic-setup/rab-unit', component: RabUnit },
            { path: 'basic-setup/officer-type', component: OfficerType },
            { path: 'basic-setup/rab-wing', component: RabWing },
            { path: 'basic-setup/mother-org', component: Organization },
            { path: 'basic-setup/organization-unit', component: OrganizationUnit },
            { path: 'basic-setup/mother-org-rank', component: MotherOrgRank },
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

            // EMP
            { path: 'emp-list', component: EmpList },
            { path: 'emp-basic-info', component: EmpBasicInfo },
            { path: 'emp-personal-info', component: EmpPersonalInfo },
            { path: 'emp-address-info', component: EmpAddressInfo },
            { path: 'emp-family-info', component: EmpFamilyInfo },
            { path: 'emp-nominee-info', component: EmpNomineeInfo },
            { path: 'emp-previous-rab-service', component: EmpPreviousRabService },
            { path: 'emp-service-history', component: EmpServiceHistory },
            { path: 'emp-promotion-info', component: EmpPromotionInfo },
            { path: 'emp-rank-confirmation', component: EmpRankConfirmationComponent },
            { path: 'emp-education-info', component: EmpEducationInfoComponent },
            { path: 'emp-course-info', component: EmpCourseInfoComponent },
            { path: 'emp-discipline-info', component: EmpDisciplineInfoComponent },
            { path: 'emp-bank-account', component: EmpBankAccount },
            { path: 'emp-foreign-visit', component: EmpForeignVisit },
            { path: 'emp-leave-info', component: EmpLeaveInfo },
            { path: 'emp-medical-category', component: EmpMedicalCategory },
            { path: 'emp-additional-remarks', component: EmpAdditionalRemarks },
            { path: 'emp-present-member-check', component: EmpPresentMemberCheckComponent },
            { path: 'rab-id-allocation', component: RabIdAllocation },
            { path: 'supernumerary-list', component: SupernumeraryList },
            { path: 'supernumerary-profile/:id', component: SupernumeraryProfile },
            { path: 'presently-serving-members', component: PresentlyServingMembers },

            { path: 'uikit', loadChildren: () => import('./app/pages/uikit/uikit.routes') },
            { path: 'documentation', component: Documentation },
            { path: 'pages', loadChildren: () => import('./app/pages/pages.routes') }
        ]
    },

    { path: 'notfound', component: Notfound },
    { path: '**', redirectTo: '/notfound' }
];
