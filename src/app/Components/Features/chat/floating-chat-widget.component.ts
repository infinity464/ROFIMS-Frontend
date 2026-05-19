import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { ChatService } from '@/services/chat.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { ChatWindowComponent } from '@/Components/Features/chat/chat-window.component';
import { ChatUserDto, DirectConversation, GroupDto } from '@/models/chat.model';
import { Subject, of, forkJoin } from 'rxjs';
import { takeUntil, filter, switchMap, catchError } from 'rxjs/operators';

interface OpenWindow {
  /** Stable key used in *ngFor trackBy: combines kind + id. */
  key: string;
  kind: 'direct' | 'group';
  /** userId for direct, groupId for group. */
  targetId: string | number;
  /** Display name pre-fetched from the conversation list (e.g. "ddadmin") — ChatWindow upgrades to Rank+Name when available. */
  title: string;
  /** Full group DTO for group kind (for avatar/member count); null for direct. */
  group: GroupDto | null;
  /** True when collapsed to a chat-head bubble. */
  minimized: boolean;
  /** Session unread tracker — bumped when a message arrives while minimized; cleared on restore. */
  unreadCount: number;
}

interface ConversationRow {
  kind: 'direct' | 'group';
  /** userId for direct, groupId for group. */
  id: string | number;
  title: string;
  subtitle: string;
  lastMessage: string;
  lastMessageDate: Date | string | null;
  unreadCount: number;
  /** Direct: profile blob URL or null. Group: groupImageFileId. */
  avatarUserId?: string;
  groupImageFileId?: number | null;
  group?: GroupDto;
}

