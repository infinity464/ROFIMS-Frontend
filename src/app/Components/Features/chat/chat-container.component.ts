import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ChatService } from '@/services/chat.service';
import { ChatUserDto, DirectConversation, DirectMessageDto } from '@/models/chat.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-chat-container',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="chat-container flex h-[calc(100vh-80px)] bg-surface-0 dark:bg-surface-900">
      <!-- Sidebar - Conversations List -->
      <div class="w-80 border-r border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 flex flex-col">
        <!-- Header -->
        <div class="p-4 border-b border-surface-200 dark:border-surface-700">
          <h2 class="text-xl font-bold text-surface-900 dark:text-surface-0">Messages</h2>
          <button
            (click)="onSelectUserChat()"
            class="w-full mt-3 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-500 transition font-medium">
            Chat with user
          </button>
        </div>

        <!-- Search -->
        <div class="p-3 border-b border-surface-200 dark:border-surface-700">
          <input
            type="text"
            placeholder="Search conversations..."
            [(ngModel)]="searchText"
            (ngModelChange)="filterDirectConversations()"
            class="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg bg-surface-0 dark:bg-surface-800 text-surface-900 dark:text-surface-0 placeholder:text-surface-500 dark:placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400">
        </div>

        <!-- Conversations List (direct 1:1) -->
        <div class="flex-1 overflow-y-auto">
          <div *ngIf="filteredDirectConversations.length === 0" class="p-4 text-center text-surface-500 dark:text-surface-400">
            No conversations
          </div>

          <div *ngFor="let conv of filteredDirectConversations"
               (click)="selectConversation(conv)"
               [class.bg-blue-50]="selectedOtherUserId === conv.otherUserId"
               [class.dark:!bg-surface-700]="selectedOtherUserId === conv.otherUserId"
               class="p-4 border-b border-surface-200 dark:border-surface-700 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 transition">
            <div class="flex justify-between items-start">
              <h3 class="font-semibold text-surface-900 dark:text-surface-0 flex-1">{{ getDisplayName(conv.otherUserId) }}</h3>
              <span *ngIf="conv.unreadCount > 0" class="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {{ conv.unreadCount }}
              </span>
            </div>
            <p class="text-sm text-surface-600 dark:text-surface-300 truncate mt-1">{{ conv.lastMessage || 'No messages yet' }}</p>
            <p class="text-xs text-surface-500 dark:text-surface-400 mt-1">{{ getConversationDate(conv.lastMessageDate) }}</p>
          </div>
        </div>

        <!-- Connection Status -->
        <div class="p-3 border-t border-surface-200 dark:border-surface-700 text-xs text-center text-surface-700 dark:text-surface-300"
             [class.text-green-600]="isConnected"
             [class.dark:!text-green-400]="isConnected"
             [class.text-red-600]="!isConnected"
             [class.dark:!text-red-400]="!isConnected">
          {{ isConnected ? '✓ Connected' : '✗ Disconnected' }}
        </div>
      </div>

      <!-- Chat Area -->
      <div class="flex-1 flex flex-col bg-surface-0 dark:bg-surface-900">
        <ng-container *ngIf="selectedOtherUserId; else noSelection">
          <!-- Chat Header -->
          <div class="px-5 py-4 border-b border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 shadow-sm">
            <div class="flex justify-between items-center">
              <div>
                <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-0">{{ getDisplayName(selectedOtherUserId) }}</h2>
                <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Direct message</p>
              </div>
            </div>
          </div>

          <!-- Messages Area -->
          <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col messages-area messages-area-dark" #messagesContainer
               (scroll)="onMessagesScroll($event)">
            <div *ngIf="hasMoreOlder && !loadingOlder" class="flex justify-center py-3">
              <button type="button" (click)="loadOlderMessages()"
                      class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-3 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-surface-800 transition">
                Load older messages
              </button>
            </div>
            <div *ngIf="loadingOlder" class="text-center py-3 text-surface-500 dark:text-surface-400 text-sm">Loading...</div>
            <p *ngIf="!messagesLoading && messages.length === 0" class="text-sm text-surface-500 dark:text-surface-400 text-center py-8">No messages yet. Start the conversation.</p>
            <p *ngIf="messagesLoading && messages.length === 0" class="text-sm text-surface-500 dark:text-surface-400 text-center py-8">Loading...</p>
            <ng-container *ngFor="let message of messages">
              <div *ngIf="!message.isDeleted"
                   [class.justify-end]="message.senderUserId === currentUserId"
                   [class.justify-start]="message.senderUserId !== currentUserId"
                   class="flex mb-3 items-end gap-1.5">
                <!-- Receiver: small simple circle icon (user id) -->
                <div *ngIf="message.senderUserId !== currentUserId"
                     class="w-4 h-4 rounded-full bg-surface-300 dark:bg-surface-500 flex-shrink-0 flex items-center justify-center"
                     title="{{ message.senderUserId }}">
                  <span class="text-[7px] font-medium text-surface-600 dark:text-surface-200 leading-none">{{ getShortUserId(message.senderUserId) }}</span>
                </div>
                <div [class.items-end]="message.senderUserId === currentUserId"
                     [class.items-start]="message.senderUserId !== currentUserId"
                     class="flex flex-col max-w-[75%] min-w-0"
                     [class.max-w-[320px]]="message.senderUserId !== currentUserId">
                  <div
                    [class.bg-indigo-600]="message.senderUserId === currentUserId"
                    [class.text-white]="message.senderUserId === currentUserId"
                    [class.rounded-br-md]="message.senderUserId === currentUserId"
                    [class.rounded-bl-md]="message.senderUserId !== currentUserId"
                    [class.bg-white]="message.senderUserId !== currentUserId"
                    [class.dark:!bg-surface-800]="message.senderUserId !== currentUserId"
                    [class.text-surface-900]="message.senderUserId !== currentUserId"
                    [class.dark:!text-surface-0]="message.senderUserId !== currentUserId"
                    [class.border]="message.senderUserId !== currentUserId"
                    [class.border-surface-200]="message.senderUserId !== currentUserId"
                    [class.dark:!border-surface-600]="message.senderUserId !== currentUserId"
                    [class.shadow-sm]="message.senderUserId !== currentUserId"
                    class="px-4 py-2.5 rounded-2xl break-words shadow-md dark:shadow-none">
                    <span *ngIf="message.senderUserId !== currentUserId && message.senderName" class="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">{{ message.senderName }}</span>
                    <p class="text-[15px] leading-snug break-words max-w-full">{{ message.messageContent }}</p>
                  </div>
                  <div class="flex items-center gap-2 mt-1 px-1 flex-wrap"
                       [class.flex-row-reverse]="message.senderUserId === currentUserId">
                    <span class="text-[11px] text-surface-500 dark:text-surface-400">{{ message.sentTime | date:'shortTime' }}</span>
                    <span *ngIf="message.senderUserId === currentUserId" class="text-[11px]"
                          [class.text-indigo-500]="message.isSeen"
                          [class.dark:!text-indigo-400]="message.isSeen"
                          [class.text-surface-500]="!message.isSeen"
                          [class.dark:!text-surface-400]="!message.isSeen">
                      {{ message.isSeen ? 'Seen' : 'Unseen' }}
                    </span>
                    <button *ngIf="message.senderUserId === currentUserId && !message.isSeen"
                            type="button"
                            (click)="deleteMessage(message.messageId)"
                            class="text-[11px] text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div *ngIf="message.isDeleted" class="flex justify-center py-1 mb-2">
                <p class="text-xs text-surface-500 dark:text-surface-400 italic">Message deleted</p>
              </div>
            </ng-container>
          </div>

          <!-- Message Input -->
          <div class="p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900">
            <form [formGroup]="messageForm" (ngSubmit)="sendMessage()" class="flex gap-3">
              <input
                type="text"
                formControlName="messageContent"
                placeholder="Type a message..."
                (keyup.enter)="sendMessage()"
                [disabled]="!isConnected || isSending"
                class="flex-1 px-4 py-2.5 border border-surface-200 dark:border-surface-600 rounded-xl bg-surface-0 dark:bg-surface-800 text-surface-900 dark:text-surface-0 placeholder:text-surface-500 dark:placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed">
              <button
                type="submit"
                [disabled]="!isConnected || isSending || !messageForm.valid"
                class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:bg-surface-300 dark:disabled:bg-surface-600 disabled:cursor-not-allowed transition font-medium">
                {{ isSending ? 'Sending...' : 'Send' }}
              </button>
            </form>
          </div>
        </ng-container>

        <!-- No Selection State -->
        <ng-template #noSelection>
          <div class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <p class="text-surface-500 dark:text-surface-400 text-lg">Select a conversation to start chatting</p>
            </div>
          </div>
        </ng-template>
      </div>

      <!-- Select User to Chat Modal -->
      <div *ngIf="showSelectUserModal" class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
        <div class="bg-surface-0 dark:bg-surface-900 rounded-lg shadow-xl border border-surface-200 dark:border-surface-700 p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
          <h3 class="text-lg font-bold text-surface-900 dark:text-surface-0 mb-4">Chat with a user</h3>
          <p class="text-sm text-surface-500 dark:text-surface-400 mb-3">Select a user to start a private conversation.</p>
          <div *ngIf="loadingChatUsers" class="flex justify-center py-8">
            <span class="text-surface-500 dark:text-surface-400">Loading users...</span>
          </div>
          <div *ngIf="!loadingChatUsers && chatUsers.length === 0" class="py-6 text-center text-surface-500 dark:text-surface-400">
            No other users found.
          </div>
          <div *ngIf="!loadingChatUsers && chatUsers.length > 0" class="flex-1 overflow-y-auto space-y-1">
            <button
              *ngFor="let user of chatUsers"
              (click)="startChatWithUser(user)"
              type="button"
              class="w-full text-left px-4 py-3 rounded-lg border border-surface-200 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition">
              <span class="font-medium text-surface-900 dark:text-surface-0">{{ user.userName || user.email }}</span>
              <span *ngIf="user.email && user.userName" class="text-surface-500 dark:text-surface-400 text-sm block">{{ user.email }}</span>
            </button>
          </div>
          <div class="mt-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            <button
              type="button"
              (click)="closeSelectUserModal()"
              class="w-full px-4 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chat-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
    .messages-area {
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    }
    :host-context(.app-dark) .messages-area {
      background: linear-gradient(180deg, var(--p-surface-900, #0f172a) 0%, var(--p-surface-800, #1e293b) 100%);
    }
  `]
})
export class ChatContainerComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer', { static: false }) messagesContainer?: ElementRef<HTMLDivElement>;

  directConversations: DirectConversation[] = [];
  filteredDirectConversations: DirectConversation[] = [];
  selectedOtherUserId: string | null = null;
  /** Display list of messages. */
  messages: Array<{ messageId: number; senderUserId: string; senderName?: string; receiverUserId?: string; messageContent: string; sentTime: Date; isSeen: boolean; isDeleted: boolean }> = [];
  currentUserId: string = '';
  isConnected: boolean = false;
  isSending: boolean = false;
  searchText: string = '';
  messagesLoading = false;
  loadingOlder = false;
  messagesPageNumber = 1;
  hasMoreOlder = false;
  private readonly PAGE_SIZE = 50;
  /** userId -> display name for conversation list and header */
  private userDisplayNames: Record<string, string> = {};

  messageForm: FormGroup;
  showSelectUserModal: boolean = false;
  chatUsers: ChatUserDto[] = [];
  loadingChatUsers: boolean = false;
  private destroy$ = new Subject<void>();
  private shouldScroll = false;

  constructor(private chatService: ChatService, private fb: FormBuilder) {
    this.messageForm = this.fb.group({
      messageContent: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  getDisplayName(userId: string): string {
    return this.userDisplayNames[userId] || this.chatUsers.find(u => u.userId === userId)?.userName || this.chatUsers.find(u => u.userId === userId)?.email || userId;
  }

  /** One char for tiny receiver circle. */
  getShortUserId(userId: string): string {
    if (!userId) return '?';
    const first = userId.replace(/-/g, '').charAt(0).toUpperCase();
    return first || '?';
  }

  ngOnInit(): void {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    this.currentUserId = auth.userId || '';
    this.chatService.setSelectedConversation(null);

    this.chatService.connectToHub().then(() => {
      this.loadDirectConversations();
    }).catch(() => this.loadDirectConversations());

    this.chatService.getChatUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.chatUsers = users;
          users.forEach(u => {
            this.userDisplayNames[u.userId] = u.userName || u.email || u.userId;
          });
        }
      });

    this.chatService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.isConnected = status;
      });

    this.chatService.directMessageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: any) => {
        if (!payload) return;
        const other = payload.senderUserId === this.currentUserId ? payload.receiverUserId : payload.senderUserId;
        if (other === this.selectedOtherUserId && !this.messages.some(m => m.messageId === payload.messageId)) {
          this.messages.push({
            messageId: payload.messageId,
            senderUserId: payload.senderUserId,
            senderName: payload.senderName,
            messageContent: payload.messageContent,
            sentTime: payload.sentTime ? new Date(payload.sentTime) : new Date(),
            isSeen: payload.isSeen ?? false,
            isDeleted: false
          });
          this.shouldScroll = true;
          if (payload.receiverUserId === this.currentUserId)
            this.chatService.markDirectMessagesAsSeen(payload.senderUserId).catch(() => {});
        }
        this.loadDirectConversations();
      });

    this.chatService.directMessagesSeen$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { messageIds?: number[] }) => {
        const ids = payload?.messageIds ?? [];
        this.messages.forEach(m => {
          if (ids.includes(m.messageId)) m.isSeen = true;
        });
      });

    this.chatService.directMessageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { messageId?: number }) => {
        const msg = this.messages.find(m => m.messageId === payload?.messageId);
        if (msg) msg.isDeleted = true;
      });

    this.chatService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        console.error('Chat error:', error);
        if (error?.includes?.('Failed to connect')) {
          this.isConnected = false;
        }
      });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.shouldScroll = false;
      setTimeout(() => this.scrollToBottom(), 0);
    }
  }

  loadDirectConversations(): void {
    this.chatService.getDirectConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (conversations) => {
          this.directConversations = conversations;
          this.filterDirectConversations();
          const openUserId = this.chatService.getAndClearOpenConversationUserId();
          if (openUserId) {
            const conv = this.directConversations.find(c => c.otherUserId === openUserId);
            if (conv) this.selectConversation(conv);
            else {
              const newConv: DirectConversation = { otherUserId: openUserId, lastMessage: '', lastMessageDate: new Date(), unreadCount: 0 };
              this.directConversations = [newConv, ...this.directConversations];
              this.filterDirectConversations();
              this.selectConversation(newConv);
            }
          }
        },
        error: (err) => console.error('Error loading conversations:', err)
      });
  }

  selectConversation(conv: DirectConversation): void {
    this.selectedOtherUserId = conv.otherUserId;
    this.chatService.setSelectedConversation(conv.otherUserId);
    this.messages = [];
    this.messagesPageNumber = 1;
    this.hasMoreOlder = false;
    this.loadDirectMessages();
  }

  loadDirectMessages(): void {
    if (!this.selectedOtherUserId) return;
    this.messagesLoading = true;
    this.messagesPageNumber = 1;

    this.chatService.getDirectMessages(this.selectedOtherUserId, 1, this.PAGE_SIZE)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          const msgs = Array.isArray(list) ? list.map(m => this.normalizeDirectMessage(m)) : [];
          this.messages = msgs;
          this.hasMoreOlder = msgs.length >= this.PAGE_SIZE;
          this.shouldScroll = true;
          this.messagesLoading = false;
          this.markConversationAsSeen();
        },
        error: (err) => {
          console.error('Error loading messages:', err);
          this.messagesLoading = false;
        }
      });
  }

  private markConversationAsSeen(): void {
    if (this.selectedOtherUserId && this.isConnected)
      this.chatService.markDirectMessagesAsSeen(this.selectedOtherUserId).catch(() => {});
  }

  private normalizeDirectMessage(m: DirectMessageDto | any): typeof this.messages[0] {
    return {
      messageId: m.messageId ?? m.MessageId,
      senderUserId: m.senderUserId ?? m.SenderUserId ?? '',
      senderName: this.userDisplayNames[m.senderUserId ?? m.SenderUserId] ?? m.senderName ?? m.SenderName,
      messageContent: m.messageContent ?? m.MessageContent ?? '',
      sentTime: m.sentTime ? new Date(m.sentTime) : (m.SentTime ? new Date(m.SentTime) : new Date()),
      isSeen: m.isSeen ?? m.IsSeen ?? false,
      isDeleted: m.isDeleted ?? m.IsDeleted ?? false
    };
  }

  onMessagesScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollTop < 80 && this.hasMoreOlder && !this.loadingOlder) {
      this.loadOlderMessages();
    }
  }

  loadOlderMessages(): void {
    if (!this.selectedOtherUserId || this.loadingOlder || !this.hasMoreOlder) return;
    this.loadingOlder = true;
    const nextPage = this.messagesPageNumber + 1;
    const container = this.messagesContainer?.nativeElement as HTMLElement;
    const oldScrollHeight = container?.scrollHeight ?? 0;
    const oldScrollTop = container?.scrollTop ?? 0;

    this.chatService.getDirectMessages(this.selectedOtherUserId, nextPage, this.PAGE_SIZE)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          const older = Array.isArray(list) ? list.map(m => this.normalizeDirectMessage(m)) : [];
          this.messages = [...older, ...this.messages];
          this.messagesPageNumber = nextPage;
          this.hasMoreOlder = older.length >= this.PAGE_SIZE;
          this.loadingOlder = false;
          if (container && older.length > 0) {
            setTimeout(() => {
              const newScrollHeight = container.scrollHeight;
              container.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
            }, 0);
          }
        },
        error: (err) => {
          console.error('Error loading older messages:', err);
          this.loadingOlder = false;
        }
      });
  }

  getConversationDate(d: Date | string | undefined): string {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) return '—';
    return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  sendMessage(): void {
    if (!this.messageForm.valid || !this.selectedOtherUserId || this.isSending) return;

    this.isSending = true;
    const content = this.messageForm.get('messageContent')?.value;

    this.chatService.sendDirectMessage(this.selectedOtherUserId, content, this.currentUserId).then(() => {
      this.messageForm.reset();
      this.isSending = false;
      this.loadDirectConversations();
    }).catch(() => {
      this.isSending = false;
    });
  }

  deleteMessage(messageId: number): void {
    if (!confirm('Delete this message? It can only be deleted before the recipient sees it.')) return;
    this.chatService.deleteDirectMessage(messageId).then(() => {
      const m = this.messages.find(x => x.messageId === messageId);
      if (m) m.isDeleted = true;
    }).catch(() => {});
  }

  onSelectUserChat(): void {
    this.showSelectUserModal = true;
    this.loadingChatUsers = true;
    this.chatUsers = [];
    this.chatService.getChatUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.chatUsers = users;
          this.loadingChatUsers = false;
        },
        error: (err) => {
          console.error('Error loading chat users:', err);
          this.loadingChatUsers = false;
        }
      });
  }

  closeSelectUserModal(): void {
    this.showSelectUserModal = false;
  }

  startChatWithUser(user: ChatUserDto): void {
    this.userDisplayNames[user.userId] = user.userName || user.email || user.userId;
    this.closeSelectUserModal();
    const existing = this.directConversations.find(c => c.otherUserId === user.userId);
    if (existing) {
      this.selectConversation(existing);
      return;
    }
    const newConv: DirectConversation = {
      otherUserId: user.userId,
      lastMessage: '',
      lastMessageDate: new Date(),
      unreadCount: 0
    };
    this.directConversations = [newConv, ...this.directConversations];
    this.filterDirectConversations();
    this.selectConversation(newConv);
  }

  filterDirectConversations(): void {
    if (!this.searchText.trim()) {
      this.filteredDirectConversations = this.directConversations;
    } else {
      const search = this.searchText.toLowerCase();
      this.filteredDirectConversations = this.directConversations.filter(c => {
        const name = this.getDisplayName(c.otherUserId).toLowerCase();
        return name.includes(search) || (c.lastMessage?.toLowerCase().includes(search));
      });
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling:', err);
    }
  }

  ngOnDestroy(): void {
    this.chatService.setSelectedConversation(null);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
