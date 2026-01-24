import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from './app.menuitem';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [CommonModule, AppMenuitem, RouterModule],
    template: `<ul class="layout-menu">
        <ng-container *ngFor="let item of model; let i = index">
            <li app-menuitem *ngIf="!item.separator" [item]="item" [index]="i" [root]="true"></li>
            <li *ngIf="item.separator" class="menu-separator"></li>
        </ng-container>
    </ul> `
})
export class AppMenu {
    model: MenuItem[] = [];

    ngOnInit() {
        this.model = [
            {
                label: 'Home',
                items: [{ label: 'Dashboard', icon: 'pi pi-fw pi-home', routerLink: ['/'] }]
            },
            {
                label: 'Basic Setup',
                icon: 'pi pi-fw pi-cog',
                items: [
                    {
                        label: 'Division',
                        icon: 'pi pi-fw pi-map',
                        routerLink: ['/basic-setup/division']
                    },
                    {
                        label: 'District',
                        icon: 'pi pi-fw pi-map-marker',
                        routerLink: ['/basic-setup/district']
                    },
                    {
                        label: 'Upazila',
                        icon: 'pi pi-fw pi-compass',
                        routerLink: ['/basic-setup/upazila']
                    },
                    {
                        label: 'Blood Group',
                        icon: 'pi pi-fw pi-heart',
                        routerLink: ['/basic-setup/blood-group']
                    },
                    {
                        label: 'Relationship',
                        icon: 'pi pi-fw pi-users',
                        routerLink: ['/basic-setup/relationship']
                    },
                    {
                        label: 'Marital Status',
                        icon: 'pi pi-fw pi-user',
                        routerLink: ['/basic-setup/marital-status']
                    },
                    {
                        label: 'Occupation',
                        icon: 'pi pi-fw pi-briefcase',
                        routerLink: ['/basic-setup/occupation']
                    },
                    {
                        label: 'Education Qualification',
                        icon: 'pi pi-fw pi-book',
                        routerLink: ['/basic-setup/education-qualification']
                    },
                    {
                        label: 'Education Institution Type',
                        icon: 'pi pi-fw pi-building',
                        routerLink: ['/basic-setup/education-institution-type']
                    },
                    {
                        label: 'Education Institution',
                        icon: 'pi pi-fw pi-building',
                        routerLink: ['/basic-setup/education-institution']
                    },
                    {
                        label: 'Education Result',
                        icon: 'pi pi-fw pi-check-square',
                        routerLink: ['/basic-setup/education-result']
                    },
                    {
                        label: 'Course Type',
                        icon: 'pi pi-fw pi-list',
                        routerLink: ['/basic-setup/course-type']
                    },
                    {
                        label: 'Course Grade',
                        icon: 'pi pi-fw pi-star',
                        routerLink: ['/basic-setup/course-grade']
                    },
                    {
                        label: 'Personal Qualification',
                        icon: 'pi pi-fw pi-id-card',
                        routerLink: ['/basic-setup/personal-qualification']
                    },
                    {
                        label: 'Visit Type',
                        icon: 'pi pi-fw pi-calendar',
                        routerLink: ['/basic-setup/visit-type']
                    },
                    {
                        label: 'Punishment Type',
                        icon: 'pi pi-fw pi-ban',
                        routerLink: ['/basic-setup/punishment-type']
                    },
                    {
                        label: 'Leave Type',
                        icon: 'pi pi-fw pi-sign-out',
                        routerLink: ['/basic-setup/leave-type']
                    }
                ]
            },
            {
                label: 'UI Components',
                items: [
                    { label: 'EmployeeInfo', routerLink: ['/employee-info'] },
                    { label: 'Mother Org', icon: 'pi pi-fw pi-check-square', routerLink: ['/basic-setup/mother-org'] },
                    { label: 'Form Layout', icon: 'pi pi-fw pi-id-card', routerLink: ['/uikit/formlayout'] },
                    { label: 'Input', icon: 'pi pi-fw pi-check-square', routerLink: ['/uikit/input'] },
                    { label: 'Button', icon: 'pi pi-fw pi-mobile', class: 'rotated-icon', routerLink: ['/uikit/button'] },
                    { label: 'Table', icon: 'pi pi-fw pi-table', routerLink: ['/uikit/table'] },
                    { label: 'List', icon: 'pi pi-fw pi-list', routerLink: ['/uikit/list'] },
                    { label: 'Tree', icon: 'pi pi-fw pi-share-alt', routerLink: ['/uikit/tree'] },
                    { label: 'Panel', icon: 'pi pi-fw pi-tablet', routerLink: ['/uikit/panel'] },
                    { label: 'Overlay', icon: 'pi pi-fw pi-clone', routerLink: ['/uikit/overlay'] },
                    { label: 'Media', icon: 'pi pi-fw pi-image', routerLink: ['/uikit/media'] },
                    { label: 'Menu', icon: 'pi pi-fw pi-bars', routerLink: ['/uikit/menu'] },
                    { label: 'Message', icon: 'pi pi-fw pi-comment', routerLink: ['/uikit/message'] },
                    { label: 'File', icon: 'pi pi-fw pi-file', routerLink: ['/uikit/file'] },
                    { label: 'Chart', icon: 'pi pi-fw pi-chart-bar', routerLink: ['/uikit/charts'] },
                    { label: 'Timeline', icon: 'pi pi-fw pi-calendar', routerLink: ['/uikit/timeline'] },
                    { label: 'Misc', icon: 'pi pi-fw pi-circle', routerLink: ['/uikit/misc'] }
                ]
            },
            {
                label: 'Pages',
                icon: 'pi pi-fw pi-briefcase',
                routerLink: ['/pages'],
                items: [
                    {
                        label: 'Landing',
                        icon: 'pi pi-fw pi-globe',
                        routerLink: ['/landing']
                    },
                    {
                        label: 'Auth',
                        icon: 'pi pi-fw pi-user',
                        items: [
                            {
                                label: 'Login',
                                icon: 'pi pi-fw pi-sign-in',
                                routerLink: ['/auth/login']
                            },
                            {
                                label: 'Error',
                                icon: 'pi pi-fw pi-times-circle',
                                routerLink: ['/auth/error']
                            },
                            {
                                label: 'Access Denied',
                                icon: 'pi pi-fw pi-lock',
                                routerLink: ['/auth/access']
                            }
                        ]
                    },
                    {
                        label: 'Crud',
                        icon: 'pi pi-fw pi-pencil',
                        routerLink: ['/pages/crud']
                    },
                    {
                        label: 'Not Found',
                        icon: 'pi pi-fw pi-exclamation-circle',
                        routerLink: ['/pages/notfound']
                    },
                    {
                        label: 'Empty',
                        icon: 'pi pi-fw pi-circle-off',
                        routerLink: ['/pages/empty']
                    }
                ]
            },
            {
                label: 'Hierarchy',
                items: [
                    {
                        label: 'Submenu 1',
                        icon: 'pi pi-fw pi-bookmark',
                        items: [
                            {
                                label: 'Submenu 1.1',
                                icon: 'pi pi-fw pi-bookmark',
                                items: [
                                    { label: 'Submenu 1.1.1', icon: 'pi pi-fw pi-bookmark' },
                                    { label: 'Submenu 1.1.2', icon: 'pi pi-fw pi-bookmark' },
                                    { label: 'Submenu 1.1.3', icon: 'pi pi-fw pi-bookmark' }
                                ]
                            },
                            {
                                label: 'Submenu 1.2',
                                icon: 'pi pi-fw pi-bookmark',
                                items: [{ label: 'Submenu 1.2.1', icon: 'pi pi-fw pi-bookmark' }]
                            }
                        ]
                    },
                    {
                        label: 'Submenu 2',
                        icon: 'pi pi-fw pi-bookmark',
                        items: [
                            {
                                label: 'Submenu 2.1',
                                icon: 'pi pi-fw pi-bookmark',
                                items: [
                                    { label: 'Submenu 2.1.1', icon: 'pi pi-fw pi-bookmark' },
                                    { label: 'Submenu 2.1.2', icon: 'pi pi-fw pi-bookmark' }
                                ]
                            },
                            {
                                label: 'Submenu 2.2',
                                icon: 'pi pi-fw pi-bookmark',
                                items: [{ label: 'Submenu 2.2.1', icon: 'pi pi-fw pi-bookmark' }]
                            }
                        ]
                    }
                ]
            },
            {
                label: 'Get Started',
                items: [
                    {
                        label: 'Documentation',
                        icon: 'pi pi-fw pi-book',
                        routerLink: ['/documentation']
                    },
                    {
                        label: 'View Source',
                        icon: 'pi pi-fw pi-github',
                        url: 'https://github.com/primefaces/sakai-ng',
                        target: '_blank'
                    }
                ]
            }
        ];
    }
}
