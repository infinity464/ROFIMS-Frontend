import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StyleClassModule } from 'primeng/styleclass';
import { AppConfigurator } from './app.configurator';
import { LayoutService } from '../service/layout.service';
import { Logout } from '@/Components/Features/Authentication/logout/logout';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ChatService } from '@/services/chat.service';
import { NotificationService } from '@/services/notification.service';

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
            <div class="relative" #notificationContainer>
                <button
                    type="button"
                    class="layout-topbar-action relative"
                    (click)="toggleNotificationPanel()">
                    <i class="pi pi-bell"></i>
                    @if (unreadCount > 0) {
                        <span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-xs flex items-center justify-center px-1">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
                    }
                </button>
                @if (showNotificationPanel) {
                <div
                    data-notification-panel
                    class="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-auto bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg shadow-lg z-[9999]">
                    <div class="p-3 border-b border-surface-200 dark:border-surface-600 flex justify-between items-center">
                        <span class="font-semibold">Notifications</span>
                        @if (unreadCount > 0) {
                            <button type="button" class="text-sm text-primary" (click)="markAllRead()">Mark all read</button>
                        }
                    </div>
                    @if (notificationService.notifications.length === 0) {
                        <div class="p-4 text-surface-500 text-center text-sm">No notifications</div>
                    } @else {
                        <div class="divide-y divide-surface-200 dark:divide-surface-600">
                            @for (n of notificationService.notifications; track n.id) {
                                <div
                                    (click)="onNotificationClick(n)"
                                    class="block p-3 hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer"
                                    [class.bg-primary-50]="!n.read"
                                    [class.dark:bg-primary-900/20]="!n.read">
                                    <div class="font-medium text-sm">{{ n.title }}</div>
                                    <div class="text-surface-600 dark:text-surface-400 text-xs mt-0.5">{{ n.message }}</div>
                                </div>
                            }
                        </div>
                    }
                </div>
                }
            </div>
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
export class AppTopbar implements OnInit, OnDestroy {
    items!: MenuItem[];
    isEnglish: boolean = true;
    showNotificationPanel = false;
    unreadCount = 0;
    private readonly DARK_MODE_KEY = 'darkMode';
    private sub: any;
    @ViewChild('notificationContainer') notificationContainer?: ElementRef<HTMLElement>;

    constructor(
        public layoutService: LayoutService,
        public notificationService: NotificationService,
        private chatService: ChatService,
        private router: Router
    ) {
        this.loadDarkModePreference();
    }

    ngOnInit(): void {
        this.chatService.connectToHub().catch(() => {});
        this.sub = this.notificationService.notifications$.subscribe(() => {
            this.unreadCount = this.notificationService.getUnreadCount();
        });
        this.unreadCount = this.notificationService.getUnreadCount();
    }

    ngOnDestroy(): void {
        this.sub?.unsubscribe();
    }

    toggleNotificationPanel(): void {
        this.showNotificationPanel = !this.showNotificationPanel;
        if (this.showNotificationPanel) {
            this.closeNotificationPanelBound = (e: MouseEvent) => this.handleDocumentClick(e);
            setTimeout(() => document.addEventListener('click', this.closeNotificationPanelBound!));
        } else {
            this.removeCloseListener();
        }
    }

    private closeNotificationPanelBound: ((e: MouseEvent) => void) | null = null;

    private handleDocumentClick(e: MouseEvent): void {
        const el = this.notificationContainer?.nativeElement;
        if (el && !el.contains(e.target as Node)) {
            this.showNotificationPanel = false;
            this.removeCloseListener();
        }
    }

    private removeCloseListener(): void {
        if (this.closeNotificationPanelBound) {
            document.removeEventListener('click', this.closeNotificationPanelBound);
            this.closeNotificationPanelBound = null;
        }
    }

    onNotificationClick(n: { id: string; link?: string }): void {
        this.notificationService.markAsRead(n.id);
        this.unreadCount = this.notificationService.getUnreadCount();
        this.showNotificationPanel = false;
        this.removeCloseListener();
        if (n.link) this.router.navigateByUrl(n.link);
    }

    markAllRead(): void {
        this.notificationService.markAllAsRead();
        this.unreadCount = 0;
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
