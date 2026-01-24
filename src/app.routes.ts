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
import { MaritalStatus } from '@/Components/basic-setup/marital-status/relationship';

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
      {path: 'employee-info', component: Employeeinfo},
      { path: 'basic-setup/division', component: Division },
      { path: 'basic-setup/district', component: District },
      { path: 'basic-setup/upazila', component: Upazila },
      { path: 'basic-setup/blood-group', component: BloodGroup },
      { path: 'basic-setup/relationship', component: Relationship },
      { path: 'basic-setup/marital-status', component: MaritalStatus },
      { path: 'uikit', loadChildren: () => import('./app/pages/uikit/uikit.routes') },
      { path: 'documentation', component: Documentation },
      { path: 'pages', loadChildren: () => import('./app/pages/pages.routes') }
    ]
  },

  { path: 'notfound', component: Notfound },
  { path: '**', redirectTo: '/notfound' }
];

