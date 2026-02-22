import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { map, tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
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
                    <!-- <p-toggleButton [(ngModel)]="isEnglish" onLabel="EN" offLabel="BN" size="small" class="min-w-16" (onChange)="toggleLanguage()"> </p-toggleButton> -->

                    <div class="relative" #notificationContainer>
                        @let count = unreadCount$ | async;
                        <button type="button" class="layout-topbar-action relative overflow-visible" (click)="toggleNotificationPanel()">
                            <i class="pi pi-bell"></i>
                            @if ((count ?? 0) > 0) {
                                <span class="notification-badge absolute -top-1 -right-1 min-w-[20px] h-[20px] rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center px-1 shadow">{{
                                    (count ?? 0) > 99 ? '99+' : count
                                }}</span>
                            }
                        </button>
                        @if (showNotificationPanel) {
                            <div class="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-auto bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg shadow-lg z-[9999]">
                                <div class="p-3 border-b border-surface-200 dark:border-surface-600 flex justify-between items-center">
                                    <span class="font-semibold">Notifications</span>
                                    @if ((count ?? 0) > 0) {
                                        <button type="button" class="text-sm text-primary" (click)="markAllRead($event)">Mark all read</button>
                                    }
                                </div>
                                @if (notificationService.notifications.length === 0) {
                                    <div class="p-4 text-surface-500 text-center text-sm">No notifications</div>
                                } @else {
                                    <div class="divide-y divide-surface-200 dark:divide-surface-600">
                                        @for (n of notificationService.notifications; track n.id) {
                                            <div (click)="onNotificationClick(n, $event)" class="block p-3 hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer" [class.bg-primary-50]="!n.read" [class.dark:bg-primary-900/20]="!n.read">
                                                <div class="font-medium text-sm">{{ n.title }}</div>
                                                <div class="text-surface-600 dark:text-surface-400 text-xs mt-0.5">{{ n.message }}</div>
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>

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
    unreadCount$!: Observable<number>;
    private readonly DARK_MODE_KEY = 'darkMode';
    private closeBound: ((e: MouseEvent) => void) | null = null;
    @ViewChild('notificationContainer') notificationContainer?: ElementRef<HTMLElement>;

    constructor(
        public layoutService: LayoutService,
        public notificationService: NotificationService,
        private chatService: ChatService,
        private router: Router
    ) {
        this.loadDarkModePreference();
        // #region agent log
        const _log = (m: string, d: Record<string, unknown>) =>
            fetch('http://127.0.0.1:7682/ingest/24c52934-7935-4f35-a09e-2dbd51502872', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3a6509' },
                body: JSON.stringify({ sessionId: '3a6509', location: 'app.topbar', message: m, data: d, timestamp: Date.now(), hypothesisId: d['h'] as string })
            }).catch(() => {});
        // #endregion
        this.unreadCount$ = this.notificationService.notifications$.pipe(
            map(() => this.notificationService.getUnreadCount()),
            tap((c) => _log('unreadCount$ emitted', { h: 'H3', count: c }))
        );
    }

    ngOnInit(): void {
        this.chatService.connectToHub().catch(() => {});
    }

    ngOnDestroy(): void {}

    toggleNotificationPanel(): void {
        this.showNotificationPanel = !this.showNotificationPanel;
        if (this.showNotificationPanel) {
            this.closeBound = (e: MouseEvent) => this.handleOutsideClick(e);
            setTimeout(() => document.addEventListener('click', this.closeBound!));
        } else {
            this.removeCloseListener();
        }
    }

    private handleOutsideClick(e: MouseEvent): void {
        const el = this.notificationContainer?.nativeElement;
        if (el && !el.contains(e.target as Node)) {
            this.showNotificationPanel = false;
            this.removeCloseListener();
        }
    }

    private removeCloseListener(): void {
        if (this.closeBound) {
            document.removeEventListener('click', this.closeBound);
            this.closeBound = null;
        }
    }

    onNotificationClick(n: { id: string; link?: string }, e: Event): void {
        e.stopPropagation();
        this.notificationService.markAsRead(n.id);
        this.showNotificationPanel = false;
        this.removeCloseListener();
        if (n.link) {
            this.router.navigateByUrl(n.link);
        }
    }

    markAllRead(e: Event): void {
        e.stopPropagation();
        this.notificationService.markAllAsRead();
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
