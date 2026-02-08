import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ChatService } from '@/services/chat.service';
import { ChatUserDto, DirectConversation, DirectMessageDto, GroupDto, GroupMessageDto } from '@/models/chat.model';
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
          <div class="mt-3 flex gap-2">
            <button
              (click)="onSelectUserChat()"
              class="flex-1 px-3 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 dark:hover:bg-indigo-500 transition font-medium text-sm">
              Direct
            </button>
            <button
              (click)="showCreateGroupModal()"
              class="flex-1 px-3 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 dark:hover:bg-emerald-500 transition font-medium text-sm">
              New group
            </button>
          </div>
          <!-- Tabs: Direct | Groups -->
          <div class="flex mt-2 rounded-lg bg-surface-100 dark:bg-surface-800 p-0.5">
            <button
              type="button"
              (click)="setViewMode('direct')"
              [class.bg-white]="viewMode === 'direct'"
              [class.dark:!bg-surface-700]="viewMode === 'direct'"
              [class.shadow]="viewMode === 'direct'"
              [class.text-surface-900]="viewMode === 'direct'"
              [class.dark:!text-surface-0]="viewMode === 'direct'"
              [class.text-surface-600]="viewMode !== 'direct'"
              class="flex-1 py-1.5 rounded-md text-sm font-medium transition">
              Direct
            </button>
            <button
              type="button"
              (click)="setViewMode('groups')"
              [class.bg-white]="viewMode === 'groups'"
              [class.dark:!bg-surface-700]="viewMode === 'groups'"
              [class.shadow]="viewMode === 'groups'"
              [class.text-surface-900]="viewMode === 'groups'"
              [class.dark:!text-surface-0]="viewMode === 'groups'"
              [class.text-surface-600]="viewMode !== 'groups'"
              class="flex-1 py-1.5 rounded-md text-sm font-medium transition">
              Groups
            </button>
          </div>
        </div>

        <!-- Search (direct only) -->
        <div *ngIf="viewMode === 'direct'" class="p-3 border-b border-surface-200 dark:border-surface-700">
          <input
            type="text"
            placeholder="Search conversations..."
            [(ngModel)]="searchText"
            (ngModelChange)="filterDirectConversations()"
            class="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg bg-surface-0 dark:bg-surface-800 text-surface-900 dark:text-surface-0 placeholder:text-surface-500 dark:placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400">
        </div>

        <!-- Direct conversations list -->
        <div *ngIf="viewMode === 'direct'" class="flex-1 overflow-y-auto">
          <div *ngIf="filteredDirectConversations.length === 0" class="p-4 text-center text-surface-500 dark:text-surface-400">
            No conversations
          </div>
          <div *ngFor="let conv of filteredDirectConversations"
               (click)="selectConversation(conv)"
               [class.bg-blue-50]="selectedOtherUserId === conv.otherUserId && !selectedGroupId"
               [class.dark:!bg-surface-700]="selectedOtherUserId === conv.otherUserId && !selectedGroupId"
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

        <!-- Groups list -->
        <div *ngIf="viewMode === 'groups'" class="flex-1 overflow-y-auto">
          <div *ngIf="loadingGroups" class="p-4 text-center text-surface-500 dark:text-surface-400">Loading groups...</div>
          <div *ngIf="!loadingGroups && userGroups.length === 0" class="p-4 text-center text-surface-500 dark:text-surface-400">
            No groups. Create one with "New group".
          </div>
          <div *ngFor="let g of userGroups"
               (click)="selectGroup(g)"
               [class.bg-emerald-50]="selectedGroupId === g.groupId"
               [class.dark:!bg-surface-700]="selectedGroupId === g.groupId"
               class="p-4 border-b border-surface-200 dark:border-surface-700 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 transition">
            <div class="flex justify-between items-start">
              <h3 class="font-semibold text-surface-900 dark:text-surface-0 flex-1">{{ g.groupName }}</h3>
              <span class="text-xs text-surface-500 dark:text-surface-400">{{ g.memberCount }} members</span>
            </div>
            <p class="text-sm text-surface-600 dark:text-surface-300 truncate mt-1">{{ g.lastMessagePreview || 'No messages yet' }}</p>
            <p class="text-xs text-surface-500 dark:text-surface-400 mt-1">{{ g.lastMessageAt ? getConversationDate(g.lastMessageAt) : '—' }}</p>
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
        <ng-container *ngIf="selectedOtherUserId || selectedGroupId; else noSelection">
          <!-- Direct chat header -->
          <div *ngIf="selectedOtherUserId && !selectedGroupId" class="px-5 py-4 border-b border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 shadow-sm">
            <div class="flex justify-between items-center">
              <div>
                <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-0">{{ getDisplayName(selectedOtherUserId!) }}</h2>
                <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Direct message</p>
              </div>
            </div>
          </div>
          <!-- Group chat header -->
          <div *ngIf="selectedGroupId && selectedGroup" class="px-5 py-4 border-b border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 shadow-sm">
            <div class="flex justify-between items-center">
              <div>
                <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-0">{{ selectedGroup.groupName }}</h2>
                <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{{ selectedGroup.memberCount }} members · {{ selectedGroup.myRole }}</p>
              </div>
            </div>
          </div>

          <!-- Direct messages area -->
          <div *ngIf="selectedOtherUserId && !selectedGroupId" class="flex-1 overflow-y-auto px-4 py-3 flex flex-col messages-area messages-area-dark" #messagesContainer
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

          <!-- Direct message input -->
          <div *ngIf="selectedOtherUserId && !selectedGroupId" class="p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900">
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

          <!-- Group messages area -->
          <div *ngIf="selectedGroupId" class="flex-1 overflow-y-auto px-4 py-3 flex flex-col messages-area messages-area-dark" #groupMessagesContainer
               (scroll)="onGroupMessagesScroll($event)">
            <div *ngIf="groupHasMoreOlder && !groupLoadingOlder" class="flex justify-center py-3">
              <button type="button" (click)="loadOlderGroupMessages()"
                      class="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-surface-800 transition">
                Load older messages
              </button>
            </div>
            <div *ngIf="groupLoadingOlder" class="text-center py-3 text-surface-500 dark:text-surface-400 text-sm">Loading...</div>
            <p *ngIf="!groupMessagesLoading && groupMessages.length === 0" class="text-sm text-surface-500 dark:text-surface-400 text-center py-8">No messages yet. Start the conversation.</p>
            <p *ngIf="groupMessagesLoading && groupMessages.length === 0" class="text-sm text-surface-500 dark:text-surface-400 text-center py-8">Loading...</p>
            <ng-container *ngFor="let message of groupMessages">
              <div *ngIf="!message.isDeleted"
                   [class.justify-end]="message.senderUserId === currentUserId"
                   [class.justify-start]="message.senderUserId !== currentUserId"
                   class="flex mb-3 items-end gap-1.5">
                <div *ngIf="message.senderUserId !== currentUserId"
                     class="w-4 h-4 rounded-full bg-surface-300 dark:bg-surface-500 flex-shrink-0 flex items-center justify-center"
                     [title]="message.senderUserId">
                  <span class="text-[7px] font-medium text-surface-600 dark:text-surface-200 leading-none">{{ getShortUserId(message.senderUserId) }}</span>
                </div>
                <div [class.items-end]="message.senderUserId === currentUserId"
                     [class.items-start]="message.senderUserId !== currentUserId"
                     class="flex flex-col max-w-[75%] min-w-0"
                     [class.max-w-[320px]]="message.senderUserId !== currentUserId">
                  <div
                    [class.bg-emerald-600]="message.senderUserId === currentUserId"
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
                    <span *ngIf="message.senderUserId !== currentUserId && message.senderUserName" class="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">{{ message.senderUserName }}</span>
                    <p class="text-[15px] leading-snug break-words max-w-full">{{ message.messageContent }}</p>
                  </div>
                  <div class="flex items-center gap-2 mt-1 px-1 flex-wrap"
                       [class.flex-row-reverse]="message.senderUserId === currentUserId">
                    <span class="text-[11px] text-surface-500 dark:text-surface-400">{{ message.sentTime | date:'shortTime' }}</span>
                    <span *ngIf="message.senderUserId === currentUserId" class="text-[11px]"
                          [class.text-emerald-500]="message.isSeen"
                          [class.dark:!text-emerald-400]="message.isSeen"
                          [class.text-surface-500]="!message.isSeen"
                          [class.dark:!text-surface-400]="!message.isSeen">
                      {{ message.isSeen ? 'Seen' : 'Unseen' }}
                    </span>
                    <button *ngIf="message.senderUserId === currentUserId && !message.isSeen"
                            type="button"
                            (click)="deleteGroupMessage(message.messageId)"
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

          <!-- Group message input -->
          <div *ngIf="selectedGroupId" class="p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900">
            <form [formGroup]="groupMessageForm" (ngSubmit)="sendGroupMessage()" class="flex gap-3">
              <input
                type="text"
                formControlName="messageContent"
                placeholder="Type a message to the group..."
                (keyup.enter)="sendGroupMessage()"
                [disabled]="!isConnected || isSendingGroup"
                class="flex-1 px-4 py-2.5 border border-surface-200 dark:border-surface-600 rounded-xl bg-surface-0 dark:bg-surface-800 text-surface-900 dark:text-surface-0 placeholder:text-surface-500 dark:placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed">
              <button
                type="submit"
                [disabled]="!isConnected || isSendingGroup || !groupMessageForm.valid"
                class="px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 dark:hover:bg-emerald-500 disabled:bg-surface-300 dark:disabled:bg-surface-600 disabled:cursor-not-allowed transition font-medium">
                {{ isSendingGroup ? 'Sending...' : 'Send' }}
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

      <!-- Create Group Modal -->
      <div *ngIf="showCreateGroupModalOpen" class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
        <div class="bg-surface-0 dark:bg-surface-900 rounded-lg shadow-xl border border-surface-200 dark:border-surface-700 p-6 w-full max-w-md mx-4 max-h-[85vh] flex flex-col">
          <h3 class="text-lg font-bold text-surface-900 dark:text-surface-0 mb-4">Create group</h3>
          <p class="text-sm text-surface-500 dark:text-surface-400 mb-3">Enter a name and select members (by userId).</p>
          <div class="mb-4">
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Group name</label>
            <input
              type="text"
              [(ngModel)]="createGroupName"
              placeholder="e.g. Team Alpha"
              class="w-full px-3 py-2 border border-surface-200 dark:border-surface-600 rounded-lg bg-surface-0 dark:bg-surface-800 text-surface-900 dark:text-surface-0">
          </div>
          <div class="mb-4 flex-1 min-h-0 flex flex-col">
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Add members</label>
            <div *ngIf="loadingChatUsers" class="text-surface-500 dark:text-surface-400 py-2">Loading users...</div>
            <div *ngIf="!loadingChatUsers && chatUsers.length === 0" class="text-surface-500 dark:text-surface-400 py-2">No other users found.</div>
            <div *ngIf="!loadingChatUsers && chatUsers.length > 0" class="flex-1 overflow-y-auto border border-surface-200 dark:border-surface-600 rounded-lg p-2 max-h-48 space-y-1">
              <label *ngFor="let user of chatUsers" class="flex items-center gap-2 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 rounded px-2 py-1.5">
                <input type="checkbox" [checked]="createGroupSelectedUserIds.includes(user.userId)" (change)="toggleCreateGroupUser(user.userId)">
                <span class="font-medium text-surface-900 dark:text-surface-0">{{ user.userName || user.email }}</span>
                <span class="text-xs text-surface-500 dark:text-surface-400">({{ user.userId }})</span>
              </label>
            </div>
          </div>
          <div class="flex gap-2 mt-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            <button
              type="button"
              (click)="createGroupSubmit()"
              [disabled]="!createGroupName?.trim() || createGroupSelectedUserIds.length === 0 || creatingGroup"
              class="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium">
              {{ creatingGroup ? 'Creating...' : 'Create group' }}
            </button>
            <button
              type="button"
              (click)="closeCreateGroupModal()"
              class="px-4 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition">
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
  groupMessageForm: FormGroup;
  showSelectUserModal: boolean = false;
  chatUsers: ChatUserDto[] = [];
  loadingChatUsers: boolean = false;
  private destroy$ = new Subject<void>();
  private shouldScroll = false;

  viewMode: 'direct' | 'groups' = 'direct';
  userGroups: GroupDto[] = [];
  loadingGroups = false;
  selectedGroupId: number | null = null;
  selectedGroup: GroupDto | null = null;
  groupMessages: Array<{ messageId: number; groupId: number; senderUserId: string; senderUserName?: string; messageContent: string; sentTime: Date; isDeleted: boolean; isSeen?: boolean }> = [];
  groupMessagesLoading = false;
  groupLoadingOlder = false;
  groupHasMoreOlder = false;
  groupMessagesPageNumber = 1;
  isSendingGroup = false;
  private shouldScrollGroup = false;
  @ViewChild('groupMessagesContainer', { static: false }) groupMessagesContainer?: ElementRef<HTMLDivElement>;

  showCreateGroupModalOpen = false;
  createGroupName = '';
  createGroupSelectedUserIds: string[] = [];
  creatingGroup = false;

  constructor(private chatService: ChatService, private fb: FormBuilder) {
    this.messageForm = this.fb.group({
      messageContent: ['', [Validators.required, Validators.minLength(1)]]
    });
    this.groupMessageForm = this.fb.group({
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

  setViewMode(mode: 'direct' | 'groups'): void {
    this.viewMode = mode;
    if (mode === 'groups') this.loadUserGroups();
  }

  loadUserGroups(): void {
    this.loadingGroups = true;
    this.chatService.getUserGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          this.userGroups = list ?? [];
          this.loadingGroups = false;
          const openGroupId = this.chatService.getAndClearOpenGroupId();
          if (openGroupId) {
            const g = this.userGroups.find(gr => gr.groupId === openGroupId);
            if (g) {
              this.viewMode = 'groups';
              this.selectGroup(g);
            }
          }
        },
        error: () => { this.loadingGroups = false; }
      });
  }

  selectGroup(g: GroupDto): void {
    const prevGroupId = this.selectedGroupId;
    if (prevGroupId !== null) this.chatService.leaveGroupHub(prevGroupId).catch(() => {});
    this.selectedOtherUserId = null;
    this.chatService.setSelectedConversation(null);
    this.chatService.setSelectedGroupId(g.groupId);
    this.selectedGroupId = g.groupId;
    this.selectedGroup = g;
    this.groupMessages = [];
    this.groupMessagesPageNumber = 1;
    this.groupHasMoreOlder = false;
    this.chatService.joinGroupHub(g.groupId).then(() => this.loadGroupMessages()).catch(() => this.loadGroupMessages());
  }

  loadGroupMessages(): void {
    if (!this.selectedGroupId) return;
    this.groupMessagesLoading = true;
    this.chatService.getGroupMessages(this.selectedGroupId, 1, this.PAGE_SIZE)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          this.groupMessages = Array.isArray(list) ? list.map(m => this.normalizeGroupMessage(m)) : [];
          this.groupHasMoreOlder = this.groupMessages.length >= this.PAGE_SIZE;
          this.shouldScrollGroup = true;
          this.groupMessagesLoading = false;
          if (this.selectedGroupId && this.groupMessages.length > 0 && this.isConnected) {
            const ids = this.groupMessages.map(m => m.messageId);
            this.chatService.markGroupMessagesAsSeen(this.selectedGroupId, ids).catch(() => {});
          }
        },
        error: () => { this.groupMessagesLoading = false; }
      });
  }

  private normalizeGroupMessage(m: GroupMessageDto | any): typeof this.groupMessages[0] {
    return {
      messageId: m.messageId ?? m.MessageId,
      groupId: m.groupId ?? m.GroupId,
      senderUserId: m.senderUserId ?? m.SenderUserId ?? '',
      senderUserName: m.senderUserName ?? m.SenderUserName,
      messageContent: m.messageContent ?? m.MessageContent ?? '',
      sentTime: m.sentTime ? new Date(m.sentTime) : (m.SentTime ? new Date(m.SentTime) : new Date()),
      isDeleted: m.isDeleted ?? m.IsDeleted ?? false,
      isSeen: m.isSeen ?? m.IsSeen ?? false
    };
  }

  loadOlderGroupMessages(): void {
    if (!this.selectedGroupId || this.groupLoadingOlder || !this.groupHasMoreOlder) return;
    this.groupLoadingOlder = true;
    const nextPage = this.groupMessagesPageNumber + 1;
    const container = this.groupMessagesContainer?.nativeElement as HTMLElement;
    const oldScrollHeight = container?.scrollHeight ?? 0;
    const oldScrollTop = container?.scrollTop ?? 0;
    this.chatService.getGroupMessages(this.selectedGroupId, nextPage, this.PAGE_SIZE)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          const older = Array.isArray(list) ? list.map(m => this.normalizeGroupMessage(m)) : [];
          this.groupMessages = [...older, ...this.groupMessages];
          this.groupMessagesPageNumber = nextPage;
          this.groupHasMoreOlder = older.length >= this.PAGE_SIZE;
          this.groupLoadingOlder = false;
          if (container && older.length > 0) {
            setTimeout(() => {
              const newScrollHeight = container.scrollHeight;
              container.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
            }, 0);
          }
        },
        error: () => { this.groupLoadingOlder = false; }
      });
  }

  onGroupMessagesScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollTop < 80 && this.groupHasMoreOlder && !this.groupLoadingOlder) this.loadOlderGroupMessages();
  }

  sendGroupMessage(): void {
    if (!this.groupMessageForm.valid || !this.selectedGroupId || this.isSendingGroup) return;
    this.isSendingGroup = true;
    const content = this.groupMessageForm.get('messageContent')?.value;
    this.chatService.sendGroupMessage(this.selectedGroupId, content, this.currentUserId).then(() => {
      this.groupMessageForm.reset();
      this.isSendingGroup = false;
      this.loadUserGroups();
    }).catch(() => { this.isSendingGroup = false; });
  }

  deleteGroupMessage(messageId: number): void {
    if (!confirm('Delete this message?')) return;
    this.chatService.deleteGroupMessage(messageId).then(() => {
      const m = this.groupMessages.find(x => x.messageId === messageId);
      if (m) m.isDeleted = true;
    }).catch(() => {});
  }

  showCreateGroupModal(): void {
    this.showCreateGroupModalOpen = true;
    this.createGroupName = '';
    this.createGroupSelectedUserIds = [];
    this.loadingChatUsers = true;
    this.chatUsers = [];
    this.chatService.getChatUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => { this.chatUsers = users; this.loadingChatUsers = false; },
        error: () => { this.loadingChatUsers = false; }
      });
  }

  closeCreateGroupModal(): void {
    this.showCreateGroupModalOpen = false;
  }

  toggleCreateGroupUser(userId: string): void {
    const i = this.createGroupSelectedUserIds.indexOf(userId);
    if (i >= 0) this.createGroupSelectedUserIds = this.createGroupSelectedUserIds.filter(id => id !== userId);
    else this.createGroupSelectedUserIds = [...this.createGroupSelectedUserIds, userId];
  }

  createGroupSubmit(): void {
    if (!this.createGroupName?.trim() || this.createGroupSelectedUserIds.length === 0 || this.creatingGroup) return;
    this.creatingGroup = true;
    this.chatService.createGroup(this.createGroupName.trim(), this.createGroupSelectedUserIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.creatingGroup = false;
          this.closeCreateGroupModal();
          this.viewMode = 'groups';
          this.loadUserGroups();
          const body = res?.body ?? res;
          const groupData = body?.data ?? body?.Data;
          const newGroupId = groupData?.groupId ?? groupData?.GroupId;
          if (newGroupId) {
            const g: GroupDto = {
              groupId: newGroupId,
              groupName: this.createGroupName.trim(),
              createdByUserId: this.currentUserId,
              memberCount: this.createGroupSelectedUserIds.length + 1,
              myRole: 'Admin',
              lastMessageAt: undefined,
              lastMessagePreview: undefined
            };
            this.selectGroup(g);
          }
        },
        error: () => { this.creatingGroup = false; }
      });
  }

  ngOnInit(): void {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    this.currentUserId = auth.userId || '';
    this.chatService.setSelectedConversation(null);

    this.chatService.connectToHub().then(() => {
      this.loadDirectConversations();
    }).catch(() => this.loadDirectConversations());

    this.loadUserGroups();

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

    this.chatService.groupMessageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: any) => {
        if (!payload || payload.groupId !== this.selectedGroupId) return;
        if (!this.groupMessages.some(m => m.messageId === payload.messageId)) {
          this.groupMessages.push({
            messageId: payload.messageId,
            groupId: payload.groupId,
            senderUserId: payload.senderUserId,
            senderUserName: payload.senderName,
            messageContent: payload.messageContent,
            sentTime: payload.sentTime ? new Date(payload.sentTime) : new Date(),
            isDeleted: false,
            isSeen: false
          });
          this.shouldScrollGroup = true;
          if (this.selectedGroupId && payload.senderUserId !== this.currentUserId)
            this.chatService.markGroupMessagesAsSeen(this.selectedGroupId, [payload.messageId]).catch(() => {});
        }
        this.loadUserGroups();
      });

    this.chatService.groupMessagesSeen$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { messageIds?: number[]; groupId?: number }) => {
        if (payload?.groupId !== this.selectedGroupId) return;
        const ids = payload?.messageIds ?? [];
        this.groupMessages.forEach(m => {
          if (ids.includes(m.messageId)) m.isSeen = true;
        });
      });

    this.chatService.groupMessageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { messageId?: number; groupId?: number }) => {
        if (payload?.groupId !== this.selectedGroupId) return;
        const msg = this.groupMessages.find(m => m.messageId === payload?.messageId);
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
    if (this.shouldScrollGroup) {
      this.shouldScrollGroup = false;
      setTimeout(() => this.scrollGroupToBottom(), 0);
    }
  }

  private scrollGroupToBottom(): void {
    try {
      if (this.groupMessagesContainer)
        this.groupMessagesContainer.nativeElement.scrollTop = this.groupMessagesContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Error scrolling group:', err);
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
    if (this.selectedGroupId !== null) {
      this.chatService.leaveGroupHub(this.selectedGroupId).catch(() => {});
      this.selectedGroupId = null;
      this.selectedGroup = null;
      this.chatService.setSelectedGroupId(null);
    }
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
    if (this.selectedGroupId !== null) this.chatService.leaveGroupHub(this.selectedGroupId).catch(() => {});
    this.chatService.setSelectedGroupId(null);
    this.chatService.setSelectedConversation(null);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