@Component({
  selector: 'app-floating-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatWindowComponent],
  template: `
    <div *ngIf="isLoggedIn && !isOnChatPage" class="fixed bottom-4 right-4 z-[9999]">
      <!-- Bottom row: open chat windows + launcher (right-anchored, grows leftward) -->
      <div class="flex flex-row-reverse items-end gap-3">
        <!-- Launcher button + popup -->
        <div class="relative" #launcherContainer>
          <button type="button"
                  (click)="toggleConversationsPopup($event)"
                  class="relative w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105"
                  title="Open Chat">
            <i class="pi pi-comments text-xl"></i>
            <span *ngIf="totalUnread() > 0"
                  class="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-surface-900">
              {{ totalUnread() > 99 ? '99+' : totalUnread() }}
            </span>
          </button>

          <!-- Conversations popup -->
          <div *ngIf="showPopup"
               (click)="$event.stopPropagation()"
               class="absolute bottom-16 right-0 w-[340px] max-h-[520px] bg-surface-0 dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 flex flex-col overflow-hidden">
            <!-- Header -->
            <div class="px-4 pt-3 pb-2 border-b border-surface-200 dark:border-surface-700">
              <div class="flex items-center justify-between mb-2">
                <div class="text-base font-bold text-surface-900 dark:text-surface-0">Chats</div>
                <button type="button"
                        (click)="goToChat()"
                        class="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                        title="Open full chat page">
                  Open full
                </button>
              </div>
              <!-- Search -->
              <div class="relative mb-2">
                <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
                <input type="text" [(ngModel)]="searchText"
                       placeholder="Search Messenger"
                       class="w-full pl-8 pr-3 py-1.5 border border-surface-200 dark:border-surface-600 rounded-full bg-surface-50 dark:bg-surface-800 text-xs text-surface-900 dark:text-surface-0 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400">
              </div>
              <!-- Tabs -->
              <div class="flex gap-1">
                <button type="button"
                        (click)="popupTab = 'all'"
                        [class.bg-indigo-50]="popupTab === 'all'"
                        [class.dark:!bg-indigo-500\/15]="popupTab === 'all'"
                        [class.text-indigo-700]="popupTab === 'all'"
                        [class.dark:!text-indigo-300]="popupTab === 'all'"
                        [class.text-surface-600]="popupTab !== 'all'"
                        class="px-3 py-1 rounded-full text-xs font-semibold transition">All</button>
                <button type="button"
                        (click)="popupTab = 'direct'"
                        [class.bg-indigo-50]="popupTab === 'direct'"
                        [class.dark:!bg-indigo-500\/15]="popupTab === 'direct'"
                        [class.text-indigo-700]="popupTab === 'direct'"
                        [class.dark:!text-indigo-300]="popupTab === 'direct'"
                        [class.text-surface-600]="popupTab !== 'direct'"
                        class="px-3 py-1 rounded-full text-xs font-semibold transition">Direct</button>
                <button type="button"
                        (click)="popupTab = 'groups'"
                        [class.bg-emerald-50]="popupTab === 'groups'"
                        [class.dark:!bg-emerald-500\/15]="popupTab === 'groups'"
                        [class.text-emerald-700]="popupTab === 'groups'"
                        [class.dark:!text-emerald-300]="popupTab === 'groups'"
                        [class.text-surface-600]="popupTab !== 'groups'"
                        class="px-3 py-1 rounded-full text-xs font-semibold transition">Groups</button>
              </div>
            </div>

            <!-- Conversation list -->
            <div class="flex-1 overflow-y-auto py-1">
              <div *ngIf="loadingConversations" class="py-4 text-center text-xs text-surface-500"><i class="pi pi-spin pi-spinner mr-1"></i>Loading...</div>
              <div *ngIf="!loadingConversations && filteredRows().length === 0" class="py-6 text-center text-xs text-surface-500">
                {{ searchText.trim() ? 'No matches.' : 'No conversations yet.' }}
              </div>
              <button *ngFor="let r of filteredRows(); trackBy: trackByConvRow"
                      type="button"
                      (click)="openConversation(r)"
                      class="w-full text-left flex items-start gap-2.5 px-3 py-2 hover:bg-surface-100 dark:hover:bg-surface-800 transition">
                <!-- Avatar -->
                <div class="relative shrink-0">
                  <img *ngIf="rowAvatarUrl(r) as imgUrl; else letterAv"
                       [src]="imgUrl" alt=""
                       class="w-10 h-10 rounded-full object-cover bg-surface-100 dark:bg-surface-700" />
                  <ng-template #letterAv>
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-xs"
                         [style.background]="r.kind === 'direct' ? getAvatarColor(r.id + '') : '#10b981'">
                      <i *ngIf="r.kind === 'group'" class="pi pi-users text-sm"></i>
                      <ng-container *ngIf="r.kind === 'direct'">{{ rowLastInitial(r) }}</ng-container>
                    </div>
                  </ng-template>
                  <span *ngIf="r.kind === 'direct' && isOnline(r.id + '')"
                        class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface-0 dark:border-surface-900"></span>
                </div>
                <!-- Body -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline justify-between gap-2">
                    <div class="text-[13px] truncate leading-tight"
                         [class.font-bold]="r.unreadCount > 0"
                         [class.font-semibold]="r.unreadCount === 0"
                         [class.text-surface-900]="true"
                         [class.dark:!text-surface-0]="true">{{ r.title }}</div>
                    <span class="text-[10px] shrink-0"
                          [class.text-indigo-600]="r.unreadCount > 0"
                          [class.font-semibold]="r.unreadCount > 0"
                          [class.text-surface-500]="r.unreadCount === 0">{{ formatTime(r.lastMessageDate) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-2 mt-0.5">
                    <p class="text-[11px] truncate"
                       [class.text-surface-900]="r.unreadCount > 0"
                       [class.dark:!text-surface-0]="r.unreadCount > 0"
                       [class.font-semibold]="r.unreadCount > 0"
                       [class.text-surface-500]="r.unreadCount === 0">{{ r.lastMessage || (r.kind === 'group' ? 'No messages yet' : 'Say hi') }}</p>
                    <span *ngIf="r.unreadCount > 0"
                          class="shrink-0 bg-indigo-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                      {{ r.unreadCount }}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Open chat windows (rendered to the left of the launcher) -->
        <app-chat-window *ngFor="let w of openWindows; trackBy: trackByWindow"
                        [kind]="w.kind"
                        [targetId]="w.targetId"
                        [minimized]="w.minimized"
                        [group]="w.group"
                        [initialTitle]="w.title"
                        [unreadCount]="w.unreadCount"
                        (closeRequested)="closeWindow(w)"
                        (minimizeRequested)="minimizeWindow(w)"
                        (restoreRequested)="restoreWindow(w)">
        </app-chat-window>
      </div>
    </div>
  `
})
export class FloatingChatWidgetComponent implements OnInit, OnDestroy {
  isLoggedIn = false;
  isOnChatPage = false;

