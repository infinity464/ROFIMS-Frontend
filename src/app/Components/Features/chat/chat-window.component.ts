import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, of, forkJoin } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { ChatService } from '@/services/chat.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import {
  ChatAttachment,
  DirectMessageDto,
  GroupDto,
  GroupMessageDto
} from '@/models/chat.model';

interface NormalisedMessage {
  messageId: number;
  senderUserId: string;
  receiverUserId?: string;
  messageContent: string;
  attachments?: string | null;
  sentTime: Date;
  isSeen?: boolean;
  isDeleted: boolean;
}

interface UserProfileLite {
  rank: string;
  fullName: string;
  profileImageUrl?: string | null;
}

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Minimized "chat head" bubble (avatar only) -->
    <button *ngIf="minimized"
            type="button"
            (click)="onRestore()"
            class="relative w-12 h-12 rounded-full shadow-lg ring-2 ring-white dark:ring-surface-900 hover:scale-105 transition focus:outline-none"
            [title]="title">
      <img *ngIf="avatarUrl(); else headLetter" [src]="avatarUrl()" alt=""
           class="w-12 h-12 rounded-full object-cover" />
      <ng-template #headLetter>
        <div class="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base"
             [class.bg-indigo-500]="kind === 'direct'"
             [class.bg-emerald-500]="kind === 'group'">
          {{ headInitial() }}
        </div>
      </ng-template>
      <span *ngIf="unreadCount > 0"
            class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-surface-900">
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <!-- Expanded chat window -->
    <div *ngIf="!minimized"
         class="flex flex-col w-[320px] h-[440px] bg-surface-0 dark:bg-surface-900 rounded-t-2xl shadow-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 shrink-0"
           [class.bg-emerald-50]="kind === 'group'"
           [class.dark:!bg-emerald-500\/10]="kind === 'group'">
        <div class="relative shrink-0">
          <img *ngIf="avatarUrl(); else headerLetter" [src]="avatarUrl()" alt=""
               class="w-8 h-8 rounded-lg object-cover bg-surface-100 dark:bg-surface-700" />
          <ng-template #headerLetter>
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-xs"
                 [class.bg-indigo-500]="kind === 'direct'"
                 [class.bg-emerald-500]="kind === 'group'">
              <i *ngIf="kind === 'group' && !groupHasImage()" class="pi pi-users text-xs"></i>
              <ng-container *ngIf="kind === 'direct' || groupHasImage()">{{ headInitial() }}</ng-container>
            </div>
          </ng-template>
          <span *ngIf="kind === 'direct' && isDirectOnline()"
                title="Online"
                class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface-0 dark:border-surface-900"></span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-semibold text-surface-900 dark:text-surface-0 truncate leading-tight">{{ title }}</div>
          <div class="text-[10px] text-surface-500 dark:text-surface-400 truncate leading-tight">{{ subtitle }}</div>
        </div>
        <button type="button" (click)="onMinimize()"
                class="w-7 h-7 rounded-full flex items-center justify-center text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition"
                title="Minimize">
          <i class="pi pi-minus text-xs"></i>
        </button>
        <button type="button" (click)="onClose()"
                class="w-7 h-7 rounded-full flex items-center justify-center text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition"
                title="Close">
          <i class="pi pi-times text-xs"></i>
        </button>
      </div>

      <!-- Messages -->
      <div #messagesContainer class="flex-1 overflow-y-auto px-3 py-2 space-y-1 bg-surface-50 dark:bg-surface-800"
           (scroll)="onMessagesScroll($event)">
        <div *ngIf="hasMoreOlder && !loadingOlder" class="flex justify-center py-1">
          <button type="button" (click)="loadOlderMessages()"
                  class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline">Load older</button>
        </div>
        <div *ngIf="loadingOlder" class="text-center py-1 text-[10px] text-surface-500">Loading...</div>
        <p *ngIf="!loading && messages.length === 0" class="text-xs text-surface-500 text-center py-6">No messages yet.</p>
        <p *ngIf="loading && messages.length === 0" class="text-xs text-surface-500 text-center py-6">Loading...</p>

        <ng-container *ngFor="let m of messages; let i = index">
          <div *ngIf="shouldShowDateSeparator(i)" class="flex items-center gap-2 my-2">
            <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700"></div>
            <span class="text-[9px] tracking-[0.15em] font-semibold text-surface-500 dark:text-surface-400 uppercase">{{ getDateLabel(m.sentTime) }}</span>
            <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700"></div>
          </div>

          <!-- System message -->
          <div *ngIf="!m.isDeleted && isSystemMessage(m.messageContent)" class="flex justify-center px-2">
            <div class="px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-[10px] text-surface-600 dark:text-surface-400 italic text-center">
              {{ stripSystemPrefix(m.messageContent) }}
            </div>
          </div>

          <!-- Regular message -->
          <div *ngIf="!m.isDeleted && !isSystemMessage(m.messageContent)"
               [class.justify-end]="m.senderUserId === currentUserId"
               [class.justify-start]="m.senderUserId !== currentUserId"
               class="flex items-end gap-1.5">
            <div [class.items-end]="m.senderUserId === currentUserId"
                 [class.items-start]="m.senderUserId !== currentUserId"
                 class="flex flex-col max-w-[78%] min-w-0">
              <div [class.text-white]="m.senderUserId === currentUserId"
                   [class.rounded-br-md]="m.senderUserId === currentUserId"
                   [class.rounded-bl-md]="m.senderUserId !== currentUserId"
                   [class.bg-surface-0]="m.senderUserId !== currentUserId"
                   [class.dark:!bg-surface-900]="m.senderUserId !== currentUserId"
                   [class.text-surface-900]="m.senderUserId !== currentUserId"
                   [class.dark:!text-surface-0]="m.senderUserId !== currentUserId"
                   [class.shadow-sm]="m.senderUserId !== currentUserId"
                   [style.background]="bubbleBackground(m)"
                   class="px-3 py-1.5 rounded-2xl break-words text-[13px] leading-snug">
                <span *ngIf="kind === 'group' && m.senderUserId !== currentUserId" class="block text-[10px] font-semibold text-emerald-600 dark:text-emerald-300 mb-0.5">{{ getRankAndName(m.senderUserId) }}</span>
                <p *ngIf="m.messageContent" class="break-words whitespace-pre-wrap">{{ m.messageContent }}</p>
                <ng-container *ngIf="parseAttachments(m.attachments) as atts">
                  <div *ngIf="atts.length > 0" class="flex flex-col gap-1.5" [class.mt-1.5]="m.messageContent">
                    <ng-container *ngFor="let a of atts">
                      <a *ngIf="isImageAttachment(a); else fileChip"
                         [href]="getAttachmentImageUrl(a)" target="_blank" rel="noopener"
                         class="block max-w-[220px] rounded-lg overflow-hidden ring-1 ring-black/10">
                        <img *ngIf="getAttachmentImageUrl(a) as src" [src]="src" [alt]="a.fileName"
                             class="block w-full h-auto max-h-[200px] object-cover" />
                      </a>
                      <ng-template #fileChip>
                        <button type="button" (click)="downloadAttachment(a, $event)"
                                class="flex items-center gap-2 px-2 py-1.5 rounded-lg ring-1 text-left max-w-[220px] text-[12px]"
                                [class.bg-white\/15]="m.senderUserId === currentUserId"
                                [class.ring-white\/25]="m.senderUserId === currentUserId"
                                [class.bg-surface-100]="m.senderUserId !== currentUserId"
                                [class.dark:!bg-surface-700]="m.senderUserId !== currentUserId"
                                [class.ring-surface-200]="m.senderUserId !== currentUserId"
                                [class.dark:!ring-surface-600]="m.senderUserId !== currentUserId">
                          <i class="pi pi-file text-sm shrink-0"
                             [class.text-white]="m.senderUserId === currentUserId"></i>
                          <span class="flex-1 min-w-0 truncate">{{ a.fileName }}</span>
                          <i class="pi pi-download text-[10px] shrink-0 opacity-80"></i>
                        </button>
                      </ng-template>
                    </ng-container>
                  </div>
                </ng-container>
              </div>
              <span class="text-[9px] text-surface-500 dark:text-surface-400 mt-0.5 px-1">{{ m.sentTime | date:'shortTime' }}</span>
            </div>
          </div>

          <div *ngIf="m.isDeleted" class="text-center py-0.5">
            <p class="text-[10px] text-surface-500 dark:text-surface-400 italic">Message deleted</p>
          </div>
        </ng-container>
      </div>

      <!-- Pending attachments preview -->
      <div *ngIf="pendingAttachments.length > 0" class="px-3 pt-2 flex flex-wrap gap-1 shrink-0">
        <div *ngFor="let p of pendingAttachments; let i = index"
             class="flex items-center gap-1 bg-surface-100 dark:bg-surface-700 rounded-full pr-2 pl-1 py-0.5 max-w-[160px]">
          <img *ngIf="p.previewUrl" [src]="p.previewUrl" class="w-5 h-5 rounded-full object-cover" />
          <i *ngIf="!p.previewUrl" class="pi pi-file text-[10px] text-indigo-500 ml-1"></i>
          <span class="text-[10px] truncate">{{ p.file.name }}</span>
          <button type="button" (click)="removePendingAttachment(i)"
                  class="w-4 h-4 rounded-full bg-surface-200 dark:bg-surface-600 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition">
            <i class="pi pi-times text-[8px]"></i>
          </button>
        </div>
      </div>

      <!-- Input -->
      <div class="flex items-center gap-1 px-2 py-2 border-t border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 shrink-0">
        <input #fileInput type="file" multiple class="hidden" (change)="onAttachmentsPicked($event)" />
        <button type="button" (click)="fileInput.click()"
                class="w-8 h-8 rounded-full flex items-center justify-center text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition shrink-0"
                title="Attach">
          <i class="pi pi-paperclip text-xs"></i>
        </button>
        <input type="text"
               [(ngModel)]="draft"
               (keyup.enter)="send()"
               [disabled]="sending"
               placeholder="Aa"
               class="flex-1 px-3 py-1.5 border border-surface-200 dark:border-surface-600 rounded-full bg-surface-50 dark:bg-surface-800 text-[13px] text-surface-900 dark:text-surface-0 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 disabled:opacity-60">
        <button type="button" (click)="send()"
                [disabled]="sending || (!draft.trim() && pendingAttachments.length === 0)"
                class="w-8 h-8 rounded-full text-white shadow flex items-center justify-center shrink-0 disabled:opacity-40 transition"
                [style.background]="kind === 'group' ? 'linear-gradient(135deg, #059669 0%, #34d399 100%)' : 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)'"
                title="Send">
          <i class="pi text-xs" [class.pi-send]="!sending" [class.pi-spin]="sending" [class.pi-spinner]="sending"></i>
        </button>
      </div>
    </div>
  `
})
export class ChatWindowComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input({ required: true }) kind!: 'direct' | 'group';
  /** userId for direct, groupId for group */
  @Input({ required: true }) targetId!: string | number;
  @Input() minimized = false;
  /** Optional group metadata so the header can show name + image without an extra fetch. */
  @Input() group: GroupDto | null = null;
  /** Optional pre-resolved display name; otherwise resolved via mapping/serving-members. */
  @Input() initialTitle = '';
  @Input() unreadCount = 0;

  @Output() closeRequested = new EventEmitter<void>();
  @Output() minimizeRequested = new EventEmitter<void>();
  @Output() restoreRequested = new EventEmitter<void>();

  @ViewChild('messagesContainer', { static: false }) messagesContainer?: ElementRef<HTMLDivElement>;

  messages: NormalisedMessage[] = [];
  loading = false;
  loadingOlder = false;
  hasMoreOlder = false;
  page = 1;
  readonly PAGE_SIZE = 50;

  draft = '';
  sending = false;
  pendingAttachments: Array<{ file: File; previewUrl: string | null }> = [];

  currentUserId = '';
  isConnected = false;

  /** Cached employee profile per userId (for group sender labels + direct title). */
  private userProfiles: Record<string, UserProfileLite> = {};
  private profileFetchInflight: Record<string, boolean> = {};
  /** Cached attachment blob URLs keyed by fileId. */
  private attachmentBlobUrls: Record<number, string> = {};
  private attachmentFetchInflight: Record<number, boolean> = {};
  /** Group avatar blob URL (only used when kind === 'group'). */
  private groupAvatarUrl: string | null = null;
  private groupAvatarFetched = false;
  /** Online userIds set (subscribed once, mirrors chat service). */
  private onlineUserIds = new Set<string>();

  private shouldScrollBottom = false;
  private destroy$ = new Subject<void>();

  constructor(
    private chatService: ChatService,
    private mappingService: IdentityUserMappingService,
    private servingMembersService: ServingMembersService,
    private empService: EmpService,
    private cdr: ChangeDetectorRef
  ) {}

  get title(): string {
    if (this.kind === 'group') return this.group?.groupName ?? this.initialTitle ?? 'Group';
    return this.getRankAndName(this.targetId as string) || this.initialTitle || (this.targetId as string);
  }

  get subtitle(): string {
    if (this.kind === 'group') return `${this.group?.memberCount ?? 0} members`;
    return this.isDirectOnline() ? 'Active now' : 'Offline';
  }

  ngOnInit(): void {
    try {
      const auth = JSON.parse(sessionStorage.getItem('auth') ?? localStorage.getItem('auth') ?? '{}');
      this.currentUserId = auth?.userId ?? '';
    } catch { /* ignore */ }

    this.chatService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(s => { this.isConnected = s; });

    this.chatService.onlineUserIds$
      .pipe(takeUntil(this.destroy$))
      .subscribe(ids => { this.onlineUserIds = ids; });

    if (this.kind === 'direct') {
      this.ensureUserProfile(this.targetId as string);
      this.loadDirectMessages();

      this.chatService.directMessageReceived$
        .pipe(takeUntil(this.destroy$))
        .subscribe((payload: any) => {
          if (!payload) return;
          const other = payload.senderUserId === this.currentUserId ? payload.receiverUserId : payload.senderUserId;
          if (other !== this.targetId) return;
          if (this.messages.some(m => m.messageId === payload.messageId)) return;
          this.messages.push({
            messageId: payload.messageId,
            senderUserId: payload.senderUserId,
            receiverUserId: payload.receiverUserId,
            messageContent: payload.messageContent,
            attachments: payload.attachments ?? null,
            sentTime: payload.sentTime ? new Date(payload.sentTime) : new Date(),
            isSeen: payload.isSeen ?? false,
            isDeleted: false
          });
          this.shouldScrollBottom = true;
          if (payload.receiverUserId === this.currentUserId && !this.minimized)
            this.chatService.markDirectMessagesAsSeen(payload.senderUserId).catch(() => {});
        });

      this.chatService.directMessageDeleted$
        .pipe(takeUntil(this.destroy$))
        .subscribe((payload: { messageId?: number }) => {
          const msg = this.messages.find(m => m.messageId === payload?.messageId);
          if (msg) msg.isDeleted = true;
        });

      this.chatService.directMessagesSeen$
        .pipe(takeUntil(this.destroy$))
        .subscribe((payload: { messageIds?: number[] }) => {
          const ids = payload?.messageIds ?? [];
          this.messages.forEach(m => { if (ids.includes(m.messageId)) m.isSeen = true; });
        });
    } else {
      this.chatService.joinGroupHub(this.targetId as number).catch(() => {});
      this.loadGroupMessages();
      this.loadGroupAvatar();

      this.chatService.groupMessageReceived$
        .pipe(takeUntil(this.destroy$))
        .subscribe((payload: any) => {
          if (!payload || payload.groupId !== this.targetId) return;
          if (this.messages.some(m => m.messageId === payload.messageId)) return;
          this.messages.push({
            messageId: payload.messageId,
            senderUserId: payload.senderUserId,
            messageContent: payload.messageContent,
            attachments: payload.attachments ?? null,
            sentTime: payload.sentTime ? new Date(payload.sentTime) : new Date(),
            isDeleted: false
          });
          if (payload.senderUserId) this.ensureUserProfile(payload.senderUserId);
          this.shouldScrollBottom = true;
          if (!this.minimized && payload.senderUserId !== this.currentUserId)
            this.chatService.markGroupMessagesAsSeen(this.targetId as number, [payload.messageId]).catch(() => {});
        });

      this.chatService.groupMessageDeleted$
        .pipe(takeUntil(this.destroy$))
        .subscribe((payload: { messageId?: number; groupId?: number }) => {
          if (payload?.groupId !== this.targetId) return;
          const msg = this.messages.find(m => m.messageId === payload?.messageId);
          if (msg) msg.isDeleted = true;
        });

      this.chatService.groupImageChanged$
        .pipe(takeUntil(this.destroy$))
        .subscribe((payload: { groupId: number; groupImageFileId: number | null }) => {
          if (payload?.groupId !== this.targetId) return;
          if (this.group) this.group.groupImageFileId = payload.groupImageFileId ?? null;
          this.groupAvatarFetched = false;
          if (this.groupAvatarUrl) { URL.revokeObjectURL(this.groupAvatarUrl); this.groupAvatarUrl = null; }
          this.loadGroupAvatar();
        });

      this.chatService.groupRenamed$
        .pipe(takeUntil(this.destroy$))
        .subscribe((payload: { groupId: number; groupName: string }) => {
          if (payload?.groupId !== this.targetId) return;
          if (this.group) this.group.groupName = payload.groupName;
        });
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.shouldScrollBottom = false;
      setTimeout(() => this.scrollToBottom(), 0);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    for (const id of Object.keys(this.attachmentBlobUrls)) {
      const url = this.attachmentBlobUrls[+id];
      if (url) URL.revokeObjectURL(url);
    }
    for (const p of this.pendingAttachments) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    if (this.groupAvatarUrl) URL.revokeObjectURL(this.groupAvatarUrl);
    for (const userId of Object.keys(this.userProfiles)) {
      const url = this.userProfiles[userId]?.profileImageUrl;
      if (url) URL.revokeObjectURL(url);
    }
  }

  // ---- Loading ----

  private loadDirectMessages(): void {
    this.loading = true;
    this.page = 1;
    this.chatService.getDirectMessages(this.targetId as string, 1, this.PAGE_SIZE)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          this.messages = (list ?? []).map(this.normalizeDirect.bind(this));
          this.hasMoreOlder = this.messages.length >= this.PAGE_SIZE;
          this.shouldScrollBottom = true;
          this.loading = false;
          if (this.isConnected && !this.minimized)
            this.chatService.markDirectMessagesAsSeen(this.targetId as string).catch(() => {});
        },
        error: () => { this.loading = false; }
      });
  }

  private loadGroupMessages(): void {
    this.loading = true;
    this.page = 1;
    this.chatService.getGroupMessages(this.targetId as number, 1, this.PAGE_SIZE)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          this.messages = (list ?? []).map(this.normalizeGroup.bind(this));
          this.hasMoreOlder = this.messages.length >= this.PAGE_SIZE;
          this.shouldScrollBottom = true;
          this.loading = false;
          for (const m of this.messages) if (m.senderUserId) this.ensureUserProfile(m.senderUserId);
          if (this.isConnected && this.messages.length > 0 && !this.minimized) {
            const ids = this.messages.map(m => m.messageId);
            this.chatService.markGroupMessagesAsSeen(this.targetId as number, ids).catch(() => {});
          }
        },
        error: () => { this.loading = false; }
      });
  }

  loadOlderMessages(): void {
    if (this.loadingOlder || !this.hasMoreOlder) return;
    this.loadingOlder = true;
    const next = this.page + 1;
    const container = this.messagesContainer?.nativeElement;
    const oldHeight = container?.scrollHeight ?? 0;
    const oldTop = container?.scrollTop ?? 0;
    const obs: Observable<any[]> = this.kind === 'direct'
      ? this.chatService.getDirectMessages(this.targetId as string, next, this.PAGE_SIZE)
      : this.chatService.getGroupMessages(this.targetId as number, next, this.PAGE_SIZE);
    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: (list: any[]) => {
        const older = (list ?? []).map(m => this.kind === 'direct' ? this.normalizeDirect(m) : this.normalizeGroup(m));
        this.messages = [...older, ...this.messages];
        this.page = next;
        this.hasMoreOlder = older.length >= this.PAGE_SIZE;
        this.loadingOlder = false;
        if (this.kind === 'group') for (const m of older) if (m.senderUserId) this.ensureUserProfile(m.senderUserId);
        if (container && older.length > 0) {
          setTimeout(() => {
            const newHeight = container.scrollHeight;
            container.scrollTop = newHeight - oldHeight + oldTop;
          }, 0);
        }
      },
      error: () => { this.loadingOlder = false; }
    });
  }

  onMessagesScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollTop < 60 && this.hasMoreOlder && !this.loadingOlder) this.loadOlderMessages();
  }

  // ---- Sending ----

  send(): void {
    const text = this.draft.trim();
    const hasAttachments = this.pendingAttachments.length > 0;
    if (this.sending || (!text && !hasAttachments)) return;
    this.sending = true;
    const doSend = (attachmentsJson: string | null) => {
      const promise = this.kind === 'direct'
        ? this.chatService.sendDirectMessage(this.targetId as string, text, this.currentUserId, attachmentsJson)
        : this.chatService.sendGroupMessage(this.targetId as number, text, this.currentUserId, attachmentsJson);
      promise.then(() => {
        this.draft = '';
        for (const p of this.pendingAttachments) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        this.pendingAttachments = [];
        this.sending = false;
      }).catch(() => { this.sending = false; });
    };
    if (!hasAttachments) { doSend(null); return; }
    const uploads = this.pendingAttachments.map(p =>
      this.empService.uploadEmployeeFile(p.file, p.file.name).pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
    );
    forkJoin(uploads).subscribe((results) => {
      const ok: ChatAttachment[] = [];
      results.forEach((r: any, i: number) => {
        if (!r?.fileId) return;
        const f = this.pendingAttachments[i].file;
        ok.push({ fileId: r.fileId, fileName: r.fileName ?? f.name, contentType: f.type || undefined, size: f.size });
      });
      if (ok.length === 0 && !text) { this.sending = false; return; }
      doSend(ok.length > 0 ? JSON.stringify(ok) : null);
    });
  }

  onAttachmentsPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i);
      if (!f) continue;
      const isImage = f.type.startsWith('image/');
      this.pendingAttachments.push({ file: f, previewUrl: isImage ? URL.createObjectURL(f) : null });
    }
    input.value = '';
  }

  removePendingAttachment(i: number): void {
    const p = this.pendingAttachments[i];
    if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
    this.pendingAttachments.splice(i, 1);
  }

  // ---- Header / window controls ----

  onClose(): void { this.closeRequested.emit(); }
  onMinimize(): void { this.minimizeRequested.emit(); }
  onRestore(): void { this.restoreRequested.emit(); }

  // ---- Display helpers ----

  isDirectOnline(): boolean {
    if (this.kind !== 'direct') return false;
    return this.onlineUserIds.has(this.targetId as string);
  }

  groupHasImage(): boolean {
    return this.kind === 'group' && !!this.groupAvatarUrl;
  }

  avatarUrl(): string | null {
    if (this.kind === 'direct') return this.userProfiles[this.targetId as string]?.profileImageUrl ?? null;
    return this.groupAvatarUrl;
  }

  headInitial(): string {
    if (this.kind === 'group') return (this.group?.groupName ?? 'G').trim().charAt(0).toUpperCase() || 'G';
    const profile = this.userProfiles[this.targetId as string];
    const fullName = (profile?.fullName ?? '').trim();
    if (fullName) {
      const parts = fullName.split(/\s+/);
      return (parts[parts.length - 1] ?? '').charAt(0).toUpperCase() || '?';
    }
    return (this.initialTitle || (this.targetId as string)).charAt(0).toUpperCase() || '?';
  }

  bubbleBackground(m: NormalisedMessage): string | null {
    if (m.senderUserId !== this.currentUserId) return null;
    return this.kind === 'group'
      ? 'linear-gradient(135deg, #059669 0%, #34d399 100%)'
      : 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)';
  }

  getRankAndName(userId: string): string {
    const p = this.userProfiles[userId];
    if (p) {
      const c = `${p.rank ?? ''} ${p.fullName ?? ''}`.trim();
      if (c) return c;
    }
    return this.initialTitle || userId;
  }

  isSystemMessage(content: string | null | undefined): boolean {
    return typeof content === 'string' && content.startsWith('__SYSTEM__:');
  }

  stripSystemPrefix(content: string | null | undefined): string {
    return (content ?? '').replace(/^__SYSTEM__:/, '');
  }

  shouldShowDateSeparator(index: number): boolean {
    if (index < 0 || index >= this.messages.length) return false;
    if (index === 0) return true;
    const a = new Date(this.messages[index].sentTime);
    const b = new Date(this.messages[index - 1].sentTime);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
    return a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate();
  }

  getDateLabel(d: Date): string {
    const now = new Date();
    const isSameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (isSameDay) return 'Today';
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate();
    if (isYesterday) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // ---- Attachment helpers ----

  private attachmentParseCache = new Map<string, ChatAttachment[]>();

  parseAttachments(json: string | null | undefined): ChatAttachment[] {
    if (!json) return [];
    const cached = this.attachmentParseCache.get(json);
    if (cached) return cached;
    let result: ChatAttachment[] = [];
    try {
      const arr = JSON.parse(json) as any[];
      if (Array.isArray(arr)) {
        result = arr.map((a: any) => ({
          fileId: (a.FileId ?? a.fileId ?? 0) as number,
          fileName: (a.FileName ?? a.fileName ?? '') as string,
          contentType: a.ContentType ?? a.contentType,
          size: a.Size ?? a.size
        })).filter((a: ChatAttachment) => a.fileId > 0);
      }
    } catch { /* ignore */ }
    this.attachmentParseCache.set(json, result);
    return result;
  }

  isImageAttachment(a: ChatAttachment): boolean {
    const ct = (a.contentType ?? '').toLowerCase();
    if (ct.startsWith('image/')) return true;
    const name = (a.fileName ?? '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
  }

  getAttachmentImageUrl(a: ChatAttachment): string | null {
    if (!a?.fileId) return null;
    const cached = this.attachmentBlobUrls[a.fileId];
    if (cached) return cached;
    if (this.attachmentFetchInflight[a.fileId]) return null;
    this.attachmentFetchInflight[a.fileId] = true;
    this.empService.downloadFile(a.fileId).pipe(
      catchError(() => of(null)),
      takeUntil(this.destroy$)
    ).subscribe((blob) => {
      this.attachmentFetchInflight[a.fileId] = false;
      if (!blob || (blob as Blob).size === 0) return;
      this.attachmentBlobUrls[a.fileId] = URL.createObjectURL(blob as Blob);
      this.cdr.markForCheck();
    });
    return null;
  }

  downloadAttachment(a: ChatAttachment, event?: Event): void {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    if (!a?.fileId) return;
    const cached = this.attachmentBlobUrls[a.fileId];
    if (cached) { this.triggerDownload(cached, a.fileName); return; }
    this.empService.downloadFile(a.fileId).subscribe(blob => {
      if (!blob || (blob as Blob).size === 0) return;
      const url = URL.createObjectURL(blob as Blob);
      this.attachmentBlobUrls[a.fileId] = url;
      this.triggerDownload(url, a.fileName);
    });
  }

  private triggerDownload(url: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'attachment';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 100);
  }

  // ---- Profile resolution ----

  private ensureUserProfile(userId: string): void {
    if (!userId || this.userProfiles[userId] || this.profileFetchInflight[userId]) return;
    this.profileFetchInflight[userId] = true;
    this.mappingService.getEmployeeIdForUser(userId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (empId) => {
        if (!empId) { this.profileFetchInflight[userId] = false; return; }
        this.servingMembersService.getEmployeePersonalServiceOverview(empId).pipe(
          catchError(() => of(null)),
          takeUntil(this.destroy$)
        ).subscribe(profile => {
          this.profileFetchInflight[userId] = false;
          if (!profile) return;
          const rank = (profile.armyRank ?? '').toString().trim();
          const fullName = (profile.nameEnglish ?? '').toString().trim();
          this.userProfiles[userId] = { rank, fullName, profileImageUrl: null };
          this.loadUserProfileImage(userId, profile.profileImages ?? null);
          this.cdr.markForCheck();
        });
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

  private loadGroupAvatar(): void {
    if (this.kind !== 'group' || this.groupAvatarFetched) return;
    const fid = this.group?.groupImageFileId;
    if (!fid) return;
    this.groupAvatarFetched = true;
    this.empService.downloadFile(fid as number).pipe(
      catchError(() => of(null)),
      takeUntil(this.destroy$)
    ).subscribe((blob) => {
      if (!blob || (blob as Blob).size === 0) return;
      if (this.groupAvatarUrl) URL.revokeObjectURL(this.groupAvatarUrl);
      this.groupAvatarUrl = URL.createObjectURL(blob as Blob);
      this.cdr.markForCheck();
    });
  }

  // ---- Normalisation ----

  private normalizeDirect(m: DirectMessageDto | any): NormalisedMessage {
    return {
      messageId: m.messageId ?? m.MessageId,
      senderUserId: m.senderUserId ?? m.SenderUserId ?? '',
      receiverUserId: m.receiverUserId ?? m.ReceiverUserId,
      messageContent: m.messageContent ?? m.MessageContent ?? '',
      attachments: m.attachments ?? m.Attachments ?? null,
      sentTime: m.sentTime ? new Date(m.sentTime) : (m.SentTime ? new Date(m.SentTime) : new Date()),
      isSeen: m.isSeen ?? m.IsSeen ?? false,
      isDeleted: m.isDeleted ?? m.IsDeleted ?? false
    };
  }

  private normalizeGroup(m: GroupMessageDto | any): NormalisedMessage {
    return {
      messageId: m.messageId ?? m.MessageId,
      senderUserId: m.senderUserId ?? m.SenderUserId ?? '',
      messageContent: m.messageContent ?? m.MessageContent ?? '',
      attachments: m.attachments ?? m.Attachments ?? null,
      sentTime: m.sentTime ? new Date(m.sentTime) : (m.SentTime ? new Date(m.SentTime) : new Date()),
      isDeleted: m.isDeleted ?? m.IsDeleted ?? false
    };
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer)
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
    } catch { /* ignore */ }
  }
}
