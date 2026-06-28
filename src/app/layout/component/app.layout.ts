import { Component, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, interval, Subscription } from 'rxjs';
import { AppTopbar } from './app.topbar';
import { AppSidebar } from './app.sidebar';
import { AppFooter } from './app.footer';
import { LayoutService } from '../service/layout.service';
import { FloatingChatWidgetComponent } from '@/Components/Features/chat/floating-chat-widget.component';
import { ChatService } from '@/services/chat.service';
import { NotificationService } from '@/services/notification.service';
import { Toast } from 'primeng/toast';

@Component({
    selector: 'app-layout',
    standalone: true,
    imports: [CommonModule, AppTopbar, AppSidebar, RouterModule, AppFooter, FloatingChatWidgetComponent, Toast],
    template: `<div class="layout-wrapper" [ngClass]="containerClass">
        <app-topbar></app-topbar>
        <app-sidebar></app-sidebar>
        <div class="layout-main-container">
            <div class="layout-main">
                <router-outlet></router-outlet>
            </div>
            <app-footer></app-footer>
        </div>
        <app-floating-chat-widget></app-floating-chat-widget>
        <div class="layout-mask animate-fadein"></div>
        <!-- Global toast — used by root-level services for non-blocking notifications. -->
        <p-toast position="top-right" key="global"></p-toast>
        <!-- Idle-warning toast — center-stage, dismissed by IdleTimeoutService on activity. -->
        <p-toast position="center" key="idle"></p-toast>
    </div> `
})
export class AppLayout implements OnInit, OnDestroy {
    overlayMenuOpenSubscription: Subscription;
    private leaveApprovalSub: Subscription | null = null;
    private leaveReturnedSub: Subscription | null = null;
    private noteSheetApprovalSub: Subscription | null = null;
    private notificationPollSub: Subscription | null = null;

    menuOutsideClickListener: any;

    @ViewChild(AppSidebar) appSidebar!: AppSidebar;

    @ViewChild(AppTopbar) appTopBar!: AppTopbar;

    constructor(
        public layoutService: LayoutService,
        public renderer: Renderer2,
        public router: Router,
        private chatService: ChatService,
        private notificationService: NotificationService
    ) {
        this.overlayMenuOpenSubscription = this.layoutService.overlayOpen$.subscribe(() => {
            if (!this.menuOutsideClickListener) {
                this.menuOutsideClickListener = this.renderer.listen('document', 'click', (event) => {
                    if (this.isOutsideClicked(event)) {
                        this.hideMenu();
                    }
                });
            }

            if (this.layoutService.layoutState().staticMenuMobileActive) {
                this.blockBodyScroll();
            }
        });

        this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
            this.hideMenu();
        });
    }

    ngOnInit(): void {
        this.chatService.connectToHub().catch(() => {});
        this.notificationService.loadFromApi();
        // Poll periodically so the bell badge reflects notifications created during the session
        // (e.g. note-sheet approvals) even if a live SignalR push is missed.
        this.notificationPollSub = interval(30000).subscribe(() => this.notificationService.loadFromApi());
        this.leaveApprovalSub = this.chatService.leaveApprovalRequested$.subscribe((p) => {
            const msg = p?.message ?? 'A leave application requires your approval.';
            this.notificationService.add({
                type: 'leaveApproval',
                title: 'Leave Approval',
                message: msg,
                link: '/leave-application/pending-approval',
                data: { leaveApplicationId: p?.leaveApplicationId },
                serverId: p?.notificationId ?? undefined
            });
        });
        this.leaveReturnedSub = this.chatService.leaveReturned$.subscribe((p) => {
            const reasonSnippet = p?.reason ? ` Reason: ${p.reason}` : '';
            this.notificationService.add({
                type: 'leaveReturn',
                title: 'Leave Returned',
                message: (p?.message ?? 'Your leave application was returned for corrections.') + reasonSnippet,
                link: `/leave-application/apply?id=${p?.leaveApplicationId}`,
                data: { leaveApplicationId: p?.leaveApplicationId },
                serverId: p?.notificationId ?? undefined
            });
        });
        this.noteSheetApprovalSub = this.chatService.noteSheetApprovalRequested$.subscribe((p) => {
            this.notificationService.add({
                type: 'noteSheetApproval',
                title: 'Note-Sheet Approval',
                message: p?.message ?? 'A note-sheet requires your approval.',
                link: p?.link ?? '/notesheet-list/my-approval',
                data: { noteSheetId: p?.noteSheetId, noteSheetType: p?.noteSheetType },
                serverId: p?.notificationId ?? undefined
            });
        });
    }

    isOutsideClicked(event: MouseEvent) {
        const sidebarEl = document.querySelector('.layout-sidebar');
        const topbarEl = document.querySelector('.layout-menu-button');
        const eventTarget = event.target as Node;

        return !(sidebarEl?.isSameNode(eventTarget) || sidebarEl?.contains(eventTarget) || topbarEl?.isSameNode(eventTarget) || topbarEl?.contains(eventTarget));
    }

    hideMenu() {
        this.layoutService.layoutState.update((prev) => ({ ...prev, overlayMenuActive: false, staticMenuMobileActive: false, menuHoverActive: false }));
        if (this.menuOutsideClickListener) {
            this.menuOutsideClickListener();
            this.menuOutsideClickListener = null;
        }
        this.unblockBodyScroll();
    }

    blockBodyScroll(): void {
        if (document.body.classList) {
            document.body.classList.add('blocked-scroll');
        } else {
            document.body.className += ' blocked-scroll';
        }
    }

    unblockBodyScroll(): void {
        if (document.body.classList) {
            document.body.classList.remove('blocked-scroll');
        } else {
            document.body.className = document.body.className.replace(new RegExp('(^|\\b)' + 'blocked-scroll'.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
        }
    }

    get containerClass() {
        return {
            'layout-overlay': this.layoutService.layoutConfig().menuMode === 'overlay',
            'layout-static': this.layoutService.layoutConfig().menuMode === 'static',
            'layout-static-inactive': this.layoutService.layoutState().staticMenuDesktopInactive && this.layoutService.layoutConfig().menuMode === 'static',
            'layout-overlay-active': this.layoutService.layoutState().overlayMenuActive,
            'layout-mobile-active': this.layoutService.layoutState().staticMenuMobileActive
        };
    }

    ngOnDestroy(): void {
        this.leaveApprovalSub?.unsubscribe();
        this.leaveReturnedSub?.unsubscribe();
        this.noteSheetApprovalSub?.unsubscribe();
        this.notificationPollSub?.unsubscribe();
        if (this.overlayMenuOpenSubscription) {
            this.overlayMenuOpenSubscription.unsubscribe();
        }

        if (this.menuOutsideClickListener) {
            this.menuOutsideClickListener();
        }
    }
}