  showPopup = false;
  popupTab: 'all' | 'direct' | 'groups' = 'all';
  searchText = '';

  loadingConversations = false;
  directConversations: DirectConversation[] = [];
  groups: GroupDto[] = [];
  /** userId -> display name (login username) populated from getChatUsers. */
  private chatUserNames: Record<string, string> = {};

  openWindows: OpenWindow[] = [];
  private readonly MAX_VISIBLE_WINDOWS = 4;

  private currentUserId = '';
  private destroy$ = new Subject<void>();

  /** Profile cache for sidebar avatars (rank+name + image blob URL). */
  private userProfiles: Record<string, { rank: string; fullName: string; profileImageUrl: string | null }> = {};
  private profileFetchInflight: Record<string, boolean> = {};
  /** Group avatar blob URL cache keyed by groupId. */
  private groupAvatarUrls: Record<number, string> = {};
  private groupAvatarFetchInflight: Record<number, boolean> = {};
  /** Tracks the fileId currently cached for each group, to invalidate when changed. */
  private groupAvatarFileIdCache: Record<number, number> = {};

  // Notification sound
  private audioCtx: AudioContext | null = null;
  private lastSoundAt = 0;
  private readonly SOUND_THROTTLE_MS = 250;

  constructor(
    private chatService: ChatService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private mappingService: IdentityUserMappingService,
    private servingMembersService: ServingMembersService,
    private empService: EmpService,
    private hostRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    try {
      const auth = JSON.parse(sessionStorage.getItem('auth') ?? localStorage.getItem('auth') ?? '{}');
      this.currentUserId = auth?.userId ?? '';
      this.isLoggedIn = !!this.currentUserId;
    } catch { this.isLoggedIn = false; }

    this.updateIsOnChatPage();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateIsOnChatPage();
        this.cdr.markForCheck();
      });

    if (!this.isLoggedIn) return;

    // Load conversation counts immediately so the launcher badge reflects unread state on login,
    // without waiting for the user to open the popup.
    this.refreshConversations();

    this.chatService.connectToHub().catch(() => {});

    this.chatService.directMessageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: any) => {
        if (!payload || payload.receiverUserId !== this.currentUserId) return;
        this.playMessageSound();
        this.handleIncomingDirect(payload);
      });

    this.chatService.groupMessageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: any) => {
        if (!payload || payload.senderUserId === this.currentUserId) return;
        const content: string = payload.messageContent ?? '';
        if (!content.startsWith('__SYSTEM__:')) this.playMessageSound();
        this.handleIncomingGroup(payload);
      });

    this.chatService.groupDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { groupId: number }) => {
        if (!payload?.groupId) return;
        // Close any open window for this group + drop from local groups list.
        this.openWindows = this.openWindows.filter(w => !(w.kind === 'group' && w.targetId === payload.groupId));
        this.groups = this.groups.filter(g => g.groupId !== payload.groupId);
        this.cdr.markForCheck();
      });

    this.chatService.groupImageChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { groupId: number; groupImageFileId: number | null }) => {
        if (!payload?.groupId) return;
        const stale = this.groupAvatarUrls[payload.groupId];
        if (stale) URL.revokeObjectURL(stale);
        delete this.groupAvatarUrls[payload.groupId];
        delete this.groupAvatarFileIdCache[payload.groupId];
        const g = this.groups.find(gr => gr.groupId === payload.groupId);
        if (g) g.groupImageFileId = payload.groupImageFileId ?? null;
        this.cdr.markForCheck();
      });

    this.chatService.groupRenamed$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { groupId: number; groupName: string }) => {
        const g = this.groups.find(gr => gr.groupId === payload.groupId);
        if (g) g.groupName = payload.groupName;
        const w = this.openWindows.find(w => w.kind === 'group' && w.targetId === payload.groupId);
        if (w) { if (w.group) w.group.groupName = payload.groupName; w.title = payload.groupName; }
        this.cdr.markForCheck();
      });

    // When the user marks direct messages from a sender as seen (anywhere — ChatWindow, /chat page),
    // zero the badge for that conversation so totalUnread() reflects the read state.
    this.chatService.myDirectSeenForSender$
      .pipe(takeUntil(this.destroy$))
      .subscribe((senderUserId) => {
        if (!senderUserId) return;
        this.markDirectAsRead(senderUserId);
        this.cdr.markForCheck();
      });

    // Same for groups — when this user is the one marking messages seen, zero the badge.
    this.chatService.groupMessagesSeen$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { groupId: number; seenByUserId: string }) => {
        if (!payload || payload.seenByUserId !== this.currentUserId) return;
        this.markGroupAsRead(payload.groupId);
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    for (const fid of Object.keys(this.groupAvatarUrls)) {
      const url = this.groupAvatarUrls[+fid];
      if (url) URL.revokeObjectURL(url);
    }
    for (const uid of Object.keys(this.userProfiles)) {
      const url = this.userProfiles[uid]?.profileImageUrl;
      if (url) URL.revokeObjectURL(url);
    }
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
  }

  private updateIsOnChatPage(): void {
    this.isOnChatPage = this.router.url.includes('/chat');
  }

  // ---- Popup ----

  toggleConversationsPopup(event?: Event): void {
    if (event) event.stopPropagation();
    this.showPopup = !this.showPopup;
    if (this.showPopup) this.refreshConversations();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.showPopup) return;
    const host = this.hostRef?.nativeElement;
    if (!host) return;
    if (!host.contains(event.target as Node)) this.showPopup = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showPopup) this.showPopup = false;
  }

  refreshConversations(): void {
    this.loadingConversations = true;
    forkJoin({
      direct: this.chatService.getDirectConversations().pipe(catchError(() => of([] as DirectConversation[]))),
      groups: this.chatService.getUserGroups().pipe(catchError(() => of([] as GroupDto[]))),
      users: this.chatService.getChatUsers().pipe(catchError(() => of([] as ChatUserDto[])))
    }).pipe(takeUntil(this.destroy$)).subscribe(({ direct, groups, users }) => {
      this.directConversations = direct ?? [];
      this.groups = groups ?? [];
      for (const u of users ?? []) this.chatUserNames[u.userId] = u.userName || u.email || u.userId;
      for (const c of this.directConversations) this.ensureUserProfile(c.otherUserId);
      // Any conversation with an expanded (non-minimized) window is being read right now —
      // ignore any lingering server-side unread count for it to avoid the badge ticking back up.
      for (const w of this.openWindows) {
        if (w.minimized) continue;
        if (w.kind === 'direct') {
          const c = this.directConversations.find(c => c.otherUserId === w.targetId);
          if (c) c.unreadCount = 0;
        } else {
          const g = this.groups.find(g => g.groupId === w.targetId);
          if (g) g.unreadCount = 0;
        }
      }
      this.loadingConversations = false;
    });
  }

  filteredRows(): ConversationRow[] {
    const rows: ConversationRow[] = [];
    if (this.popupTab === 'all' || this.popupTab === 'direct') {
      for (const c of this.directConversations) {
        rows.push({
          kind: 'direct',
          id: c.otherUserId,
          title: this.getRankAndName(c.otherUserId) || this.chatUserNames[c.otherUserId] || c.otherUserId,
          subtitle: this.chatUserNames[c.otherUserId] || '',
          lastMessage: c.lastMessage,
          lastMessageDate: c.lastMessageDate,
          unreadCount: c.unreadCount ?? 0,
          avatarUserId: c.otherUserId
        });
      }
    }
    if (this.popupTab === 'all' || this.popupTab === 'groups') {
      for (const g of this.groups) {
        rows.push({
          kind: 'group',
          id: g.groupId,
          title: g.groupName,
          subtitle: `${g.memberCount} members`,
          lastMessage: this.formatGroupPreview(g.lastMessagePreview ?? ''),
          lastMessageDate: g.lastMessageAt ?? null,
          unreadCount: g.unreadCount ?? 0,
          groupImageFileId: g.groupImageFileId ?? null,
          group: g
        });
      }
    }
    // Sort by last message time desc.
    rows.sort((a, b) => {
      const ta = a.lastMessageDate ? new Date(a.lastMessageDate).getTime() : 0;
      const tb = b.lastMessageDate ? new Date(b.lastMessageDate).getTime() : 0;
      return tb - ta;
    });
    const q = this.searchText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.title.toLowerCase().includes(q)
      || r.subtitle.toLowerCase().includes(q)
      || (r.lastMessage ?? '').toLowerCase().includes(q));
  }

  trackByConvRow(_: number, r: ConversationRow): string {
    return r.kind + ':' + r.id;
  }

  openConversation(r: ConversationRow): void {
    this.showPopup = false;
    if (r.kind === 'direct') this.openDirectWindow(r.id as string, r.title);
    else this.openGroupWindow(r.group ?? this.groups.find(g => g.groupId === r.id), r.title);
  }

  // ---- Window management ----

  trackByWindow(_: number, w: OpenWindow): string {
    return w.key;
  }

  private openDirectWindow(userId: string, title: string): void {
    this.markDirectAsRead(userId);
    const existing = this.openWindows.find(w => w.kind === 'direct' && w.targetId === userId);
    if (existing) {
      existing.minimized = false;
      existing.unreadCount = 0;
      this.cdr.markForCheck();
      return;
    }
    this.openWindows = [{
      key: 'direct:' + userId,
      kind: 'direct',
      targetId: userId,
      title,
      group: null,
      minimized: false,
      unreadCount: 0
    }, ...this.openWindows];
    this.enforceWindowLimit();
  }

  private openGroupWindow(group: GroupDto | undefined, title: string): void {
    if (!group) return;
    this.markGroupAsRead(group.groupId);
    const existing = this.openWindows.find(w => w.kind === 'group' && w.targetId === group.groupId);
    if (existing) {
      existing.minimized = false;
      existing.unreadCount = 0;
      this.cdr.markForCheck();
      return;
    }
    this.openWindows = [{
      key: 'group:' + group.groupId,
      kind: 'group',
      targetId: group.groupId,
      title: title || group.groupName,
      group,
      minimized: false,
      unreadCount: 0
    }, ...this.openWindows];
    this.enforceWindowLimit();
  }

  /** Zeroes out the local direct-conversation unread count and the in-session overlay for the given user. */
  private markDirectAsRead(userId: string): void {
    const c = this.directConversations.find(c => c.otherUserId === userId);
    if (c) c.unreadCount = 0;
    this.chatService.clearUnreadOverlay(userId);
  }

  /** Zeroes out the local group unread count and the in-session overlay for the given group. */
  private markGroupAsRead(groupId: number): void {
    const g = this.groups.find(g => g.groupId === groupId);
    if (g) g.unreadCount = 0;
    this.chatService.clearGroupUnreadOverlay(groupId);
  }

  /** Closes the oldest expanded window if we exceed the visible limit (counts both expanded + minimized). */
  private enforceWindowLimit(): void {
    if (this.openWindows.length <= this.MAX_VISIBLE_WINDOWS) return;
    // Drop the oldest (last in the array since openWindows is newest-first).
    this.openWindows = this.openWindows.slice(0, this.MAX_VISIBLE_WINDOWS);
  }

  closeWindow(w: OpenWindow): void {
    this.openWindows = this.openWindows.filter(x => x.key !== w.key);
    if (w.kind === 'group') this.chatService.leaveGroupHub(w.targetId as number).catch(() => {});
  }

  minimizeWindow(w: OpenWindow): void {
    w.minimized = true;
    this.cdr.markForCheck();
  }

  restoreWindow(w: OpenWindow): void {
    w.minimized = false;
    w.unreadCount = 0;
    if (w.kind === 'direct') this.markDirectAsRead(w.targetId as string);
    else this.markGroupAsRead(w.targetId as number);
    this.cdr.markForCheck();
  }

  // ---- Incoming message handlers ----

  private handleIncomingDirect(payload: any): void {
    const senderId = payload.senderUserId;
    const existing = this.openWindows.find(w => w.kind === 'direct' && w.targetId === senderId);
    if (existing) {
      if (existing.minimized) existing.unreadCount++;
      // If expanded, ChatWindow handles the message + seen mark via its own subscription.
      this.cdr.markForCheck();
      return;
    }
    // Auto-open as a minimized chat head so the user notices without disruption.
    const title = payload.senderName || this.chatUserNames[senderId] || senderId;
    this.openWindows = [{
      key: 'direct:' + senderId,
      kind: 'direct',
      targetId: senderId,
      title,
      group: null,
      minimized: true,
      unreadCount: 1
    }, ...this.openWindows];
    this.enforceWindowLimit();
    this.ensureUserProfile(senderId);
    this.cdr.markForCheck();
  }

  private handleIncomingGroup(payload: any): void {
    const groupId = payload.groupId as number;
    const existing = this.openWindows.find(w => w.kind === 'group' && w.targetId === groupId);
    if (existing) {
      if (existing.minimized) existing.unreadCount++;
      this.cdr.markForCheck();
      return;
    }
    const group = this.groups.find(g => g.groupId === groupId);
    if (!group) {
      // Group metadata not loaded yet (page just refreshed). Fetch the list silently so the next message has it,
      // and skip auto-opening this one to avoid a half-rendered window with no name.
      this.refreshConversations();
      return;
    }
    this.openWindows = [{
      key: 'group:' + groupId,
      kind: 'group',
      targetId: groupId,
      title: payload.groupName || group.groupName,
      group,
      minimized: true,
      unreadCount: 1
    }, ...this.openWindows];
    this.enforceWindowLimit();
    this.cdr.markForCheck();
  }

  totalUnread(): number {
    let total = 0;
    // For each known conversation, take max(server-reported, locally-tracked window count).
    // The window counter bumps on live incoming messages; the server count refreshes on popup open.
    // Summing both would double-count the same unread message.
    for (const c of this.directConversations) {
      const w = this.openWindows.find(ow => ow.kind === 'direct' && ow.targetId === c.otherUserId);
      const winCount = w && w.minimized ? w.unreadCount : 0;
      total += Math.max(winCount, c.unreadCount ?? 0);
    }
    for (const g of this.groups) {
      const w = this.openWindows.find(ow => ow.kind === 'group' && ow.targetId === g.groupId);
      const winCount = w && w.minimized ? w.unreadCount : 0;
      total += Math.max(winCount, g.unreadCount ?? 0);
    }
    // Include orphan minimized windows whose conversation isn't in the loaded lists yet
    // (e.g. a live message arrived before the first refreshConversations completed).
    for (const w of this.openWindows) {
      if (!w.minimized) continue;
      const known = w.kind === 'direct'
        ? this.directConversations.some(c => c.otherUserId === w.targetId)
        : this.groups.some(g => g.groupId === w.targetId);
      if (!known) total += w.unreadCount;
    }
    return total;
  }

  // ---- Avatars ----

  rowAvatarUrl(r: ConversationRow): string | null {
    if (r.kind === 'direct') return this.userProfiles[r.id as string]?.profileImageUrl ?? null;
    return this.getGroupAvatarUrl(r.group);
  }

  private getGroupAvatarUrl(g: GroupDto | undefined): string | null {
    if (!g) return null;
    const fid = g.groupImageFileId;
    if (!fid || fid <= 0) return null;
    if (this.groupAvatarFileIdCache[g.groupId] !== fid) {
      const stale = this.groupAvatarUrls[g.groupId];
      if (stale) URL.revokeObjectURL(stale);
      delete this.groupAvatarUrls[g.groupId];
      this.groupAvatarFileIdCache[g.groupId] = fid;
    }
    const cached = this.groupAvatarUrls[g.groupId];
    if (cached) return cached;
    if (this.groupAvatarFetchInflight[g.groupId]) return null;
    this.groupAvatarFetchInflight[g.groupId] = true;
    this.empService.downloadFile(fid).pipe(
      catchError(() => of(null)),
      takeUntil(this.destroy$)
    ).subscribe((blob) => {
      this.groupAvatarFetchInflight[g.groupId] = false;
      if (!blob || (blob as Blob).size === 0) return;
      this.groupAvatarUrls[g.groupId] = URL.createObjectURL(blob as Blob);
      this.cdr.markForCheck();
    });
    return null;
  }

  rowLastInitial(r: ConversationRow): string {
    if (r.kind === 'group') return (r.title || 'G').trim().charAt(0).toUpperCase();
    const profile = this.userProfiles[r.id as string];
    const fullName = (profile?.fullName ?? '').trim();
    if (fullName) {
      const parts = fullName.split(/\s+/);
      return (parts[parts.length - 1] ?? '').charAt(0).toUpperCase() || '?';
    }
    return (r.title || (r.id + '')).charAt(0).toUpperCase() || '?';
  }

  getRankAndName(userId: string): string {
    const p = this.userProfiles[userId];
    if (!p) return '';
    return `${p.rank ?? ''} ${p.fullName ?? ''}`.trim();
  }

  isOnline(userId: string): boolean {
    return this.chatService.isUserOnline(userId);
  }

  getAvatarColor(seed: string): string {
    const palette = [
      'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
      'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)',
      'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
      'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)',
      'linear-gradient(135deg, #ef4444 0%, #fb7185 100%)'
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  formatTime(d: Date | string | null | undefined): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const now = new Date();
    const same = dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate();
    if (same) return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const diffMs = now.getTime() - dt.getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 1) return '1d';
    if (days < 7) return `${days}d`;
    return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  formatGroupPreview(preview: string): string {
    return (preview ?? '').replace(/^__SYSTEM__:/, '');
  }

  // ---- Profile fetch ----

  private ensureUserProfile(userId: string): void {
    if (!userId || this.userProfiles[userId] || this.profileFetchInflight[userId]) return;
    this.profileFetchInflight[userId] = true;
    this.mappingService.getEmployeeIdForUser(userId).pipe(
      switchMap((empId) => empId
        ? this.servingMembersService.getEmployeePersonalServiceOverview(empId).pipe(catchError(() => of(null)))
        : of(null)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (profile) => {
        this.profileFetchInflight[userId] = false;
        if (!profile) return;
        const rank = (profile.armyRank ?? '').toString().trim();
        const fullName = (profile.nameEnglish ?? '').toString().trim();
        this.userProfiles[userId] = { rank, fullName, profileImageUrl: null };
        this.loadUserProfileImage(userId, profile.profileImages ?? null);
        this.cdr.markForCheck();
      },
      error: () => { this.profileFetchInflight[userId] = false; }
    });
  }

  private loadUserProfileImage(userId: string, json: string | null): void {
    if (!json) return;
    let refs: any[];
    try { refs = JSON.parse(json); } catch { return; }
    const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
    const fileId = first?.FileId ?? first?.fileId;
    if (!fileId) return;
    this.empService.downloadFile(fileId).pipe(
      catchError(() => of(null)),
      takeUntil(this.destroy$)
    ).subscribe((blob) => {
      if (!blob || (blob as Blob).size === 0) return;
      const p = this.userProfiles[userId];
      if (!p) return;
      if (p.profileImageUrl) URL.revokeObjectURL(p.profileImageUrl);
      p.profileImageUrl = URL.createObjectURL(blob as Blob);
      this.cdr.markForCheck();
    });
  }

  // ---- Navigation ----

  goToChat(): void {
    this.showPopup = false;
    this.router.navigate(['/chat']);
  }

  // ---- Sound ----

  private playMessageSound(): void {
    const now = Date.now();
    if (now - this.lastSoundAt < this.SOUND_THROTTLE_MS) return;
    this.lastSoundAt = now;
    try {
      if (!this.audioCtx) {
        const Ctx: typeof AudioContext | undefined =
          (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.audioCtx = new Ctx();
      }
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const t0 = ctx.currentTime;
      this.scheduleTone(ctx, 880, t0, 0.18, 0.22);
      this.scheduleTone(ctx, 1320, t0 + 0.08, 0.18, 0.18);
    } catch { /* non-critical */ }
  }

  private scheduleTone(ctx: AudioContext, freq: number, startAt: number, duration: number, peak: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
  }
}
