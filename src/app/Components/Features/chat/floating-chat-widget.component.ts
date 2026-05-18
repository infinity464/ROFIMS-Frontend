import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { ChatService } from '@/services/chat.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { ChatContainerComponent } from '@/Components/Features/chat/chat-container.component';
import { ChatUserDto, DirectConversation } from '@/models/chat.model';
import { forkJoin } from 'rxjs';
import { Subject, of } from 'rxjs';
import { takeUntil, withLatestFrom, filter, switchMap, catchError } from 'rxjs/operators';

export interface ChatBubble {
  type: 'direct';
  senderUserId: string;
  senderName: string;
  unreadCount: number;
}

export interface GroupChatBubble {
  type: 'group';
  groupId: number;
  groupName: string;
  senderName: string;
  unreadCount: number;
}

@Component({
  selector: 'app-floating-chat-widget',
  standalone: true,
  imports: [CommonModule, DialogModule, ChatContainerComponent],
  template: `
    <div class="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3" *ngIf="isLoggedIn && !isOnChatPage && !showChatModal">
      <!-- Group message bubbles -->
      <div *ngFor="let bubble of groupBubbles; trackBy: trackByGroup"
           (click)="openGroup(bubble.groupId)"
           class="flex items-center gap-2 cursor-pointer group">
        <div class="flex items-center gap-2 bg-surface-0 dark:bg-surface-800 rounded-full shadow-lg border border-surface-200 dark:border-surface-600 hover:shadow-xl transition-all hover:scale-105 min-w-[200px] pr-2 py-1.5 pl-1.5">
          <div class="w-10 h-10 rounded-full bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            <i class="pi pi-users text-lg"></i>
          </div>
          <div class="flex-1 min-w-0 text-left">
            <p class="text-sm font-medium text-surface-900 dark:text-surface-0 truncate">{{ bubble.groupName || 'Group' }}</p>
            <p class="text-xs text-surface-600 dark:text-surface-400">{{ bubble.senderName }} · {{ bubble.unreadCount }} unread</p>
          </div>
        </div>
      </div>
      <!-- Direct message bubbles (FB-style chat heads) -->
      <div *ngFor="let bubble of bubbles; trackBy: trackBySender"
           (click)="openChat(bubble.senderUserId)"
           class="flex items-center gap-2 cursor-pointer group">
        <div class="chat-attention-bubble flex items-center gap-2 bg-surface-0 dark:bg-surface-800 rounded-2xl shadow-lg border-2 border-red-500 hover:shadow-xl transition-all hover:scale-105 min-w-[220px] pr-3 py-2 pl-2">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {{ getInitial(getBubbleRankAndName(bubble)) }}
          </div>
          <div class="flex-1 min-w-0 text-left">
            <p class="text-[13px] font-semibold leading-tight text-surface-900 dark:text-surface-0 truncate">{{ getBubbleRankAndName(bubble) }}</p>
            <p class="text-[10px] text-surface-500 dark:text-surface-400 truncate leading-tight">{{ bubble.senderName }}</p>
            <p class="text-[11px] text-red-600 dark:text-red-400 font-medium mt-0.5">{{ bubble.unreadCount }} unread {{ bubble.unreadCount === 1 ? 'message' : 'messages' }}</p>
          </div>
        </div>
      </div>

      <!-- Main Chat button (like FB pencil icon) -->
      <button type="button"
              (click)="openChatModal()"
              class="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105"
              title="Open Chat">
        <i class="pi pi-comments text-xl"></i>
      </button>
    </div>

    <p-dialog
      [(visible)]="showChatModal"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [dismissableMask]="true"
      [closeOnEscape]="true"
      [style]="{ width: '90vw', maxWidth: '1100px', height: '85vh' }"
      [contentStyle]="{ padding: '0', overflow: 'hidden' }"
      styleClass="chat-modal-dialog">
      <ng-template pTemplate="header">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
          <span class="text-lg font-bold text-surface-900 dark:text-surface-0">Messages</span>
        </div>
      </ng-template>
      <app-chat-container *ngIf="showChatModal"></app-chat-container>
    </p-dialog>
  `,
  styles: [`
    :host { display: block; }
    :host ::ng-deep .chat-modal-dialog .p-dialog-content { height: 100%; padding: 0; }
    :host ::ng-deep .chat-modal-dialog .p-dialog-header { border-bottom: 1px solid var(--p-surface-200, #e5e7eb); padding: 1rem 1.25rem; }
    :host-context(.app-dark) ::ng-deep .chat-modal-dialog .p-dialog-header { border-bottom-color: var(--p-surface-700, #334155); }
    :host ::ng-deep .chat-modal-dialog .chat-container { height: 100% !important; }

    .chat-attention-bubble {
      animation: chatAttentionPulse 1.6s ease-in-out infinite;
    }
    @keyframes chatAttentionPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45), 0 10px 15px -3px rgba(0,0,0,0.1); }
      50%      { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0),    0 10px 15px -3px rgba(0,0,0,0.1); }
    }
  `]
})
export class FloatingChatWidgetComponent implements OnInit, OnDestroy {
  bubbles: ChatBubble[] = [];
  groupBubbles: GroupChatBubble[] = [];
  isLoggedIn = false;
  isOnChatPage = false;
  showChatModal = false;
  private currentUserId = '';
  private destroy$ = new Subject<void>();
  private readonly MAX_BUBBLES = 5;
  private readonly MAX_GROUP_BUBBLES = 5;

