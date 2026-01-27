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
import { MotherOrg } from '@/Components/test/mother-org/mother-org';
import { Organization } from '@/Components/organization-setup/organization/organization';
import { OrganizationUnit } from '@/Components/organization-setup/organization-unit/organization-unit';
import { MotherOrgRank } from '@/Components/basic-setup/mother-org-rank/mother-org-rank';
import { Corps } from '@/Components/basic-setup/corps/corps';
import { Batch } from '@/Components/basic-setup/batch/batch';
import { Decoration } from '@/Components/basic-setup/decoration/decoration';

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
            { path: 'basic-setup/leave-type', component: LeaveType },
            { path: 'basic-setup/equivalent-name', component: EquivalentName },
            { path: 'basic-setup/employee-status-type', component: EmployeeStatusType },
            { path: 'basic-setup/employee-type', component: EmployeeType },
            { path: 'basic-setup/appointment-category', component: AppointmentCategory },
            { path: 'basic-setup/rab-id', component: RabId },
            { path: 'basic-setup/rab-unit', component: RabUnit },
            { path: 'basic-setup/officer-type', component: OfficerType },
            { path: 'basic-setup/rab-wing', component: RabWing },
            { path: 'personal-info', component: PersonalInfo },
            { path: 'mother-org', component: Organization },
            { path: 'organization-unit', component: OrganizationUnit },
            { path: 'basic-setup/mother-org-rank', component: MotherOrgRank },
            { path: 'basic-setup/corps', component: Corps },
            { path: 'basic-setup/batch', component: Batch },
            { path: 'basic-setup/decoration', component: Decoration },

            { path: 'uikit', loadChildren: () => import('./app/pages/uikit/uikit.routes') },
            { path: 'documentation', component: Documentation },
            { path: 'pages', loadChildren: () => import('./app/pages/pages.routes') }
        ]
    },

    { path: 'notfound', component: Notfound },
    { path: '**', redirectTo: '/notfound' }
];
