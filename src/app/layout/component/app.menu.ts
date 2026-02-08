import { Component } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { PanelMenu, PanelMenuModule } from 'primeng/panelmenu';
import { RouterModule } from '@angular/router';
import { Menu } from 'primeng/menu';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [RouterModule, PanelMenuModule],
    template: ` <p-panelmenu [model]="model" class="w-full md:w-20rem menu-reduced-margin" />`,
    styles: [
        `
            :host {
                display: block;
                margin-left: 0rem;
                margin-right: 0rem;
            }

            .layout-menuitem-icon {
                margin-right: 0.5rem;
            }

            .layout-submenu-toggler {
                margin-left: auto;
                transition: transform 0.3s;
            }

            .active-route .layout-submenu-toggler {
                transform: rotate(-180deg);
            }

            ul[app-menuitem] {
                overflow: hidden;
            }

            /* Arrow on the right side for parent menu headers (PrimeNG PanelMenu) */
            :host ::ng-deep .p-panelmenu-header-content {
                display: flex;
                align-items: center;
                width: 100%;
            }
            :host ::ng-deep .p-panelmenu-header-link {
                display: flex;
                align-items: center;
                flex: 1;
            }
            :host ::ng-deep .p-panelmenu-submenu-icon {
                margin-left: auto;
                order: 1;
            }

            /* Highlight selected/active menu item */
            :host ::ng-deep .p-panelmenu-item-link-active,
            :host ::ng-deep a.p-panelmenu-item-link-active {
                font-weight: 700 !important;
                color: var(--primary-color) !important;
                background-color: var(--surface-hover) !important;
            }
            :host ::ng-deep .p-panelmenu-header.p-panelmenu-header-active .p-panelmenu-header-link {
                font-weight: 600;
                color: var(--primary-color);
                background-color: var(--surface-hover);
            }
        `
    ]
})
export class AppMenu {
    model: MenuItem[] = [];

