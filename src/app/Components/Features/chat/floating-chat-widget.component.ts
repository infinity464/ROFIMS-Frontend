import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { ChatService } from '@/services/chat.service';
import { Subject } from 'rxjs';
import { takeUntil, combineLatestWith, filter } from 'rxjs/operators';

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
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3" *ngIf="isLoggedIn && !isOnChatPage">
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
        <div class="flex items-center gap-2 bg-surface-0 dark:bg-surface-800 rounded-full shadow-lg border border-surface-200 dark:border-surface-600 hover:shadow-xl transition-all hover:scale-105 min-w-[200px] pr-2 py-1.5 pl-1.5">
          <div class="w-10 h-10 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {{ getInitial(bubble.senderName) }}
          </div>
          <div class="flex-1 min-w-0 text-left">
            <p class="text-sm font-medium text-surface-900 dark:text-surface-0 truncate">{{ bubble.senderName }}</p>
            <p class="text-xs text-surface-600 dark:text-surface-400">{{ bubble.unreadCount }} unread {{ bubble.unreadCount === 1 ? 'message' : 'messages' }}</p>
          </div>
        </div>
      </div>

      <!-- Main Chat button (like FB pencil icon) -->
      <button type="button"
              (click)="goToChat()"
              class="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105"
              title="Open Chat">
        <i class="pi pi-comments text-xl"></i>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class FloatingChatWidgetComponent implements OnInit, OnDestroy {
  bubbles: ChatBubble[] = [];
  groupBubbles: GroupChatBubble[] = [];
  isLoggedIn = false;
  isOnChatPage = false;
  private currentUserId = '';
  private destroy$ = new Subject<void>();
  private readonly MAX_BUBBLES = 5;
  private readonly MAX_GROUP_BUBBLES = 5;

  constructor(
    private chatService: ChatService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    try {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
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

    this.chatService.connectToHub().catch(() => {});

    this.chatService.directMessageReceived$
      .pipe(
        combineLatestWith(this.chatService.selectedOtherUserId$),
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
  }

  private addOrUpdateBubble(bubble: ChatBubble): void {
    const existing = this.bubbles.find((b) => b.senderUserId === bubble.senderUserId);
    const unreadCount = existing ? existing.unreadCount + 1 : 1;
    const updated: ChatBubble = { ...bubble, unreadCount };
    this.bubbles = [
      updated,
      ...this.bubbles.filter((b) => b.senderUserId !== bubble.senderUserId)
    ].slice(0, this.MAX_BUBBLES);
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
    this.router.navigate(['/chat']);
  }

  openGroup(groupId: number): void {
    this.removeGroupBubble(groupId);
    this.cdr.markForCheck();
    this.chatService.requestOpenGroup(groupId);
    this.router.navigate(['/chat']);
  }

  goToChat(): void {
    this.router.navigate(['/chat']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
