import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Dashboard } from './app/pages/dashboard/dashboard';
import { Documentation } from './app/pages/documentation/documentation';
import { Landing } from './app/pages/landing/landing';
import { Notfound } from './app/pages/notfound/notfound';
// import { Login } from '@/pages/auth/login';
import { Login } from '@/Components/Features/Authentication/Login/login';
import { AuthGuard } from '@/Core/Guard/auth.guard';
import { MotherOrg } from '@/Components/basic-setup/mother-org/mother-org';
import { Division } from '@/Components/basic-setup2/division/division';

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
      { path: 'basic-setup/mother-org', component: MotherOrg },
      { path: 'basic-setup/division', component: Division },
      { path: 'uikit', loadChildren: () => import('./app/pages/uikit/uikit.routes') },
      { path: 'documentation', component: Documentation },
      { path: 'pages', loadChildren: () => import('./app/pages/pages.routes') }
    ]
  },

  { path: 'notfound', component: Notfound },
  { path: '**', redirectTo: '/notfound' }
];

