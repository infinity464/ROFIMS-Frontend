import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { map, switchMap, catchError } from 'rxjs/operators';
import { Observable, of, EMPTY } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { StyleClassModule } from 'primeng/styleclass';
import { PopoverModule } from 'primeng/popover';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { AppConfigurator } from './app.configurator';
import { LayoutService } from '../service/layout.service';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ChatService } from '@/services/chat.service';
import { NotificationService } from '@/services/notification.service';
import { Logout } from '@/Components/Features/Authentication/logout/logout';
import { getAuthItem } from '@/shared/services/auth-storage';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [RouterModule, CommonModule, FormsModule, StyleClassModule, AppConfigurator, ToggleButtonModule, PopoverModule, ButtonModule, DividerModule, Logout],
    styles: [
        `
            :host ::ng-deep .profile-popover .p-popover-content {
                padding: 0;
                overflow: hidden;
                border-radius: 0.75rem;
            }
        `
    ],
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

                    <button type="button" class="layout-topbar-action" (click)="profilePopover.toggle($event)" aria-label="Profile">
                        <i class="pi pi-user"></i>
                        <span>Profile</span>
                    </button>
                    <p-popover #profilePopover [dismissable]="true" appendTo="body" styleClass="profile-popover">
                        <div class="w-80">
                            <div class="relative p-4 overflow-hidden bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                                <div class="pointer-events-none absolute -top-6 -right-6 w-24 h-24 rounded-full bg-slate-900/5 dark:bg-white/5"></div>
                                <div class="pointer-events-none absolute top-6 right-10 w-16 h-16 rounded-full bg-slate-900/5 dark:bg-white/5"></div>
                                <div class="relative flex items-center gap-3">
                                    @if (profileImageUrl) {
                                        <img [src]="profileImageUrl" alt="Profile" class="w-14 h-14 rounded-full object-cover shrink-0 ring-2 ring-slate-200 dark:ring-white/10" />
                                    } @else {
                                        <div class="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-contrast text-xl font-semibold shrink-0 ring-2 ring-slate-200 dark:ring-white/10">{{ userInitials }}</div>
                                    }
                                    <div class="min-w-0">
                                        <div class="font-bold text-base text-slate-900 dark:text-white truncate" [title]="userName">{{ userName || 'User' }}</div>
                                        @if (rank) {
                                            <span class="inline-block mt-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 text-xs font-medium" [title]="rank">{{ rank }}</span>
                                        }
                                    </div>
                                </div>
                            </div>
                            <div class="bg-white dark:bg-slate-900 px-4 py-3 space-y-3">
                                <div>
                                    <div class="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 mb-1">EMAIL</div>
                                    <div class="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
                                        <i class="pi pi-envelope text-slate-500 dark:text-slate-400 text-xs"></i>
                                        <span class="break-all" [title]="email">{{ email || '—' }}</span>
                                    </div>
                                </div>
                                <div class="border-t border-slate-200 dark:border-slate-700/60"></div>
                                <div>
                                    <div class="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 mb-1">ROLE</div>
                                    <div class="flex items-center gap-2 text-sm">
                                        <i class="pi pi-shield text-slate-500 dark:text-slate-400 text-xs"></i>
                                        <span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-300 text-xs font-medium" [title]="roleName">{{ roleName || '—' }}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="bg-white dark:bg-slate-900 p-3 pt-0 flex flex-col gap-2">
                                <button type="button" class="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition" (click)="navigateAndClose('/change-password', profilePopover)">
                                    <i class="pi pi-lock"></i>
                                    <span>Change password</span>
                                </button>
                                <button type="button" class="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition" (click)="navigateAndClose('/identity/my-login-audit', profilePopover)">
                                    <i class="pi pi-history"></i>
                                    <span>Login history</span>
                                </button>
                            </div>
                        </div>
                    </p-popover>
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
    userName = '';
    email = '';
    roleName = '';
    rank = '';
    profileImageUrl: string | null = null;
    userInitials = '?';
    private readonly DARK_MODE_KEY = 'darkMode';
    private closeBound: ((e: MouseEvent) => void) | null = null;
    @ViewChild('notificationContainer') notificationContainer?: ElementRef<HTMLElement>;

    constructor(
        public layoutService: LayoutService,
        public notificationService: NotificationService,
        private chatService: ChatService,
        private router: Router,
        private mappingService: IdentityUserMappingService,
        private servingMembersService: ServingMembersService,
        private empService: EmpService
    ) {
        this.loadProfile();
        this.loadEmployeeProfile();
        this.loadDarkModePreference();
        this.unreadCount$ = this.notificationService.notifications$.pipe(
            map(() => this.notificationService.getUnreadCount())
        );
    }

    ngOnInit(): void {
        this.chatService.connectToHub().catch(() => {});
    }

    ngOnDestroy(): void {
        if (this.profileImageUrl) {
            URL.revokeObjectURL(this.profileImageUrl);
            this.profileImageUrl = null;
        }
    }

    private loadEmployeeProfile(): void {
        const raw = getAuthItem('auth');
        if (!raw) return;
        let userId: string | null = null;
        try {
            const info = JSON.parse(raw);
            userId = info.userId ?? info.id ?? null;
        } catch {
            return;
        }
        if (!userId) return;

        this.mappingService.getEmployeeIdForUser(userId).pipe(
            switchMap((empId) => {
                if (!empId) return EMPTY;
                return this.servingMembersService.getEmployeePersonalServiceOverview(empId).pipe(
                    catchError(() => of(null as EmployeePersonalServiceOverview | null))
                );
            })
        ).subscribe((profile) => {
            if (!profile) return;
            const name = (profile.nameEnglish ?? '').trim();
            if (name) {
                this.userName = name;
                this.userInitials = this.computeInitials(name);
            }
            this.rank = profile.armyRank ?? '';
            this.loadProfileImage(profile.profileImages ?? null);
        });
    }

    private loadProfileImage(json: string | null): void {
        if (!json) return;
        let refs: { FileId?: number; fileId?: number }[];
        try {
            refs = JSON.parse(json) as { FileId?: number; fileId?: number }[];
        } catch {
            return;
        }
        const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
        const fileId = first?.FileId ?? first?.fileId;
        if (fileId == null || fileId <= 0) return;
        this.empService.downloadFile(fileId).pipe(catchError(() => EMPTY)).subscribe((blob) => {
            if (blob && blob.size > 0) {
                if (this.profileImageUrl) URL.revokeObjectURL(this.profileImageUrl);
                this.profileImageUrl = URL.createObjectURL(blob);
            }
        });
    }

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

    private loadProfile(): void {
        const raw = getAuthItem('auth');
        if (!raw) return;
        try {
            const info = JSON.parse(raw);
            this.userName = info.userName ?? '';
            this.email = info.emailId ?? '';
            this.roleName = info.roleName ?? '';
            this.userInitials = this.computeInitials(this.userName || this.email);
        } catch {
            // ignore corrupt auth payload — popover will show fallbacks
        }
    }

    private computeInitials(source: string): string {
        if (!source) return '?';
        const parts = source.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    navigateAndClose(path: string, popover: { hide: () => void }): void {
        popover.hide();
        this.router.navigate([path]);
    }

    private loadDarkModePreference() {
        const savedDarkMode = localStorage.getItem(this.DARK_MODE_KEY);
        if (savedDarkMode !== null) {
            const isDark = JSON.parse(savedDarkMode);
            this.layoutService.layoutConfig.update((state) => ({ ...state, darkTheme: isDark }));
        }
    }
}