  /** Cache of rank+name per senderUserId so the bubble can show "Major Aziz" instead of the userName. */
  private userProfiles: Record<string, { rank: string; fullName: string }> = {};
  private profileFetchInflight: Record<string, boolean> = {};

  constructor(
    private chatService: ChatService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private mappingService: IdentityUserMappingService,
    private servingMembersService: ServingMembersService
  ) {}

  ngOnInit(): void {
    try {
      const auth = JSON.parse(sessionStorage.getItem('auth') ?? localStorage.getItem('auth') ?? '{}');
      this.currentUserId = auth?.userId ?? '';
      this.isLoggedIn = !!this.currentUserId;
    } catch {
      this.isLoggedIn = false;
    }

    this.updateIsOnChatPage();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(() => {
        const wasOnChat = this.isOnChatPage;
        this.updateIsOnChatPage();
        if (this.isOnChatPage) {
          const viewing = this.chatService.getSelectedOtherUserId();
          if (viewing) this.removeBubble(viewing);
        }
        if (wasOnChat && !this.isOnChatPage) {
          const lastViewed = this.chatService.getAndClearLastViewedUserId();
          if (lastViewed) this.removeBubble(lastViewed);
        }
        this.cdr.markForCheck();
      });

    if (!this.isLoggedIn) return;

    this.chatService.connectToHub()
      .then(() => this.seedBubblesFromUnreadConversations())
      .catch(() => this.seedBubblesFromUnreadConversations());

    this.chatService.directMessageReceived$
      .pipe(
        withLatestFrom(this.chatService.selectedOtherUserId$),
        takeUntil(this.destroy$)
      )
      .subscribe(([payload, selectedOtherUserId]) => {
        if (!payload || payload.receiverUserId !== this.currentUserId) return;
        if (payload.senderUserId === selectedOtherUserId) return;
        this.addOrUpdateBubble({
          type: 'direct',
          senderUserId: payload.senderUserId,
          senderName: payload.senderName || payload.senderUserId || 'Someone',
          unreadCount: 1
        });
        this.ensureUserProfile(payload.senderUserId);
        this.cdr.markForCheck();
      });

    this.chatService.groupMessageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: any) => {
        if (!payload || payload.senderUserId === this.currentUserId) return;
        this.addOrUpdateGroupBubble({
          type: 'group',
          groupId: payload.groupId,
          groupName: payload.groupName || 'Group',
          senderName: payload.senderName || 'Someone',
          unreadCount: 1
        });
        this.cdr.markForCheck();
      });

    this.chatService.selectedOtherUserId$
      .pipe(takeUntil(this.destroy$))
      .subscribe((userId) => {
        if (userId) {
          this.removeBubble(userId);
        } else {
          const lastViewed = this.chatService.getAndClearLastViewedUserId();
          if (lastViewed) this.removeBubble(lastViewed);
        }
        this.cdr.markForCheck();
      });

    this.chatService.myDirectSeenForSender$
      .pipe(takeUntil(this.destroy$))
      .subscribe((senderUserId) => {
        if (senderUserId) {
          this.removeBubble(senderUserId);
          this.cdr.markForCheck();
        }
      });
  }

  private addOrUpdateBubble(bubble: ChatBubble): void {
    const existing = this.bubbles.find((b) => b.senderUserId === bubble.senderUserId);
    const unreadCount = existing ? existing.unreadCount + 1 : 1;
    const updated: ChatBubble = { ...bubble, unreadCount };
    this.bubbles = [
      updated,
      ...this.bubbles.filter((b) => b.senderUserId !== bubble.senderUserId)
    ].slice(0, this.MAX_BUBBLES);
    this.chatService.bumpUnreadOverlay(bubble.senderUserId);
  }

  private addOrUpdateGroupBubble(bubble: GroupChatBubble): void {
    const existing = this.groupBubbles.find((b) => b.groupId === bubble.groupId);
    const unreadCount = existing ? existing.unreadCount + 1 : 1;
    const updated: GroupChatBubble = { ...bubble, unreadCount };
    this.groupBubbles = [
      updated,
      ...this.groupBubbles.filter((b) => b.groupId !== bubble.groupId)
    ].slice(0, this.MAX_GROUP_BUBBLES);
  }

  private removeBubble(senderUserId: string): void {
    this.bubbles = this.bubbles.filter((b) => b.senderUserId !== senderUserId);
    this.chatService.clearUnreadOverlay(senderUserId);
  }

  private removeGroupBubble(groupId: number): void {
    this.groupBubbles = this.groupBubbles.filter((b) => b.groupId !== groupId);
  }

  private updateIsOnChatPage(): void {
    this.isOnChatPage = this.router.url.includes('/chat');
  }

  getInitial(name: string): string {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
  }

  /** Returns "Major Aziz" if the employee profile has resolved; otherwise falls back to the SignalR senderName. */
  getBubbleRankAndName(bubble: ChatBubble): string {
    const p = this.userProfiles[bubble.senderUserId];
    if (p) {
      const composed = `${p.rank ?? ''} ${p.fullName ?? ''}`.trim();
      if (composed) return composed;
    }
    return bubble.senderName || bubble.senderUserId || 'Someone';
  }

  /**
   * Populate bubbles from the server's unread-conversation list so messages received while the user
   * was offline (no live SignalR DirectMessageReceived) still surface as red attention bubbles.
   */
  private seedBubblesFromUnreadConversations(): void {
    forkJoin({
      conversations: this.chatService.getDirectConversations(),
      users: this.chatService.getChatUsers()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ conversations, users }) => {
        const userNameById = new Map<string, string>(
          (users ?? []).map((u: ChatUserDto) => [u.userId, u.userName || u.email || u.userId])
        );
        const unread = (conversations ?? []).filter((c: DirectConversation) => c.unreadCount > 0);
        for (const c of unread) {
          if (this.bubbles.some((b) => b.senderUserId === c.otherUserId)) continue;
          this.bubbles.push({
            type: 'direct',
            senderUserId: c.otherUserId,
            senderName: userNameById.get(c.otherUserId) || c.otherUserId,
            unreadCount: c.unreadCount
          });
          this.chatService.setUnreadOverlay(c.otherUserId, c.unreadCount);
          this.ensureUserProfile(c.otherUserId);
        }
        this.bubbles = this.bubbles.slice(0, this.MAX_BUBBLES);
        this.cdr.markForCheck();
      },
      error: () => { /* silent */ }
    });
  }

  /** Lazy-fetch employeeId → profile (rank + nameEnglish) so the bubble can upgrade from userName to rank+name. */
  private ensureUserProfile(userId: string): void {
    if (!userId) return;
    if (this.userProfiles[userId] || this.profileFetchInflight[userId]) return;
    this.profileFetchInflight[userId] = true;
    this.mappingService.getEmployeeIdForUser(userId).pipe(
      switchMap((empId) => {
        if (!empId) return of(null);
        return this.servingMembersService.getEmployeePersonalServiceOverview(empId).pipe(
          catchError(() => of(null))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (profile) => {
        this.profileFetchInflight[userId] = false;
        if (!profile) return;
        const rank = (profile.armyRank ?? '').toString().trim();
        const fullName = (profile.nameEnglish ?? '').toString().trim();
        if (rank || fullName) {
          this.userProfiles[userId] = { rank, fullName };
          this.cdr.markForCheck();
        }
      },
      error: () => { this.profileFetchInflight[userId] = false; }
    });
  }

  trackBySender(_: number, b: ChatBubble): string {
    return b.senderUserId;
  }

  trackByGroup(_: number, b: GroupChatBubble): number {
    return b.groupId;
  }

  openChat(senderUserId: string): void {
    this.removeBubble(senderUserId);
    this.cdr.markForCheck();
    this.chatService.requestOpenConversation(senderUserId);
    this.showChatModal = true;
  }

  openGroup(groupId: number): void {
    this.removeGroupBubble(groupId);
    this.cdr.markForCheck();
    this.chatService.requestOpenGroup(groupId);
    this.showChatModal = true;
  }

  goToChat(): void {
    this.router.navigate(['/chat']);
  }

  openChatModal(): void {
    this.showChatModal = true;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
