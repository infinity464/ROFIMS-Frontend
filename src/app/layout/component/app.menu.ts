import { Component, inject } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { PanelMenuModule } from 'primeng/panelmenu';
import { RouterModule } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';

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
    private userMenuService = inject(UserMenuService);
    model: MenuItem[] = [];

    ngOnInit() {
        const storedMenus = this.userMenuService.getStoredMenus();
        this.model = storedMenus.length > 0
            ? this.userMenuService.buildPrimeNGMenu(storedMenus)
            : [];
    }
}