    ngOnInit() {
        this.model = [
            {
                label: 'Home',
                icon: 'pi pi-fw pi-th-large',
                items: [
                    { label: 'Dashboard', icon: 'pi pi-fw pi-home', routerLink: ['/dashboard'], routerLinkActiveOptions: { paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' } },
                    { label: 'Task & Event List', icon: 'pi pi-fw pi-list', routerLink: ['/task-event-list'] },
                    { label: 'Pending Task & Upcoming Event', icon: 'pi pi-fw pi-calendar', routerLink: ['/calendar'] },
                    { label: 'Chat', icon: 'pi pi-fw pi-comments', routerLink: ['/chat'] }
                ]
            },
            {
                label: 'User Manage',
                icon: 'pi pi-fw pi-users',
                items: [
                    { label: 'Create User', icon: 'pi pi-fw pi-user-plus', routerLink: ['/identity/user-create'] },
                    { label: 'Roles', icon: 'pi pi-fw pi-list', routerLink: ['/identity/roles'] },
                    { label: 'User–Employee Mapping', icon: 'pi pi-fw pi-id-card', routerLink: ['/identity/user-employee-mapping'] }
                ]
            },
            {
                label: 'Data Entry (New & Re-Joining)',
                icon: 'pi pi-fw pi-user-plus',
                items: [
                    { label: ' New Joining & Re-Joining', icon: 'pi pi-fw pi-user-plus', routerLink: ['/emp-basic-info'] },
                    { label: 'Allocation of RAB ID ', icon: 'pi pi-fw pi-id-card', routerLink: ['/rab-id-allocation'] },
                    { label: 'Supernumerary List', icon: 'pi pi-fw pi-list', routerLink: ['/supernumerary-list'] }
                ]
            },
            {
                label: 'Emp',
                icon: 'pi pi-fw pi-users',
                items: [
                    // { label: 'Employee List', icon: 'pi pi-fw pi-list', routerLink: ['/emp-list'] },
                    // { label: 'EmployeeInfo', routerLink: ['/employee-info'] },

                    // { label: 'Personal Info', icon: 'pi pi-fw pi-id-card', routerLink: ['/personal-info'] },
                    { label: 'Personal Info', icon: 'pi pi-fw pi-user', routerLink: ['/emp-personal-info'] },
                    { label: 'Address Info', icon: 'pi pi-fw pi-map-marker', routerLink: ['/emp-address-info'] },
                    { label: 'Family Info', icon: 'pi pi-fw pi-users', routerLink: ['/emp-family-info'] },
                    { label: 'Nominee Info', icon: 'pi pi-fw pi-user-plus', routerLink: ['/emp-nominee-info'] },
                    { label: 'Previous RAB Service', icon: 'pi pi-fw pi-history', routerLink: ['/emp-previous-rab-service'] },
                    { label: 'Service History (Mother Org)', icon: 'pi pi-fw pi-clock', routerLink: ['/emp-service-history'] },
                    { label: 'Promotion Info', icon: 'pi pi-fw pi-arrow-up', routerLink: ['/emp-promotion-info'] },
                    { label: 'Rank Confirmation', icon: 'pi pi-fw pi-check-circle', routerLink: ['/emp-rank-confirmation'] },
                    { label: 'Education Info', icon: 'pi pi-fw pi-book', routerLink: ['/emp-education-info'] },
                    { label: 'Course Info', icon: 'pi pi-fw pi-graduation-cap', routerLink: ['/emp-course-info'] },
                    { label: 'Discipline Info', icon: 'pi pi-fw pi-exclamation-triangle', routerLink: ['/emp-discipline-info'] },
                    { label: 'Bank Account', icon: 'pi pi-fw pi-wallet', routerLink: ['/emp-bank-account'] },
                    { label: 'Foreign Visit', icon: 'pi pi-fw pi-globe', routerLink: ['/emp-foreign-visit'] },
                    { label: 'Leave Info', icon: 'pi pi-fw pi-calendar-minus', routerLink: ['/emp-leave-info'] },
                    { label: 'Medical Category', icon: 'pi pi-fw pi-heart', routerLink: ['/emp-medical-category'] },
                    { label: 'Additional Remarks', icon: 'pi pi-fw pi-comment', routerLink: ['/emp-additional-remarks'] }
                ]
            },
            {
                label: 'Organization Setup',
                icon: 'pi pi-fw pi-user-plus',
                items: [{ label: 'Presently Serving Members', icon: 'pi pi-fw pi-users', routerLink: ['/presently-serving-members'] }]
            },
            {
                label: 'Basic Setup',
                icon: 'pi pi-fw pi-cog',
                items: [
                    { label: 'Mother Organization', icon: 'pi pi-fw pi-map', routerLink: ['/basic-setup/mother-org'] },
                    { label: 'Organization Unit', icon: 'pi pi-fw pi-map', routerLink: ['/basic-setup/organization-unit'] },
                    { label: 'Mother Org Rank', icon: 'pi pi-fw pi-map', routerLink: ['/basic-setup/mother-org-rank'] },
                    { label: 'Equivalent Name', icon: 'pi pi-fw pi-clone', routerLink: ['/basic-setup/equivalent-name'] },
                    { label: 'Corps', icon: 'pi pi-fw pi-sign-out', routerLink: ['/basic-setup/corps'] },
                    { label: 'Trade', icon: 'pi pi-fw pi-sign-out', routerLink: ['/basic-setup/trade'] },
                    { label: 'Batch', icon: 'pi pi-fw pi-sign-out', routerLink: ['basic-setup/batch'] },
                    { label: 'Employee Status Type', icon: 'pi pi-fw pi-info-circle', routerLink: ['/basic-setup/employee-status-type'] },
                    { label: 'Employee Type', icon: 'pi pi-fw pi-user-edit', routerLink: ['/basic-setup/employee-type'] },
                    { label: 'Officer Type', icon: 'pi pi-fw pi-user-edit', routerLink: ['basic-setup/officer-type'] },
                    { label: 'Appointment Category', icon: 'pi pi-fw pi-sitemap', routerLink: ['/basic-setup/appointment-category'] },
                    { label: 'RAB ID', icon: 'pi pi-fw pi-id-card', routerLink: ['/basic-setup/rab-id-serial'] },
                    { label: 'RAB Unit', icon: 'pi pi-fw pi-building', routerLink: ['/basic-setup/rab-unit'] },
                    { label: 'RAB Wing', icon: 'pi pi-fw pi-building', routerLink: ['basic-setup/rab-wing'] },
                    { label: 'RAB Branch', icon: 'pi pi-fw pi-clone', routerLink: ['/basic-setup/rab-branch'] },
                    { label: 'Country', icon: 'pi pi-fw pi-globe', routerLink: ['/basic-setup/country'] },
                    { label: 'Division', icon: 'pi pi-fw pi-map', routerLink: ['/basic-setup/division'] },
                    { label: 'District', icon: 'pi pi-fw pi-map-marker', routerLink: ['/basic-setup/district'] },
                    { label: 'Upazila', icon: 'pi pi-fw pi-compass', routerLink: ['/basic-setup/upazila'] },
                    { label: 'Post Office', icon: 'pi pi-fw pi-compass', routerLink: ['basic-setup/post-office'] },
                    { label: 'Blood Group', icon: 'pi pi-fw pi-heart', routerLink: ['/basic-setup/blood-group'] },
                    { label: 'Relationship', icon: 'pi pi-fw pi-users', routerLink: ['/basic-setup/relationship'] },
                    { label: 'Marital Status', icon: 'pi pi-fw pi-user', routerLink: ['/basic-setup/marital-status'] },
                    { label: 'Gender', icon: 'pi pi-fw pi-venus-mars', routerLink: ['/basic-setup/gender'] },
                    { label: 'Prefix', icon: 'pi pi-fw pi-user', routerLink: ['/basic-setup/prefix'] },
                    { label: 'Religion', icon: 'pi pi-fw pi-moon', routerLink: ['/basic-setup/religion'] },
                    { label: 'Occupation', icon: 'pi pi-fw pi-briefcase', routerLink: ['/basic-setup/occupation'] },

                    { label: 'Education Qualification', icon: 'pi pi-fw pi-book', routerLink: ['/basic-setup/education-qualification'] },
                    { label: 'Education Institution Type', icon: 'pi pi-fw pi-building', routerLink: ['/basic-setup/education-institution-type'] },
                    { label: 'Education Institution', icon: 'pi pi-fw pi-building', routerLink: ['/basic-setup/education-institution'] },
                    { label: 'Educational  Department', icon: 'pi pi-fw pi-building', routerLink: ['/basic-setup/educational-department'] },
                    { label: 'Educational  Subject', icon: 'pi pi-fw pi-building', routerLink: ['/basic-setup/education-subject'] },
                    { label: 'Education Result', icon: 'pi pi-fw pi-check-square', routerLink: ['/basic-setup/education-result'] },

                    { label: 'Course Type', icon: 'pi pi-fw pi-list', routerLink: ['/basic-setup/course-type'] },
                    { label: 'Course Name', icon: 'pi pi-fw pi-list', routerLink: ['/basic-setup/course-name'] },
                    { label: 'Course Grade', icon: 'pi pi-fw pi-star', routerLink: ['/basic-setup/course-grade'] },
                    { label: 'Gallantry Awards/ Decoration', icon: 'pi pi-fw pi-star', routerLink: ['basic-setup/decoration'] },
                    { label: 'Professional Qualification', icon: 'pi pi-fw pi-star', routerLink: ['basic-setup/professional-qualification'] },
                    { label: 'Personal Qualification', icon: 'pi pi-fw pi-id-card', routerLink: ['/basic-setup/personal-qualification'] },

                    { label: 'Visit Type', icon: 'pi pi-fw pi-calendar', routerLink: ['/basic-setup/visit-type'] },
                    { label: 'Punishment Type', icon: 'pi pi-fw pi-ban', routerLink: ['/basic-setup/punishment-type'] },
                    { label: 'Offence Type', icon: 'pi pi-fw pi-exclamation-triangle', routerLink: ['/basic-setup/offence-type'] },
                    { label: 'Brief Statement of Offence', icon: 'pi pi-fw pi-file-edit', routerLink: ['/basic-setup/brief-statement-of-offence'] },
                    { label: 'Leave Type', icon: 'pi pi-fw pi-sign-out', routerLink: ['/basic-setup/leave-type'] },

                    { label: 'Medical Category Type', icon: 'pi pi-fw pi-heart', routerLink: ['/basic-setup/medical-category-type'] },
                    { label: 'Visit Subject Type', icon: 'pi pi-fw pi-list', routerLink: ['/basic-setup/subject-type'] },

                    { label: 'Bank', icon: 'pi pi-fw pi-wallet', routerLink: ['/basic-setup/bank'] },
                    { label: 'Bank Branch', icon: 'pi pi-fw pi-building', routerLink: ['/basic-setup/bank-branch'] }

                    // Newly added
                ]
            }

            // {
            //     label: 'UI Components',
            //     items: [
            //         { label: 'EmployeeInfo', routerLink: ['/employee-info'] },
            //         { label: 'Mother Org', icon: 'pi pi-fw pi-check-square', routerLink: ['/basic-setup/mother-org'] },

            //         { label: 'Personal Info', icon: 'pi pi-pw pi-id-card', routerLink: ['/personal-info'] },
            //         { label: 'EmployeeInfo', icon: 'pi pi-pw pi-briefcase', routerLink: ['/employee-info'] },
            //         { label: 'Mother Org', icon: 'pi pi-fw pi-check-square', routerLink: ['/basic-setup/mother-org'] },
            //         { label: 'Form Layout', icon: 'pi pi-fw pi-id-card', routerLink: ['/uikit/formlayout'] },
            //         { label: 'Input', icon: 'pi pi-fw pi-check-square', routerLink: ['/uikit/input'] },
            //         { label: 'Button', icon: 'pi pi-fw pi-mobile', class: 'rotated-icon', routerLink: ['/uikit/button'] },
            //         { label: 'Table', icon: 'pi pi-fw pi-table', routerLink: ['/uikit/table'] },
            //         { label: 'List', icon: 'pi pi-fw pi-list', routerLink: ['/uikit/list'] },
            //         { label: 'Tree', icon: 'pi pi-fw pi-share-alt', routerLink: ['/uikit/tree'] },
            //         { label: 'Panel', icon: 'pi pi-fw pi-tablet', routerLink: ['/uikit/panel'] },
            //         { label: 'Overlay', icon: 'pi pi-fw pi-clone', routerLink: ['/uikit/overlay'] },
            //         { label: 'Media', icon: 'pi pi-fw pi-image', routerLink: ['/uikit/media'] },
            //         { label: 'Menu', icon: 'pi pi-fw pi-bars', routerLink: ['/uikit/menu'] },
            //         { label: 'Message', icon: 'pi pi-fw pi-comment', routerLink: ['/uikit/message'] },
            //         { label: 'File', icon: 'pi pi-fw pi-file', routerLink: ['/uikit/file'] },
            //         { label: 'Chart', icon: 'pi pi-fw pi-chart-bar', routerLink: ['/uikit/charts'] },
            //         { label: 'Timeline', icon: 'pi pi-fw pi-calendar', routerLink: ['/uikit/timeline'] },
            //         { label: 'Misc', icon: 'pi pi-fw pi-circle', routerLink: ['/uikit/misc'] }
            //     ]
            // },
            // {
            //     label: 'Pages',
            //     icon: 'pi pi-fw pi-briefcase',
            //     routerLink: ['/pages'],
            //     items: [
            //         {
            //             label: 'Landing',
            //             icon: 'pi pi-fw pi-globe',
            //             routerLink: ['/landing']
            //         },
            //         {
            //             label: 'Auth',
            //             icon: 'pi pi-fw pi-user',
            //             items: [
            //                 {
            //                     label: 'Login',
            //                     icon: 'pi pi-fw pi-sign-in',
            //                     routerLink: ['/auth/login']
            //                 },
            //                 {
            //                     label: 'Error',
            //                     icon: 'pi pi-fw pi-times-circle',
            //                     routerLink: ['/auth/error']
            //                 },
            //                 {
            //                     label: 'Access Denied',
            //                     icon: 'pi pi-fw pi-lock',
            //                     routerLink: ['/auth/access']
            //                 }
            //             ]
            //         },
            //         {
            //             label: 'Crud',
            //             icon: 'pi pi-fw pi-pencil',
            //             routerLink: ['/pages/crud']
            //         },
            //         {
            //             label: 'Not Found',
            //             icon: 'pi pi-fw pi-exclamation-circle',
            //             routerLink: ['/pages/notfound']
            //         },
            //         {
            //             label: 'Empty',
            //             icon: 'pi pi-fw pi-circle-off',
            //             routerLink: ['/pages/empty']
            //         }
            //     ]
            // },
            // {
            //     label: 'Hierarchy',
            //     items: [
            //         {
            //             label: 'Submenu 1',
            //             icon: 'pi pi-fw pi-bookmark',
            //             items: [
            //                 {
            //                     label: 'Submenu 1.1',
            //                     icon: 'pi pi-fw pi-bookmark',
            //                     items: [
            //                         { label: 'Submenu 1.1.1', icon: 'pi pi-fw pi-bookmark' },
            //                         { label: 'Submenu 1.1.2', icon: 'pi pi-fw pi-bookmark' },
            //                         { label: 'Submenu 1.1.3', icon: 'pi pi-fw pi-bookmark' }
            //                     ]
            //                 },
            //                 {
            //                     label: 'Submenu 1.2',
            //                     icon: 'pi pi-fw pi-bookmark',
            //                     items: [{ label: 'Submenu 1.2.1', icon: 'pi pi-fw pi-bookmark' }]
            //                 }
            //             ]
            //         },
            //         {
            //             label: 'Submenu 2',
            //             icon: 'pi pi-fw pi-bookmark',
            //             items: [
            //                 {
            //                     label: 'Submenu 2.1',
            //                     icon: 'pi pi-fw pi-bookmark',
            //                     items: [
            //                         { label: 'Submenu 2.1.1', icon: 'pi pi-fw pi-bookmark' },
            //                         { label: 'Submenu 2.1.2', icon: 'pi pi-fw pi-bookmark' }
            //                     ]
            //                 },
            //                 {
            //                     label: 'Submenu 2.2',
            //                     icon: 'pi pi-fw pi-bookmark',
            //                     items: [{ label: 'Submenu 2.2.1', icon: 'pi pi-fw pi-bookmark' }]
            //                 }
            //             ]
            //         }
            //     ]
            // },
            // {
            //     label: 'Get Started',
            //     items: [
            //         {
            //             label: 'Documentation',
            //             icon: 'pi pi-fw pi-book',
            //             routerLink: ['/documentation']
            //         },
            //         {
            //             label: 'View Source',
            //             icon: 'pi pi-fw pi-github',
            //             url: 'https://github.com/primefaces/sakai-ng',
            //             target: '_blank'
            //         }
            //     ]
            // }
        ];
    }
}
