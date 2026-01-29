import { Component } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StyleClassModule } from 'primeng/styleclass';
import { AppConfigurator } from './app.configurator';
import { LayoutService } from '../service/layout.service';
import { Logout } from '@/Components/Features/Authentication/logout/logout';
import { ToggleButtonModule } from 'primeng/togglebutton';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [RouterModule, CommonModule, FormsModule, StyleClassModule, AppConfigurator, Logout, ToggleButtonModule],
    template: ` <div class="layout-topbar">
        <div class="layout-topbar-logo-container">
            <button class="layout-menu-button layout-topbar-action" (click)="layoutService.onMenuToggle()">
                <i class="pi pi-bars"></i>
            </button>
            <a class="layout-topbar-logo" routerLink="/">
                <img class="layout-topbar-logo" style="width: 40px;" src="https://upload.wikimedia.org/wikipedia/en/thumb/d/d0/Rapid_Action_Battalion_%28RAB%29_Emblem.svg/250px-Rapid_Action_Battalion_%28RAB%29_Emblem.svg.png" alt="logo" />
                <span>ROFIMS</span>
            </a>
        </div>

        <div class="layout-topbar-actions">
            <div class="layout-config-menu">
                <button type="button" class="layout-topbar-action" (click)="toggleDarkMode()">
                    <i [ngClass]="{ 'pi ': true, 'pi-moon': layoutService.isDarkTheme(), 'pi-sun': !layoutService.isDarkTheme() }"></i>
                </button>
                <div class="relative">
                    <button
                        class="layout-topbar-action layout-topbar-action-highlight"
                        pStyleClass="@next"
                        enterFromClass="hidden"
                        enterActiveClass="animate-scalein"
                        leaveToClass="hidden"
                        leaveActiveClass="animate-fadeout"
                        [hideOnOutsideClick]="true"
                    >
                        <i class="pi pi-palette"></i>
                    </button>
                    <app-configurator />
                </div>
            </div>

            <button class="layout-topbar-menu-button layout-topbar-action" pStyleClass="@next" enterFromClass="hidden" enterActiveClass="animate-scalein" leaveToClass="hidden" leaveActiveClass="animate-fadeout" [hideOnOutsideClick]="true">
                <i class="pi pi-ellipsis-v"></i>
            </button>

            <div class="layout-topbar-menu hidden lg:block">
                <div class="layout-topbar-menu-content">
                    <p-toggleButton [(ngModel)]="isEnglish" onLabel="EN" offLabel="BN" size="small" class="min-w-16" (onChange)="toggleLanguage()"> </p-toggleButton>

                    <button type="button" class="layout-topbar-action">
                        <i class="pi pi-inbox"></i>
                        <span>Messages</span>
                    </button>

                    <button type="button" class="layout-topbar-action">
                        <i class="pi pi-user"></i>
                        <span>Profile</span>
                    </button>
                    <app-logout></app-logout>
                </div>
            </div>
        </div>
    </div>`
})
export class AppTopbar {
    items!: MenuItem[];
    isEnglish: boolean = true;
    private readonly DARK_MODE_KEY = 'darkMode';

    constructor(public layoutService: LayoutService) {
        this.loadDarkModePreference();
    }

    toggleDarkMode() {
        this.layoutService.layoutConfig.update((state) => {
            const newDarkTheme = !state.darkTheme;
            // Save to localStorage
            localStorage.setItem(this.DARK_MODE_KEY, JSON.stringify(newDarkTheme));
            return { ...state, darkTheme: newDarkTheme };
        });
    }

    toggleLanguage() {
        const language = this.isEnglish ? 'EN' : 'BN';
        localStorage.setItem('language', language);
    }

    private loadDarkModePreference() {
        const savedDarkMode = localStorage.getItem(this.DARK_MODE_KEY);
        if (savedDarkMode !== null) {
            const isDark = JSON.parse(savedDarkMode);
            this.layoutService.layoutConfig.update((state) => ({ ...state, darkTheme: isDark }));
        }
    }
}
