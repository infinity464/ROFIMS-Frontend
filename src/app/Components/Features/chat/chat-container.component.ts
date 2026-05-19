import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { UserMenuService } from '@/services/user-menu.service';
import { ConfirmationService } from 'primeng/api';
import { ChatService } from '@/services/chat.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { DialogModule } from 'primeng/dialog';
import { ChatAttachment, ChatUserDto, DirectConversation, DirectMessageDto, DirectMessageSearchResult, GroupDto, GroupMemberDto, GroupMessageDto } from '@/models/chat.model';
import { saveAs } from 'file-saver';
import { Subject, of, forkJoin } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-chat-container',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ConfirmDialogModule, DialogModule],
  providers: [ConfirmationService],
  template: `
    <div class="chat-container flex h-[calc(100vh-80px)] bg-surface-0 dark:bg-surface-900">
      <!-- Sidebar - Conversations List -->
      <div class="w-[300px] border-r border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 flex flex-col">
        <!-- Tabs: Direct | Groups -->
        <div class="p-4">
          <div class="flex rounded-full bg-surface-100 dark:bg-surface-800 p-1">
            <button
              type="button"
              (click)="setViewMode('direct')"
              [class.bg-white]="viewMode === 'direct'"
              [class.dark:!bg-surface-700]="viewMode === 'direct'"
              [class.shadow-sm]="viewMode === 'direct'"
              [class.text-surface-900]="viewMode === 'direct'"
              [class.dark:!text-surface-0]="viewMode === 'direct'"
              [class.text-surface-600]="viewMode !== 'direct'"
              class="flex-1 py-2 rounded-full text-sm font-semibold transition">
              Direct
            </button>
            <button
              type="button"
              (click)="setViewMode('groups')"
              [class.bg-white]="viewMode === 'groups'"
              [class.dark:!bg-surface-700]="viewMode === 'groups'"
              [class.shadow-sm]="viewMode === 'groups'"
              [class.text-surface-900]="viewMode === 'groups'"
              [class.dark:!text-surface-0]="viewMode === 'groups'"
              [class.text-surface-600]="viewMode !== 'groups'"
              class="flex-1 py-2 rounded-full text-sm font-semibold transition">
              Groups
            </button>
          </div>
        </div>

        <!-- Search (direct only) -->
        <div *ngIf="viewMode === 'direct'" class="px-4 pb-3">
          <div class="relative">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search conversations..."
              [(ngModel)]="searchText"
              (ngModelChange)="filterDirectConversations()"
              class="w-full pl-9 pr-3 py-2.5 border border-surface-200 dark:border-surface-600 rounded-full bg-surface-50 dark:bg-surface-800 text-sm text-surface-900 dark:text-surface-0 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 focus:bg-surface-0 dark:focus:bg-surface-800">
          </div>
        </div>

        <!-- CONVERSATIONS / + New row (direct only) -->
        <div *ngIf="viewMode === 'direct'" class="flex items-center justify-between px-4 pb-2">
          <span class="text-[11px] font-bold tracking-[0.12em] text-surface-500 dark:text-surface-400">CONVERSATIONS</span>
          <button
            type="button"
            (click)="onSelectUserChat()"
            class="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 px-2.5 py-1 rounded-full transition">
            <i class="pi pi-plus text-[10px]"></i>
            <span>New</span>
          </button>
        </div>

        <!-- GROUPS / + New row (groups only) -->
        <div *ngIf="viewMode === 'groups'" class="flex items-center justify-between px-4 pb-2 pt-1">
          <span class="text-[11px] font-bold tracking-[0.12em] text-surface-500 dark:text-surface-400">GROUPS</span>
          <button
            type="button"
            (click)="showCreateGroupModal()"
            class="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 px-2.5 py-1 rounded-full transition">
            <i class="pi pi-plus text-[10px]"></i>
            <span>New</span>
          </button>
        </div>

        <!-- Direct conversations list -->
        <div *ngIf="viewMode === 'direct'" class="flex-1 overflow-y-auto px-2 pb-2">
          <div *ngIf="filteredDirectConversations.length === 0 && searchResultUsers().length === 0 && messageSearchResults.length === 0 && !messageSearchLoading" class="p-4 text-center text-sm text-surface-500 dark:text-surface-400">
            {{ searchText.trim() ? 'No matches for "' + searchText + '"' : 'No conversations' }}
          </div>
          <div *ngFor="let conv of filteredDirectConversations"
               (click)="selectConversation(conv)"
               [class.bg-indigo-50]="selectedOtherUserId === conv.otherUserId && !selectedGroupId"
               [class.dark:!bg-indigo-500/10]="selectedOtherUserId === conv.otherUserId && !selectedGroupId"
               [class.shadow-sm]="selectedOtherUserId === conv.otherUserId && !selectedGroupId"
               [class.bg-indigo-50\/60]="getUnreadCount(conv) > 0 && selectedOtherUserId !== conv.otherUserId"
               [class.dark:!bg-indigo-500\/5]="getUnreadCount(conv) > 0 && selectedOtherUserId !== conv.otherUserId"
               class="relative flex items-start gap-3 px-3 py-2.5 mb-1 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 transition">
            <!-- Selected accent stripe -->
            <span *ngIf="selectedOtherUserId === conv.otherUserId && !selectedGroupId"
                  class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-indigo-500"></span>
            <!-- Unread accent stripe (only when not currently selected) -->
            <span *ngIf="getUnreadCount(conv) > 0 && (selectedOtherUserId !== conv.otherUserId || selectedGroupId)"
                  class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-indigo-400"></span>
            <!-- Avatar -->
            <div class="relative shrink-0">
              <img *ngIf="getUserAvatarImage(conv.otherUserId) as imgUrl; else convLetter"
                   [src]="imgUrl" alt=""
                   class="w-11 h-11 rounded-xl object-cover bg-surface-100 dark:bg-surface-700" />
              <ng-template #convLetter>
                <div class="w-11 h-11 rounded-xl flex items-center justify-center text-white font-semibold text-sm"
                     [style.background]="getAvatarColor(conv.otherUserId)">
                  {{ getLastNameInitial(conv.otherUserId) }}
                </div>
              </ng-template>
              <span *ngIf="isOnline(conv.otherUserId)"
                    title="Online"
                    class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-surface-0 dark:border-surface-900"></span>
            </div>
            <!-- Body -->
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline justify-between gap-2">
                <div class="text-[13px] leading-tight text-surface-900 dark:text-surface-0 truncate"
                     [class.font-bold]="getUnreadCount(conv) > 0"
                     [class.font-semibold]="getUnreadCount(conv) === 0">{{ getRankAndName(conv.otherUserId) }}</div>
                <span class="text-[11px] shrink-0"
                      [class.text-indigo-600]="getUnreadCount(conv) > 0"
                      [class.dark:!text-indigo-400]="getUnreadCount(conv) > 0"
                      [class.font-semibold]="getUnreadCount(conv) > 0"
                      [class.text-surface-500]="getUnreadCount(conv) === 0"
                      [class.dark:!text-surface-400]="getUnreadCount(conv) === 0">{{ getConversationTime(conv.lastMessageDate) }}</span>
              </div>
              <p class="text-[10px] text-surface-500 dark:text-surface-400 truncate leading-tight">{{ getChatUserName(conv.otherUserId) }}</p>
              <div class="flex items-center justify-between gap-2 mt-0.5">
                <p class="text-xs truncate"
                   [class.text-surface-900]="getUnreadCount(conv) > 0"
                   [class.dark:!text-surface-0]="getUnreadCount(conv) > 0"
                   [class.font-semibold]="getUnreadCount(conv) > 0"
                   [class.text-surface-600]="getUnreadCount(conv) === 0"
                   [class.dark:!text-surface-400]="getUnreadCount(conv) === 0">{{ conv.lastMessage || 'No messages yet' }}</p>
                <span *ngIf="getUnreadCount(conv) > 0"
                      class="shrink-0 bg-indigo-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow-sm shadow-indigo-500/30">
                  {{ getUnreadCount(conv) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Other users matching the search (start a new chat) -->
          <ng-container *ngIf="searchText.trim() && searchResultUsers().length > 0">
            <div class="px-3 pt-3 pb-1 text-[10px] font-bold tracking-[0.12em] text-surface-500 dark:text-surface-400">START A NEW CHAT</div>
            <div *ngFor="let u of searchResultUsers()"
                 (click)="startChatWithUser(u)"
                 class="flex items-start gap-3 px-3 py-2.5 mb-1 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 transition">
              <div class="relative shrink-0">
                <img *ngIf="getUserAvatarImage(u.userId) as imgUrl; else newChatLetter"
                     [src]="imgUrl" alt=""
                     class="w-11 h-11 rounded-xl object-cover bg-surface-100 dark:bg-surface-700" />
                <ng-template #newChatLetter>
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center text-white font-semibold text-sm"
                       [style.background]="getAvatarColor(u.userId)">
                    {{ getLastNameInitial(u.userId) }}
                  </div>
                </ng-template>
                <span *ngIf="isOnline(u.userId)"
                      title="Online"
                      class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-surface-0 dark:border-surface-900"></span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-[13px] leading-tight text-surface-900 dark:text-surface-0 truncate">{{ getRankAndName(u.userId) }}</div>
                <div class="text-[10px] text-surface-500 dark:text-surface-400 truncate leading-tight mt-0.5">{{ u.userName || u.userId }}</div>
              </div>
              <i class="pi pi-plus text-indigo-500 text-xs mt-3"></i>
            </div>
          </ng-container>

          <!-- Backend message-content search results -->
          <ng-container *ngIf="searchText.trim()">
            <div *ngIf="messageSearchLoading" class="px-3 pt-3 pb-1 text-[10px] font-bold tracking-[0.12em] text-surface-500 dark:text-surface-400 flex items-center gap-2">
              <i class="pi pi-spin pi-spinner text-[10px]"></i>
              SEARCHING MESSAGES...
            </div>
            <ng-container *ngIf="!messageSearchLoading && messageSearchResults.length > 0">
              <div class="px-3 pt-3 pb-1 text-[10px] font-bold tracking-[0.12em] text-surface-500 dark:text-surface-400">MESSAGES</div>
              <div *ngFor="let r of messageSearchResults"
                   (click)="openSearchResult(r)"
                   class="flex items-start gap-3 px-3 py-2.5 mb-1 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 transition">
                <img *ngIf="getUserAvatarImage(r.otherUserId) as imgUrl; else searchLetter"
                     [src]="imgUrl" alt=""
                     class="w-11 h-11 rounded-xl object-cover shrink-0 bg-surface-100 dark:bg-surface-700" />
                <ng-template #searchLetter>
                  <div class="w-11 h-11 rounded-xl flex items-center justify-center text-white font-semibold text-sm shrink-0"
                       [style.background]="getAvatarColor(r.otherUserId)">
                    {{ getLastNameInitial(r.otherUserId) }}
                  </div>
                </ng-template>
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline justify-between gap-2">
                    <div class="font-semibold text-[13px] leading-tight text-surface-900 dark:text-surface-0 truncate">{{ getRankAndName(r.otherUserId) }}</div>
                    <span class="text-[11px] text-surface-500 dark:text-surface-400 shrink-0">{{ getConversationTime(r.sentTime) }}</span>
                  </div>
                  <p class="text-xs text-surface-600 dark:text-surface-400 truncate mt-0.5">
                    <span class="text-surface-500 dark:text-surface-500">{{ r.senderUserId === currentUserId ? 'You: ' : '' }}</span>{{ r.messageContent }}
                  </p>
                </div>
              </div>
            </ng-container>
          </ng-container>
        </div>

        <!-- Groups list -->
        <div *ngIf="viewMode === 'groups'" class="flex-1 overflow-y-auto px-2 pb-2">
          <div *ngIf="loadingGroups" class="p-4 text-center text-sm text-surface-500 dark:text-surface-400">Loading groups...</div>
          <div *ngIf="!loadingGroups && userGroups.length === 0" class="p-4 text-center text-sm text-surface-500 dark:text-surface-400">
            No groups. Create one with "New".
          </div>
          <div *ngFor="let g of userGroups"
               (click)="selectGroup(g)"
               [class.bg-emerald-50]="selectedGroupId === g.groupId"
               [class.dark:!bg-emerald-500/10]="selectedGroupId === g.groupId"
               [class.shadow-sm]="selectedGroupId === g.groupId"
               [class.bg-emerald-50\/60]="getGroupUnreadCount(g) > 0 && selectedGroupId !== g.groupId"
               [class.dark:!bg-emerald-500\/5]="getGroupUnreadCount(g) > 0 && selectedGroupId !== g.groupId"
               class="relative flex items-start gap-3 px-3 py-2.5 mb-1 rounded-xl cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 transition">
            <span *ngIf="selectedGroupId === g.groupId"
                  class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-500"></span>
            <span *ngIf="getGroupUnreadCount(g) > 0 && selectedGroupId !== g.groupId"
                  class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-400"></span>
            <div class="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0">
              <i class="pi pi-users text-base"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline justify-between gap-2">
                <div class="text-[13px] leading-tight text-surface-900 dark:text-surface-0 truncate"
                     [class.font-bold]="getGroupUnreadCount(g) > 0"
                     [class.font-semibold]="getGroupUnreadCount(g) === 0">{{ g.groupName }}</div>
                <span class="text-[11px] shrink-0"
                      [class.text-emerald-600]="getGroupUnreadCount(g) > 0"
                      [class.dark:!text-emerald-400]="getGroupUnreadCount(g) > 0"
                      [class.font-semibold]="getGroupUnreadCount(g) > 0"
                      [class.text-surface-500]="getGroupUnreadCount(g) === 0"
                      [class.dark:!text-surface-400]="getGroupUnreadCount(g) === 0">{{ g.lastMessageAt ? getConversationTime(g.lastMessageAt) : '' }}</span>
              </div>
              <div class="flex items-center justify-between gap-2 mt-0.5">
                <p class="text-xs truncate"
                   [class.text-surface-900]="getGroupUnreadCount(g) > 0"
                   [class.dark:!text-surface-0]="getGroupUnreadCount(g) > 0"
                   [class.font-semibold]="getGroupUnreadCount(g) > 0"
                   [class.text-surface-600]="getGroupUnreadCount(g) === 0"
                   [class.dark:!text-surface-400]="getGroupUnreadCount(g) === 0">{{ formatGroupPreview(g.lastMessagePreview) || 'No messages yet' }}</p>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span *ngIf="getGroupUnreadCount(g) > 0"
                        class="bg-emerald-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow-sm shadow-emerald-500/30">
                    {{ getGroupUnreadCount(g) }}
                  </span>
                  <span class="text-[10px] text-surface-500 dark:text-surface-400">{{ g.memberCount }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Connection Status -->
        <div class="px-4 py-3 border-t border-surface-200 dark:border-surface-700 flex items-center gap-2 text-xs">
          <span class="w-2 h-2 rounded-full"
                [class.bg-emerald-500]="isConnected"
                [class.bg-red-500]="!isConnected"></span>
          <span class="text-surface-700 dark:text-surface-300 font-medium">{{ isConnected ? 'Connected' : 'Disconnected' }}</span>
        </div>
      </div>

      <!-- Chat Area -->
      <div class="flex-1 flex flex-col bg-surface-0 dark:bg-surface-900">
        <ng-container *ngIf="selectedOtherUserId || selectedGroupId; else noSelection">
          <!-- Direct chat header -->
          <div *ngIf="selectedOtherUserId && !selectedGroupId" class="px-5 py-3.5 border-b border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <img *ngIf="getUserAvatarImage(selectedOtherUserId!) as imgUrl; else headerLetter"
                     [src]="imgUrl" alt=""
                     class="w-10 h-10 rounded-xl object-cover shrink-0 bg-surface-100 dark:bg-surface-700" />
                <ng-template #headerLetter>
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm shrink-0"
                       [style.background]="getAvatarColor(selectedOtherUserId!)">
                    {{ getLastNameInitial(selectedOtherUserId!) }}
                  </div>
                </ng-template>
                <div class="min-w-0">
                  <div class="text-sm font-semibold leading-tight text-surface-900 dark:text-surface-0 truncate">{{ getRankAndName(selectedOtherUserId!) }}</div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[10px] text-surface-500 dark:text-surface-400 truncate">{{ getChatUserName(selectedOtherUserId!) }}</span>
                    <span *ngIf="isOnline(selectedOtherUserId!)" class="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span class="font-medium">Active now</span>
                    </span>
                    <span *ngIf="!isOnline(selectedOtherUserId!)" class="text-[11px] text-surface-400">Offline</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button"
                        (click)="openProfileInfo(selectedOtherUserId)"
                        class="w-9 h-9 rounded-full flex items-center justify-center text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition"
                        title="View user info">
                  <i class="pi pi-info-circle"></i>
                </button>
              </div>
            </div>
          </div>
          <!-- Group chat header -->
          <div *ngIf="selectedGroupId && selectedGroup" class="px-5 py-3.5 border-b border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0">
                  <i class="pi pi-users"></i>
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold leading-tight text-surface-900 dark:text-surface-0 truncate">{{ selectedGroup.groupName }}</div>
                  <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{{ selectedGroup.memberCount }} members · {{ selectedGroup.myRole }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button"
                        (click)="openGroupInfo()"
                        class="w-9 h-9 rounded-full flex items-center justify-center text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition"
                        title="Group info">
                  <i class="pi pi-info-circle"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Direct messages area -->
          <div *ngIf="selectedOtherUserId && !selectedGroupId" class="flex-1 overflow-y-auto px-6 py-4 flex flex-col messages-area messages-area-dark" #messagesContainer
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
            <ng-container *ngFor="let message of messages; let i = index">
              <!-- Date separator -->
              <div *ngIf="shouldShowDateSeparator(messages, i)" class="flex items-center gap-3 my-3">
                <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700"></div>
                <span class="text-[11px] font-semibold tracking-[0.18em] text-surface-500 dark:text-surface-400 uppercase">{{ getDateLabel(message.sentTime) }}</span>
                <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700"></div>
              </div>

              <div *ngIf="!message.isDeleted"
                   [attr.data-message-id]="message.messageId"
                   [class.justify-end]="message.senderUserId === currentUserId"
                   [class.justify-start]="message.senderUserId !== currentUserId"
                   class="chat-message-row flex mb-2 items-end gap-2 rounded-xl px-1 py-0.5 -mx-1 transition-colors">
                <div [class.items-end]="message.senderUserId === currentUserId"
                     [class.items-start]="message.senderUserId !== currentUserId"
                     class="flex flex-col max-w-[70%] min-w-0">
                  <div
                    [class.text-white]="message.senderUserId === currentUserId"
                    [class.rounded-br-md]="message.senderUserId === currentUserId"
                    [class.rounded-bl-md]="message.senderUserId !== currentUserId"
                    [class.bg-white]="message.senderUserId !== currentUserId"
                    [class.dark:!bg-surface-800]="message.senderUserId !== currentUserId"
                    [class.text-surface-900]="message.senderUserId !== currentUserId"
                    [class.dark:!text-surface-0]="message.senderUserId !== currentUserId"
                    [class.shadow]="message.senderUserId !== currentUserId"
                    [style.background]="message.senderUserId === currentUserId ? 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)' : null"
                    class="px-4 py-2.5 rounded-2xl break-words">
                    <span *ngIf="message.senderUserId !== currentUserId && message.senderUserId" class="block text-xs font-semibold text-indigo-500 dark:text-indigo-300 mb-0.5">{{ getRankAndName(message.senderUserId) }}</span>
                    <p *ngIf="message.messageContent" class="text-[14px] leading-snug break-words max-w-full">{{ message.messageContent }}</p>
                    <!-- Attachments -->
                    <ng-container *ngIf="parseAttachments(message.attachments) as atts">
                      <div *ngIf="atts.length > 0" class="flex flex-col gap-2"
                           [class.mt-2]="message.messageContent">
                        <ng-container *ngFor="let a of atts">
                          <div *ngIf="isImageAttachment(a); else fileCard"
                               class="relative max-w-[260px] rounded-xl overflow-hidden ring-1 ring-black/10 group">
                            <button type="button"
                                    (click)="openImageLightbox(a)"
                                    class="block w-full hover:opacity-90 transition">
                              <img *ngIf="getAttachmentImageUrl(a) as src" [src]="src" [alt]="a.fileName"
                                   class="block w-full h-auto max-h-[260px] object-cover" />
                              <div *ngIf="!getAttachmentImageUrl(a)" class="w-[200px] h-[140px] flex items-center justify-center bg-surface-100 dark:bg-surface-700">
                                <i class="pi pi-spin pi-spinner text-surface-400"></i>
                              </div>
                            </button>
                            <button type="button"
                                    (click)="downloadAttachment(a, $event)"
                                    class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white hover:bg-black/75 flex items-center justify-center transition shadow-md"
                                    title="Download image">
                              <i class="pi pi-download text-xs"></i>
                            </button>
                          </div>
                          <ng-template #fileCard>
                            <button type="button"
                                    (click)="downloadAttachment(a, $event)"
                                    class="flex items-center gap-2 px-3 py-2 rounded-xl ring-1 hover:opacity-90 transition text-left max-w-[260px]"
                                    [class.bg-white\/15]="message.senderUserId === currentUserId"
                                    [class.ring-white\/25]="message.senderUserId === currentUserId"
                                    [class.bg-surface-100]="message.senderUserId !== currentUserId"
                                    [class.dark:!bg-surface-700]="message.senderUserId !== currentUserId"
                                    [class.ring-surface-200]="message.senderUserId !== currentUserId"
                                    [class.dark:!ring-surface-600]="message.senderUserId !== currentUserId">
                              <i class="pi pi-file text-base shrink-0"
                                 [class.text-white]="message.senderUserId === currentUserId"
                                 [class.text-indigo-500]="message.senderUserId !== currentUserId"></i>
                              <span class="flex-1 min-w-0">
                                <span class="block text-[13px] font-medium truncate"
                                      [class.text-white]="message.senderUserId === currentUserId">{{ a.fileName }}</span>
                                <span class="block text-[10px] opacity-80">{{ formatFileSize(a.size) || 'Download' }}</span>
                              </span>
                              <i class="pi pi-download text-xs shrink-0 opacity-80"></i>
                            </button>
                          </ng-template>
                        </ng-container>
                      </div>
                    </ng-container>
                  </div>
                  <div class="flex items-center gap-1.5 mt-1 px-1"
                       [class.flex-row-reverse]="message.senderUserId === currentUserId">
                    <span class="text-[11px] text-surface-500 dark:text-surface-400">{{ message.sentTime | date:'shortTime' }}</span>
                    <i *ngIf="message.senderUserId === currentUserId"
                       class="pi text-[12px]"
                       [class.pi-check-circle]="message.isSeen"
                       [class.pi-check]="!message.isSeen"
                       [class.text-indigo-500]="message.isSeen"
                       [class.dark:!text-indigo-400]="message.isSeen"
                       [class.text-surface-400]="!message.isSeen"
                       [title]="message.isSeen ? 'Seen' : 'Sent'"></i>
                    <button *ngIf="message.senderUserId === currentUserId && !message.isSeen"
                            type="button"
                            (click)="deleteMessage(message.messageId)"
                            class="text-[11px] text-red-500 dark:text-red-400 hover:underline">
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
          <div *ngIf="selectedOtherUserId && !selectedGroupId" class="px-5 py-3 border-t border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900">
            <!-- Pending attachments preview -->
            <div *ngIf="pendingAttachments.length > 0" class="flex flex-wrap gap-2 mb-2">
              <div *ngFor="let a of pendingAttachments; let i = index"
                   class="relative flex items-center gap-2 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl pr-3 py-1.5 pl-1.5 max-w-[220px]">
                <img *ngIf="a.previewUrl" [src]="a.previewUrl" [alt]="a.file.name"
                     class="w-10 h-10 rounded-lg object-cover shrink-0" />
                <div *ngIf="!a.previewUrl" class="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-500 shrink-0">
                  <i class="pi pi-file"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] font-medium text-surface-900 dark:text-surface-0 truncate">{{ a.file.name }}</div>
                  <div class="text-[10px] text-surface-500 dark:text-surface-400">{{ formatFileSize(a.file.size) }}</div>
                </div>
                <button type="button" (click)="removePendingAttachment(i)"
                        class="w-5 h-5 rounded-full bg-surface-200 dark:bg-surface-700 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/20 transition flex items-center justify-center"
                        title="Remove">
                  <i class="pi pi-times text-[10px]"></i>
                </button>
              </div>
            </div>
            <form [formGroup]="messageForm" (ngSubmit)="sendMessage()" class="flex items-center gap-3">
              <input #attachmentInput type="file" multiple class="hidden" (change)="onAttachmentsPicked($event)" />
              <button type="button"
                      (click)="attachmentInput.click()"
                      class="w-10 h-10 rounded-full flex items-center justify-center text-surface-500 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition shrink-0"
                      title="Attach">
                <i class="pi pi-paperclip"></i>
              </button>
              <input
                type="text"
                formControlName="messageContent"
                placeholder="Type a message..."
                (keyup.enter)="sendMessage()"
                [disabled]="!isConnected || isSending"
                class="flex-1 px-5 py-3 border border-surface-200 dark:border-surface-600 rounded-full bg-surface-50 dark:bg-surface-800 text-sm text-surface-900 dark:text-surface-0 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 focus:bg-surface-0 dark:focus:bg-surface-800 disabled:opacity-60 disabled:cursor-not-allowed">
              <button
                type="submit"
                [disabled]="!isConnected || isSending || (!messageForm.valid && pendingAttachments.length === 0)"
                style="background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%);"
                class="w-11 h-11 rounded-full text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center shrink-0"
                title="Send">
                <i class="pi pi-send text-sm" *ngIf="!isSending"></i>
                <i class="pi pi-spin pi-spinner text-sm" *ngIf="isSending"></i>
              </button>
            </form>
          </div>

          <!-- Group messages area -->
          <div *ngIf="selectedGroupId" class="flex-1 overflow-y-auto px-6 py-4 flex flex-col messages-area messages-area-dark" #groupMessagesContainer
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
            <ng-container *ngFor="let message of groupMessages; let i = index">
              <div *ngIf="shouldShowGroupDateSeparator(groupMessages, i)" class="flex items-center gap-3 my-3">
                <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700"></div>
                <span class="text-[11px] font-semibold tracking-[0.18em] text-surface-500 dark:text-surface-400 uppercase">{{ getDateLabel(message.sentTime) }}</span>
                <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700"></div>
              </div>

              <!-- System message (e.g. group renamed) -->
              <div *ngIf="!message.isDeleted && isSystemMessage(message.messageContent)"
                   [attr.data-message-id]="message.messageId"
                   class="flex justify-center my-2 px-3">
                <div class="px-3 py-1 rounded-full bg-surface-100 dark:bg-surface-800 text-[11px] text-surface-600 dark:text-surface-400 italic max-w-[85%] text-center">
                  <i class="pi pi-info-circle mr-1 text-[10px]"></i>{{ getSystemMessageText(message.messageContent) }}
                </div>
              </div>

              <div *ngIf="!message.isDeleted && !isSystemMessage(message.messageContent)"
                   [attr.data-message-id]="message.messageId"
                   [class.justify-end]="message.senderUserId === currentUserId"
                   [class.justify-start]="message.senderUserId !== currentUserId"
                   class="chat-message-row flex mb-2 items-end gap-2 rounded-xl px-1 py-0.5 -mx-1 transition-colors">
                <div [class.items-end]="message.senderUserId === currentUserId"
                     [class.items-start]="message.senderUserId !== currentUserId"
                     class="flex flex-col max-w-[70%] min-w-0">
                  <div
                    [class.text-white]="message.senderUserId === currentUserId"
                    [class.rounded-br-md]="message.senderUserId === currentUserId"
                    [class.rounded-bl-md]="message.senderUserId !== currentUserId"
                    [class.bg-white]="message.senderUserId !== currentUserId"
                    [class.dark:!bg-surface-800]="message.senderUserId !== currentUserId"
                    [class.text-surface-900]="message.senderUserId !== currentUserId"
                    [class.dark:!text-surface-0]="message.senderUserId !== currentUserId"
                    [class.shadow]="message.senderUserId !== currentUserId"
                    [style.background]="message.senderUserId === currentUserId ? 'linear-gradient(135deg, #059669 0%, #34d399 100%)' : null"
                    class="px-4 py-2.5 rounded-2xl break-words">
                    <span *ngIf="message.senderUserId !== currentUserId && message.senderUserId" class="block text-xs font-semibold text-emerald-600 dark:text-emerald-300 mb-0.5">{{ getRankAndName(message.senderUserId) }}</span>
                    <p *ngIf="message.messageContent" class="text-[14px] leading-snug break-words max-w-full">{{ message.messageContent }}</p>
                    <ng-container *ngIf="parseAttachments(message.attachments) as atts">
                      <div *ngIf="atts.length > 0" class="flex flex-col gap-2"
                           [class.mt-2]="message.messageContent">
                        <ng-container *ngFor="let a of atts">
                          <button *ngIf="isImageAttachment(a); else groupFileCard"
                                  type="button"
                                  (click)="openImageLightbox(a)"
                                  class="block max-w-[260px] rounded-xl overflow-hidden ring-1 ring-black/10 hover:opacity-90 transition">
                            <img *ngIf="getAttachmentImageUrl(a) as src" [src]="src" [alt]="a.fileName"
                                 class="block w-full h-auto max-h-[260px] object-cover" />
                            <div *ngIf="!getAttachmentImageUrl(a)" class="w-[200px] h-[140px] flex items-center justify-center bg-surface-100 dark:bg-surface-700">
                              <i class="pi pi-spin pi-spinner text-surface-400"></i>
                            </div>
                          </button>
                          <ng-template #groupFileCard>
                            <button type="button"
                                    (click)="downloadAttachment(a, $event)"
                                    class="flex items-center gap-2 px-3 py-2 rounded-xl ring-1 hover:opacity-90 transition text-left max-w-[260px]"
                                    [class.bg-white\/15]="message.senderUserId === currentUserId"
                                    [class.ring-white\/25]="message.senderUserId === currentUserId"
                                    [class.bg-surface-100]="message.senderUserId !== currentUserId"
                                    [class.dark:!bg-surface-700]="message.senderUserId !== currentUserId"
                                    [class.ring-surface-200]="message.senderUserId !== currentUserId"
                                    [class.dark:!ring-surface-600]="message.senderUserId !== currentUserId">
                              <i class="pi pi-file text-base shrink-0"
                                 [class.text-white]="message.senderUserId === currentUserId"
                                 [class.text-emerald-500]="message.senderUserId !== currentUserId"></i>
                              <span class="flex-1 min-w-0">
                                <span class="block text-[13px] font-medium truncate"
                                      [class.text-white]="message.senderUserId === currentUserId">{{ a.fileName }}</span>
                                <span class="block text-[10px] opacity-80">{{ formatFileSize(a.size) || 'Download' }}</span>
                              </span>
                              <i class="pi pi-download text-xs shrink-0 opacity-80"></i>
                            </button>
                          </ng-template>
                        </ng-container>
                      </div>
                    </ng-container>
                  </div>
                  <div class="flex items-center gap-1.5 mt-1 px-1"
                       [class.flex-row-reverse]="message.senderUserId === currentUserId">
                    <span class="text-[11px] text-surface-500 dark:text-surface-400">{{ message.sentTime | date:'shortTime' }}</span>
                    <i *ngIf="message.senderUserId === currentUserId"
                       class="pi text-[12px]"
                       [class.pi-check-circle]="message.isSeen"
                       [class.pi-check]="!message.isSeen"
                       [class.text-emerald-500]="message.isSeen"
                       [class.dark:!text-emerald-400]="message.isSeen"
                       [class.text-surface-400]="!message.isSeen"
                       [title]="message.isSeen ? 'Seen' : 'Sent'"></i>
                    <button *ngIf="message.senderUserId === currentUserId && !message.isSeen"
                            type="button"
                            (click)="deleteGroupMessage(message.messageId)"
                            class="text-[11px] text-red-500 dark:text-red-400 hover:underline">
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
          <div *ngIf="selectedGroupId" class="px-5 py-3 border-t border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900">
            <!-- Pending attachments preview -->
            <div *ngIf="pendingAttachments.length > 0" class="flex flex-wrap gap-2 mb-2">
              <div *ngFor="let a of pendingAttachments; let i = index"
                   class="relative flex items-center gap-2 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl pr-3 py-1.5 pl-1.5 max-w-[220px]">
                <img *ngIf="a.previewUrl" [src]="a.previewUrl" [alt]="a.file.name"
                     class="w-10 h-10 rounded-lg object-cover shrink-0" />
                <div *ngIf="!a.previewUrl" class="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                  <i class="pi pi-file"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] font-medium text-surface-900 dark:text-surface-0 truncate">{{ a.file.name }}</div>
                  <div class="text-[10px] text-surface-500 dark:text-surface-400">{{ formatFileSize(a.file.size) }}</div>
                </div>
                <button type="button" (click)="removePendingAttachment(i)"
                        class="w-5 h-5 rounded-full bg-surface-200 dark:bg-surface-700 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/20 transition flex items-center justify-center"
                        title="Remove">
                  <i class="pi pi-times text-[10px]"></i>
                </button>
              </div>
            </div>
            <form [formGroup]="groupMessageForm" (ngSubmit)="sendGroupMessage()" class="flex items-center gap-3">
              <input #groupAttachmentInput type="file" multiple class="hidden" (change)="onAttachmentsPicked($event)" />
              <button type="button"
                      (click)="groupAttachmentInput.click()"
                      class="w-10 h-10 rounded-full flex items-center justify-center text-surface-500 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition shrink-0"
                      title="Attach">
                <i class="pi pi-paperclip"></i>
              </button>
              <input
                type="text"
                formControlName="messageContent"
                placeholder="Type a message to the group..."
                (keyup.enter)="sendGroupMessage()"
                [disabled]="!isConnected || isSendingGroup"
                class="flex-1 px-5 py-3 border border-surface-200 dark:border-surface-600 rounded-full bg-surface-50 dark:bg-surface-800 text-sm text-surface-900 dark:text-surface-0 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 focus:bg-surface-0 dark:focus:bg-surface-800 disabled:opacity-60 disabled:cursor-not-allowed">
              <button
                type="submit"
                [disabled]="!isConnected || isSendingGroup || (!groupMessageForm.valid && pendingAttachments.length === 0)"
                style="background: linear-gradient(135deg, #059669 0%, #34d399 100%);"
                class="w-11 h-11 rounded-full text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center shrink-0"
                title="Send">
                <i class="pi pi-send text-sm" *ngIf="!isSendingGroup"></i>
                <i class="pi pi-spin pi-spinner text-sm" *ngIf="isSendingGroup"></i>
              </button>
            </form>
          </div>
        </ng-container>

        <!-- No Selection State -->
        <ng-template #noSelection>
          <div class="flex-1 flex items-center justify-center messages-area messages-area-dark">
            <div class="text-center px-6">
              <div class="w-16 h-16 mx-auto rounded-2xl bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center text-indigo-500">
                <i class="pi pi-comments text-2xl"></i>
              </div>
              <p class="mt-3 text-surface-700 dark:text-surface-200 font-semibold">Your messages</p>
              <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">Select a conversation to start chatting.</p>
            </div>
          </div>
        </ng-template>
      </div>

      <!-- Select User to Chat Modal -->
      <div *ngIf="showSelectUserModal" class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
        <div class="bg-surface-0 dark:bg-surface-900 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-700 p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
          <div class="font-bold text-lg text-surface-900 dark:text-surface-0 mb-1">Chat with a user</div>
          <p class="text-sm text-surface-500 dark:text-surface-400 mb-3">Select a user to start a private conversation.</p>
          <div class="relative mb-3">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm"></i>
            <input
              type="text"
              [(ngModel)]="chatUsersSearch"
              placeholder="Search by name, rank or username..."
              class="w-full pl-9 pr-3 py-2.5 border border-surface-200 dark:border-surface-600 rounded-full bg-surface-50 dark:bg-surface-800 text-sm text-surface-900 dark:text-surface-0 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 focus:bg-surface-0 dark:focus:bg-surface-800">
          </div>
          <div *ngIf="loadingChatUsers" class="flex justify-center py-8">
            <span class="text-surface-500 dark:text-surface-400">Loading users...</span>
          </div>
          <div *ngIf="!loadingChatUsers && chatUsers.length === 0" class="py-6 text-center text-surface-500 dark:text-surface-400">
            No other users found.
          </div>
          <div *ngIf="!loadingChatUsers && chatUsers.length > 0 && filteredChatUsers().length === 0" class="py-6 text-center text-surface-500 dark:text-surface-400 text-sm">
            No users match "{{ chatUsersSearch }}".
          </div>
          <div *ngIf="!loadingChatUsers && filteredChatUsers().length > 0" class="flex-1 overflow-y-auto pr-1 space-y-1">
            <button
              *ngFor="let user of filteredChatUsers()"
              (click)="startChatWithUser(user)"
              type="button"
              class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-surface-200 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition">
              <div class="relative shrink-0">
                <img *ngIf="getUserAvatarImage(user.userId) as imgUrl; else selectUserLetter"
                     [src]="imgUrl" alt=""
                     class="w-10 h-10 rounded-xl object-cover bg-surface-100 dark:bg-surface-700" />
                <ng-template #selectUserLetter>
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm"
                       [style.background]="getAvatarColor(user.userId)">
                    {{ getLastNameInitial(user.userId) }}
                  </div>
                </ng-template>
                <span *ngIf="isOnline(user.userId)"
                      title="Online"
                      class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface-0 dark:border-surface-900"></span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-[13px] leading-tight text-surface-900 dark:text-surface-0 truncate">{{ getRankAndName(user.userId) }}</div>
                <div class="text-[10px] text-surface-500 dark:text-surface-400 truncate leading-tight mt-0.5">{{ user.userName || user.userId }}</div>
              </div>
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
          <p class="text-sm text-surface-500 dark:text-surface-400 mb-3">Enter a name and select members.</p>
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
            <div *ngIf="!loadingChatUsers && chatUsers.length > 0" class="flex-1 overflow-y-auto border border-surface-200 dark:border-surface-600 rounded-lg p-2 max-h-64 space-y-1">
              <label *ngFor="let user of chatUsers" class="flex items-center gap-2 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 rounded px-2 py-1.5">
                <input type="checkbox" [checked]="createGroupSelectedUserIds.includes(user.userId)" (change)="toggleCreateGroupUser(user.userId)">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-xs shrink-0"
                     [style.background]="getAvatarColor(user.userId)">
                  {{ getInitials(getRankAndName(user.userId)) }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-semibold text-surface-900 dark:text-surface-0 truncate">
                    {{ getRankAndName(user.userId) }}
                    <span class="text-[11px] font-normal text-surface-500 dark:text-surface-400">({{ user.userName || user.email || user.userId }})</span>
                  </div>
                </div>
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
      <!-- Group info modal (info icon in group chat header): members list, add, remove -->
      <p-dialog
        [(visible)]="showGroupInfoModal"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [dismissableMask]="true"
        [closeOnEscape]="true"
        [style]="{ width: '92vw', maxWidth: '480px', maxHeight: '90vh' }"
        [contentStyle]="{ padding: '0', maxHeight: '78vh', overflowY: 'auto' }"
        styleClass="chat-group-info-dialog">
        <ng-template pTemplate="header">
          <div class="flex items-center gap-2 w-full">
            <div class="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white shrink-0">
              <i class="pi pi-users text-sm"></i>
            </div>
            <div class="min-w-0">
              <div class="text-sm font-bold text-surface-900 dark:text-surface-0 truncate">{{ selectedGroup?.groupName }}</div>
              <div class="text-[11px] text-surface-500 dark:text-surface-400">{{ groupMembers.length }} members</div>
            </div>
          </div>
        </ng-template>

        <!-- Tabs: Members | Add Member -->
        <div class="px-4 pt-3 bg-surface-0 dark:bg-surface-900 sticky top-0 z-10">
          <div class="flex rounded-full bg-surface-100 dark:bg-surface-800 p-1">
            <button type="button"
                    (click)="groupInfoTab = 'members'"
                    [class.bg-white]="groupInfoTab === 'members'"
                    [class.dark:!bg-surface-700]="groupInfoTab === 'members'"
                    [class.shadow-sm]="groupInfoTab === 'members'"
                    [class.text-surface-900]="groupInfoTab === 'members'"
                    [class.dark:!text-surface-0]="groupInfoTab === 'members'"
                    [class.text-surface-600]="groupInfoTab !== 'members'"
                    class="flex-1 py-1.5 rounded-full text-xs font-semibold transition">
              Members
            </button>
            <button type="button"
                    *ngIf="isCurrentUserGroupAdmin()"
                    (click)="openAddMembers()"
                    [class.bg-white]="groupInfoTab === 'add'"
                    [class.dark:!bg-surface-700]="groupInfoTab === 'add'"
                    [class.shadow-sm]="groupInfoTab === 'add'"
                    [class.text-surface-900]="groupInfoTab === 'add'"
                    [class.dark:!text-surface-0]="groupInfoTab === 'add'"
                    [class.text-surface-600]="groupInfoTab !== 'add'"
                    class="flex-1 py-1.5 rounded-full text-xs font-semibold transition">
              Add Member
            </button>
          </div>
        </div>

        <!-- Members tab -->
        <div *ngIf="groupInfoTab === 'members'" class="px-4 py-3">
          <!-- Group name (admin can rename) -->
          <div class="mb-3 px-3 py-2.5 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
            <div class="flex items-center justify-between gap-2 mb-1">
              <div class="text-[10px] font-bold tracking-[0.12em] text-surface-500 dark:text-surface-400">GROUP NAME</div>
              <button *ngIf="isCurrentUserGroupAdmin() && !renamingGroup"
                      type="button"
                      (click)="beginRenameGroup()"
                      class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                <i class="pi pi-pencil text-[10px] mr-1"></i>Rename
              </button>
            </div>
            <div *ngIf="!renamingGroup" class="text-sm font-semibold text-surface-900 dark:text-surface-0 truncate">{{ selectedGroup?.groupName }}</div>
            <div *ngIf="renamingGroup" class="flex items-center gap-2">
              <input type="text"
                     [(ngModel)]="renameGroupName"
                     (keyup.enter)="submitRenameGroup()"
                     (keyup.escape)="cancelRenameGroup()"
                     [disabled]="submittingRename"
                     maxlength="200"
                     class="flex-1 px-3 py-1.5 border border-surface-200 dark:border-surface-600 rounded-lg bg-surface-0 dark:bg-surface-900 text-sm text-surface-900 dark:text-surface-0 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                     placeholder="New group name">
              <button type="button"
                      (click)="submitRenameGroup()"
                      [disabled]="!renameGroupName?.trim() || submittingRename || renameGroupName.trim() === selectedGroup?.groupName"
                      class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-xs font-medium">
                <i class="pi pi-spin pi-spinner mr-1" *ngIf="submittingRename"></i>
                Save
              </button>
              <button type="button"
                      (click)="cancelRenameGroup()"
                      [disabled]="submittingRename"
                      class="px-3 py-1.5 border border-surface-300 dark:border-surface-600 rounded-lg text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition text-xs disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>

          <div *ngIf="loadingGroupMembers" class="py-6 text-center text-sm text-surface-500 dark:text-surface-400">
            <i class="pi pi-spin pi-spinner mr-2"></i>Loading members...
          </div>
          <div *ngIf="!loadingGroupMembers && groupMembers.length === 0" class="py-6 text-center text-sm text-surface-500 dark:text-surface-400">
            No members.
          </div>
          <div *ngIf="!loadingGroupMembers && groupMembers.length > 0" class="space-y-1">
            <div *ngFor="let m of groupMembers"
                 class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition">
              <div class="relative shrink-0">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm"
                     [style.background]="getAvatarColor(m.userId)">
                  {{ getInitials(getRankAndName(m.userId)) }}
                </div>
                <span *ngIf="isOnline(m.userId)"
                      title="Online"
                      class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface-0 dark:border-surface-900"></span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-semibold text-surface-900 dark:text-surface-0 truncate">
                  {{ getRankAndName(m.userId) }}
                  <span *ngIf="m.userId === currentUserId" class="text-[10px] font-medium text-surface-500 dark:text-surface-400">(You)</span>
                </div>
                <div class="text-[10px] text-surface-500 dark:text-surface-400 truncate">{{ m.userName || m.email || m.userId }}</div>
              </div>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                    [class.bg-indigo-50]="m.role === 'Admin'"
                    [class.text-indigo-700]="m.role === 'Admin'"
                    [class.dark:!bg-indigo-500\/15]="m.role === 'Admin'"
                    [class.dark:!text-indigo-300]="m.role === 'Admin'"
                    [class.bg-surface-100]="m.role !== 'Admin'"
                    [class.text-surface-600]="m.role !== 'Admin'"
                    [class.dark:!bg-surface-700]="m.role !== 'Admin'"
                    [class.dark:!text-surface-300]="m.role !== 'Admin'">{{ m.role }}</span>
              <button *ngIf="isCurrentUserGroupAdmin() && m.userId !== currentUserId"
                      type="button"
                      (click)="confirmRemoveMember(m)"
                      [disabled]="removingMemberId === m.userId"
                      class="w-8 h-8 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15 transition shrink-0 disabled:opacity-50"
                      title="Remove member">
                <i class="pi pi-user-minus text-sm" *ngIf="removingMemberId !== m.userId"></i>
                <i class="pi pi-spin pi-spinner text-sm" *ngIf="removingMemberId === m.userId"></i>
              </button>
            </div>
          </div>

          <!-- Danger zone: delete group (creator only) -->
          <div *ngIf="isCurrentUserGroupCreator()" class="mt-4 pt-3 border-t border-red-200 dark:border-red-500/30">
            <div class="text-[10px] font-bold tracking-[0.12em] text-red-600 dark:text-red-400 mb-2">DANGER ZONE</div>
            <div class="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30">
              <div class="min-w-0">
                <div class="text-[13px] font-semibold text-red-700 dark:text-red-300">Delete this group</div>
                <p class="text-[11px] text-red-700/80 dark:text-red-300/80 leading-snug">Members will lose access immediately. Message history is preserved on the server.</p>
              </div>
              <button type="button"
                      (click)="confirmDeleteGroup()"
                      [disabled]="deletingGroup"
                      class="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-xs font-semibold shrink-0">
                <i class="pi pi-spin pi-spinner mr-1" *ngIf="deletingGroup"></i>
                <i class="pi pi-trash mr-1" *ngIf="!deletingGroup"></i>
                Delete
              </button>
            </div>
          </div>
        </div>

        <!-- Add Member tab -->
        <div *ngIf="groupInfoTab === 'add'" class="px-4 py-3">
          <p class="text-xs text-surface-500 dark:text-surface-400 mb-2">Select users to add to this group.</p>
          <div class="relative mb-2">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
            <input
              type="text"
              [(ngModel)]="addMembersSearch"
              placeholder="Search by name or username..."
              class="w-full pl-8 pr-3 py-2 border border-surface-200 dark:border-surface-600 rounded-full bg-surface-50 dark:bg-surface-800 text-xs text-surface-900 dark:text-surface-0 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400">
          </div>
          <div *ngIf="loadingChatUsers" class="py-6 text-center text-sm text-surface-500 dark:text-surface-400">
            <i class="pi pi-spin pi-spinner mr-2"></i>Loading users...
          </div>
          <div *ngIf="!loadingChatUsers && addableUsers().length === 0" class="py-6 text-center text-sm text-surface-500 dark:text-surface-400">
            {{ addMembersSearch?.trim() ? 'No matches.' : 'Everyone is already a member.' }}
          </div>
          <div *ngIf="!loadingChatUsers && addableUsers().length > 0" class="max-h-64 overflow-y-auto border border-surface-200 dark:border-surface-600 rounded-lg p-1 space-y-0.5">
            <label *ngFor="let u of addableUsers()"
                   class="flex items-center gap-2 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 rounded px-2 py-1.5">
              <input type="checkbox"
                     [checked]="addMembersSelectedUserIds.includes(u.userId)"
                     (change)="toggleAddMemberUser(u.userId)">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-xs shrink-0"
                   [style.background]="getAvatarColor(u.userId)">
                {{ getInitials(getRankAndName(u.userId)) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[12px] font-semibold text-surface-900 dark:text-surface-0 truncate">{{ getRankAndName(u.userId) }}</div>
                <div class="text-[10px] text-surface-500 dark:text-surface-400 truncate">{{ u.userName || u.email }}</div>
              </div>
            </label>
          </div>
          <div class="flex gap-2 mt-3">
            <button type="button"
                    (click)="submitAddMembers()"
                    [disabled]="addMembersSelectedUserIds.length === 0 || addingMembers"
                    class="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium">
              <i class="pi pi-spin pi-spinner mr-1" *ngIf="addingMembers"></i>
              {{ addingMembers ? 'Adding...' : 'Add selected' }}
            </button>
            <button type="button"
                    (click)="groupInfoTab = 'members'"
                    class="px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition text-sm">
              Cancel
            </button>
          </div>
        </div>
      </p-dialog>

      <!-- User profile info modal (info icon in chat header) -->
      <p-dialog
        [(visible)]="showProfileInfoModal"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [dismissableMask]="true"
        [closeOnEscape]="true"
        [style]="{ width: '92vw', maxWidth: '420px', maxHeight: '90vh' }"
        [contentStyle]="{ padding: '0', maxHeight: '75vh', overflowY: 'auto' }"
        styleClass="chat-profile-info-dialog">
        <ng-template pTemplate="header">
          <div class="text-base font-bold text-surface-900 dark:text-surface-0">User info</div>
        </ng-template>
        <ng-container *ngIf="getUserProfile(profileInfoUserId) as p; else loadingProfile">
          <div class="relative px-5 pt-5 pb-4 bg-gradient-to-br from-indigo-500 to-indigo-400 text-white text-center">
            <ng-container *ngIf="p.profileImageUrl; else letterAvatar">
              <img [src]="p.profileImageUrl" alt="Profile"
                   class="w-16 h-16 rounded-full object-cover mx-auto ring-2 ring-white/40 shadow" />
            </ng-container>
            <ng-template #letterAvatar>
              <div class="w-16 h-16 rounded-full mx-auto ring-2 ring-white/40 shadow flex items-center justify-center text-xl font-bold bg-white/15">
                {{ getInitials(getRankAndName(profileInfoUserId!)) }}
              </div>
            </ng-template>
            <div class="mt-2 text-base font-semibold leading-tight">{{ p.rank || '' }} {{ p.fullName || getChatUserName(profileInfoUserId!) }}</div>
            <div class="text-[11px] opacity-90 leading-tight">{{ getChatUserName(profileInfoUserId!) }}</div>
          </div>
          <div class="px-5 py-3 bg-surface-0 dark:bg-surface-900">
            <div class="flex justify-between items-center text-[13px] py-1.5">
              <span class="text-surface-500 dark:text-surface-400">Rank</span>
              <span class="font-semibold text-surface-900 dark:text-surface-0 text-right">{{ p.rank || '—' }}</span>
            </div>
            <div class="border-t border-surface-200 dark:border-surface-700"></div>
            <div class="flex justify-between items-center text-[13px] py-1.5">
              <span class="text-surface-500 dark:text-surface-400">Name</span>
              <span class="font-semibold text-surface-900 dark:text-surface-0 text-right">{{ p.fullName || '—' }}</span>
            </div>
            <div class="border-t border-surface-200 dark:border-surface-700"></div>
            <div class="flex justify-between items-center text-[13px] py-1.5">
              <span class="text-surface-500 dark:text-surface-400">Service ID</span>
              <span class="font-mono font-semibold text-surface-900 dark:text-surface-0 text-right">{{ p.serviceId || '—' }}</span>
            </div>
            <div class="border-t border-surface-200 dark:border-surface-700"></div>
            <div class="flex justify-between items-center text-[13px] py-1.5">
              <span class="text-surface-500 dark:text-surface-400">RAB ID</span>
              <span class="font-mono font-semibold text-surface-900 dark:text-surface-0 text-right">{{ p.rabId || '—' }}</span>
            </div>
            <div class="border-t border-surface-200 dark:border-surface-700"></div>
            <div class="flex justify-between items-center text-[13px] py-1.5">
              <span class="text-surface-500 dark:text-surface-400">Present Unit</span>
              <span class="font-semibold text-surface-900 dark:text-surface-0 text-right">{{ p.rabUnit || '—' }}</span>
            </div>
          </div>
        </ng-container>
        <ng-template #loadingProfile>
          <div class="px-6 py-10 text-center text-sm text-surface-500 dark:text-surface-400">
            <i class="pi pi-spin pi-spinner mr-2"></i>Loading profile...
          </div>
        </ng-template>
      </p-dialog>

      <!-- Image lightbox for clicked image attachments -->
      <p-dialog
        [(visible)]="showImageLightbox"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [dismissableMask]="true"
        [closeOnEscape]="true"
        [style]="{ width: '92vw', maxWidth: '900px', maxHeight: '92vh' }"
        [contentStyle]="{ padding: '0', background: 'transparent', overflow: 'auto' }"
        styleClass="chat-image-lightbox-dialog">
        <ng-template pTemplate="header">
          <div class="flex items-center gap-3 w-full">
            <div class="text-sm font-semibold text-surface-900 dark:text-surface-0 truncate max-w-[55vw]">{{ lightboxImageName || 'Image' }}</div>
            <button *ngIf="lightboxAttachment"
                    type="button"
                    (click)="downloadAttachment(lightboxAttachment, $event)"
                    class="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 px-2.5 py-1.5 rounded-full transition"
                    title="Download image">
              <i class="pi pi-download text-[11px]"></i>
              <span>Download</span>
            </button>
          </div>
        </ng-template>
        <img *ngIf="lightboxImageUrl" [src]="lightboxImageUrl" [alt]="lightboxImageName || ''"
             class="block max-w-full max-h-[80vh] mx-auto" />
      </p-dialog>

      <p-confirmDialog />
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
    :host ::ng-deep .chat-profile-info-dialog .p-dialog-content { padding: 0; }
    :host ::ng-deep .chat-profile-info-dialog .p-dialog-header { padding: 0.85rem 1.25rem; border-bottom: 1px solid var(--p-surface-200, #e5e7eb); }
    :host-context(.app-dark) ::ng-deep .chat-profile-info-dialog .p-dialog-header { border-bottom-color: var(--p-surface-700, #334155); }
    .chat-message-row.chat-message-highlight { animation: chatMessageHighlight 2.2s ease; }
    @keyframes chatMessageHighlight {
      0%   { background-color: rgba(99, 102, 241, 0.28); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15); }
      60%  { background-color: rgba(99, 102, 241, 0.18); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.10); }
      100% { background-color: transparent; box-shadow: none; }
    }
  `]
})
export class ChatContainerComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer', { static: false }) messagesContainer?: ElementRef<HTMLDivElement>;

  canInsert = true;
  canUpdate = true;
  canDelete = true;

  directConversations: DirectConversation[] = [];
  filteredDirectConversations: DirectConversation[] = [];
  selectedOtherUserId: string | null = null;
  /** Display list of messages. */
  messages: Array<{ messageId: number; senderUserId: string; senderName?: string; receiverUserId?: string; messageContent: string; attachments?: string | null; sentTime: Date; isSeen: boolean; isDeleted: boolean }> = [];
  currentUserId: string = '';
  isConnected: boolean = false;
  /** Live set of online userIds from the chat hub. */
  onlineUserIds: Set<string> = new Set<string>();
  /** Shared unread overlay (kept in sync by the chat service). */
  private unreadOverlay: Record<string, number> = {};
  /** Shared group unread overlay (kept in sync by the chat service). */
  private groupUnreadOverlay: Record<number, number> = {};
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
  chatUsersSearch: string = '';

  /** Latest backend message-content search results for the conversation-list search input. */
  messageSearchResults: DirectMessageSearchResult[] = [];
  messageSearchLoading = false;
  private searchText$ = new Subject<string>();
  /** When set, after loadDirectMessages finishes the view scrolls to and briefly highlights this message. */
  private pendingScrollToMessageId: number | null = null;
  /** Caps how many older pages resolvePendingScroll will walk back before giving up. */
  private pendingScrollPagesLeft = 0;
  /** Memoised parsed attachment arrays keyed by the raw JSON string. Avoids JSON.parse on every CD cycle. */
  private attachmentParseCache = new Map<string, ChatAttachment[]>();

  /** Files queued in the input bar awaiting send. Each carries an in-memory preview URL for images. */
  pendingAttachments: Array<{ file: File; previewUrl: string | null }> = [];
  /** Cached blob URLs for already-sent attachment previews keyed by fileId. */
  private attachmentBlobUrls: Record<number, string> = {};
  /** Guards against re-firing downloadFile during pending requests (template calls getAttachmentImageUrl every CD cycle). */
  private attachmentFetchInflight: Record<number, boolean> = {};
  /** Lightbox state for clicked image attachments. */
  showImageLightbox = false;
  lightboxImageUrl: string | null = null;
  lightboxImageName: string | null = null;
  lightboxAttachment: ChatAttachment | null = null;
  private destroy$ = new Subject<void>();
  private shouldScroll = false;

  viewMode: 'direct' | 'groups' = 'direct';
  userGroups: GroupDto[] = [];
  loadingGroups = false;
  selectedGroupId: number | null = null;
  selectedGroup: GroupDto | null = null;
  groupMessages: Array<{ messageId: number; groupId: number; senderUserId: string; senderUserName?: string; messageContent: string; attachments?: string | null; sentTime: Date; isDeleted: boolean; isSeen?: boolean }> = [];
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

  /** Per-user employee profile cache (rank, name, IDs, unit, profile image blob URL). */
  private userProfiles: Record<string, {
    rank: string;
    fullName: string;
    serviceId?: string | null;
    rabId?: string | null;
    rabUnit?: string | null;
    profileImageUrl?: string | null;
  }> = {};
  private profileFetchInflight: Record<string, boolean> = {};

  /** State for the "user info" modal triggered by the (i) icon in the chat header. */
  showProfileInfoModal = false;
  profileInfoUserId: string | null = null;

  /** State for the group info modal triggered by the (i) icon in the group chat header. */
  showGroupInfoModal = false;
  groupInfoTab: 'members' | 'add' = 'members';
  groupMembers: GroupMemberDto[] = [];
  loadingGroupMembers = false;
  removingMemberId: string | null = null;
  addMembersSelectedUserIds: string[] = [];
  addMembersSearch = '';
  addingMembers = false;
  renamingGroup = false;
  renameGroupName = '';
  submittingRename = false;
  deletingGroup = false;

  constructor(
    private chatService: ChatService,
    private fb: FormBuilder,
    private confirmationService: ConfirmationService,
    private _router: Router,
    private _userMenuService: UserMenuService,
    private mappingService: IdentityUserMappingService,
    private servingMembersService: ServingMembersService,
    private empService: EmpService
  ) {
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

  /** Rank + employee full name (e.g. "Major Aziz Rahman"). Falls back to chat user name / userId. */
  getRankAndName(userId: string): string {
    const p = this.userProfiles[userId];
    if (p) {
      const composed = `${p.rank ?? ''} ${p.fullName ?? ''}`.trim();
      if (composed) return composed;
    }
    return this.getDisplayName(userId);
  }

  /** True when the chat hub reports this user is currently connected. */
  isOnline(userId: string): boolean {
    return !!userId && this.onlineUserIds.has(userId);
  }

  /** Effective unread count for a conversation: max(server-reported, locally-tracked overlay). */
  getUnreadCount(conv: DirectConversation): number {
    const overlay = this.unreadOverlay[conv.otherUserId] ?? 0;
    const server = conv.unreadCount ?? 0;
    return Math.max(overlay, server);
  }

  /** Effective unread count for a group: max(server-reported, locally-tracked overlay). */
  getGroupUnreadCount(g: GroupDto): number {
    const overlay = this.groupUnreadOverlay[g.groupId] ?? 0;
    const server = g.unreadCount ?? 0;
    return Math.max(overlay, server);
  }

  /** Login/chat username; used as the small secondary line under rank+name. */
  getChatUserName(userId: string): string {
    return this.chatUsers.find(u => u.userId === userId)?.userName
      || this.userDisplayNames[userId]
      || userId;
  }

  /** Lazy-fetches employeeId then profile (rank, name, IDs, unit, profile image) and caches it. */
  ensureUserProfile(userId: string): void {
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
        this.userProfiles[userId] = {
          rank,
          fullName,
          serviceId: profile.serviceId ?? null,
          rabId: profile.rabId ?? null,
          rabUnit: profile.rabUnit ?? null,
          profileImageUrl: null
        };
        this.loadUserProfileImage(userId, profile.profileImages ?? null);
      },
      error: () => { this.profileFetchInflight[userId] = false; }
    });
  }

  /** Pulls the first profile image blob referenced in profileImages JSON and caches a blob URL on the user profile. */
  private loadUserProfileImage(userId: string, json: string | null): void {
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
    this.empService.downloadFile(fileId).pipe(
      catchError(() => of(null)),
      takeUntil(this.destroy$)
    ).subscribe((blob) => {
      if (!blob || (blob as Blob).size === 0) return;
      const profile = this.userProfiles[userId];
      if (!profile) return;
      if (profile.profileImageUrl) URL.revokeObjectURL(profile.profileImageUrl);
      profile.profileImageUrl = URL.createObjectURL(blob as Blob);
    });
  }

  // ----- Attachments -----

  onAttachmentsPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i);
      if (!f) continue;
      const isImage = f.type.startsWith('image/');
      const previewUrl = isImage ? URL.createObjectURL(f) : null;
      this.pendingAttachments.push({ file: f, previewUrl });
    }
    input.value = '';
  }

  removePendingAttachment(index: number): void {
    const item = this.pendingAttachments[index];
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    this.pendingAttachments.splice(index, 1);
  }

  /** Parses the server's attachments JSON string into an array. Memoised per raw JSON string so CD-tick re-evaluation is cheap. */
  parseAttachments(json: string | null | undefined): ChatAttachment[] {
    if (!json) return [];
    const cached = this.attachmentParseCache.get(json);
    if (cached) return cached;
    let result: ChatAttachment[] = [];
    try {
      const arr = JSON.parse(json) as Array<{ FileId?: number; fileId?: number; FileName?: string; fileName?: string; ContentType?: string; contentType?: string; Size?: number; size?: number }>;
      if (Array.isArray(arr)) {
        result = arr.map(a => ({
          fileId: (a.FileId ?? a.fileId ?? 0) as number,
          fileName: (a.FileName ?? a.fileName ?? '') as string,
          contentType: a.ContentType ?? a.contentType,
          size: a.Size ?? a.size
        })).filter(a => a.fileId > 0);
      }
    } catch {
      result = [];
    }
    this.attachmentParseCache.set(json, result);
    return result;
  }

  isImageAttachment(a: ChatAttachment): boolean {
    const ct = (a.contentType ?? '').toLowerCase();
    if (ct.startsWith('image/')) return true;
    const name = (a.fileName ?? '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /** Lazily fetches and caches a blob URL for an attachment image, returns the URL synchronously once available. */
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
    });
    return null;
  }

  openImageLightbox(a: ChatAttachment): void {
    this.lightboxAttachment = a;
    const url = this.getAttachmentImageUrl(a);
    if (!url) {
      // Force a fetch then open when ready.
      this.empService.downloadFile(a.fileId).pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      ).subscribe((blob) => {
        if (!blob || (blob as Blob).size === 0) return;
        const objectUrl = URL.createObjectURL(blob as Blob);
        this.attachmentBlobUrls[a.fileId] = objectUrl;
        this.lightboxImageUrl = objectUrl;
        this.lightboxImageName = a.fileName;
        this.showImageLightbox = true;
      });
      return;
    }
    this.lightboxImageUrl = url;
    this.lightboxImageName = a.fileName;
    this.showImageLightbox = true;
  }

  downloadAttachment(a: ChatAttachment, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    console.debug('[chat] downloadAttachment clicked for', a);
    if (!a?.fileId) {
      console.warn('[chat] downloadAttachment: no fileId on attachment', a);
      return;
    }
    // If we already have a cached blob URL for this file, reuse it instead of re-fetching.
    const cached = this.attachmentBlobUrls[a.fileId];
    if (cached) {
      console.debug('[chat] downloadAttachment: using cached blob URL', cached);
      this.triggerDownloadFromUrl(cached, a.fileName || `attachment-${a.fileId}`);
      return;
    }
    this.empService.downloadFile(a.fileId).subscribe({
      next: (blob) => {
        console.debug('[chat] downloadAttachment: blob received', { size: (blob as Blob)?.size, type: (blob as Blob)?.type });
        if (!blob || (blob as Blob).size === 0) {
          console.warn('[chat] downloadAttachment: empty blob');
          return;
        }
        const url = URL.createObjectURL(blob as Blob);
        this.attachmentBlobUrls[a.fileId] = url;
        this.triggerDownloadFromUrl(url, a.fileName || `attachment-${a.fileId}`);
      },
      error: (err) => {
        console.error('[chat] downloadAttachment: HTTP error', err);
      }
    });
  }

  /** Triggers a browser file download for a given blob URL. Tries file-saver first, falls back to manual anchor click. */
  private triggerDownloadFromUrl(blobUrl: string, fileName: string): void {
    try {
      // file-saver works with both Blob and a fresh blob URL via fetch — easiest is fetch -> blob -> saveAs
      // but here we already have a blob URL; manual anchor is more reliable for blob URLs.
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.rel = 'noopener';
      link.target = '_self';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) document.body.removeChild(link);
      }, 100);
      console.debug('[chat] downloadAttachment: triggered anchor click for', fileName);
    } catch (err) {
      console.error('[chat] triggerDownloadFromUrl failed', err);
      // Last-ditch: try saveAs via fetch
      fetch(blobUrl).then(r => r.blob()).then(b => saveAs(b, fileName)).catch(e => {
        console.error('[chat] saveAs fallback also failed', e);
      });
    }
  }

  /** Returns the cached profile object for the user, or null if not loaded yet. */
  getUserProfile(userId: string | null): {
    rank: string;
    fullName: string;
    serviceId?: string | null;
    rabId?: string | null;
    rabUnit?: string | null;
    profileImageUrl?: string | null;
  } | null {
    if (!userId) return null;
    return this.userProfiles[userId] ?? null;
  }

  openProfileInfo(userId: string | null): void {
    if (!userId) return;
    this.ensureUserProfile(userId);
    this.profileInfoUserId = userId;
    this.showProfileInfoModal = true;
  }

  closeProfileInfo(): void {
    this.showProfileInfoModal = false;
    this.profileInfoUserId = null;
  }

  /** Opens the group info dialog and loads the members list. */
  openGroupInfo(): void {
    if (!this.selectedGroupId) return;
    this.showGroupInfoModal = true;
    this.groupInfoTab = 'members';
    this.addMembersSelectedUserIds = [];
    this.addMembersSearch = '';
    this.loadGroupMembers();
  }

  private loadGroupMembers(): void {
    if (!this.selectedGroupId) return;
    this.loadingGroupMembers = true;
    this.chatService.getGroupMembers(this.selectedGroupId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          this.groupMembers = Array.isArray(list) ? list : [];
          this.loadingGroupMembers = false;
          for (const m of this.groupMembers) this.ensureUserProfile(m.userId);
        },
        error: () => { this.loadingGroupMembers = false; }
      });
  }

  isCurrentUserGroupAdmin(): boolean {
    if (!this.currentUserId || !this.groupMembers?.length) return this.selectedGroup?.myRole === 'Admin';
    const me = this.groupMembers.find(m => m.userId === this.currentUserId);
    return me?.role === 'Admin';
  }

  confirmRemoveMember(member: GroupMemberDto): void {
    if (!this.selectedGroupId) return;
    const name = this.getRankAndName(member.userId);
    this.confirmationService.confirm({
      message: `Remove ${name} from this group?`,
      header: 'Remove member',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Remove', severity: 'danger' },
      accept: () => this.removeMember(member)
    });
  }

  private removeMember(member: GroupMemberDto): void {
    if (!this.selectedGroupId) return;
    this.removingMemberId = member.userId;
    this.chatService.removeGroupMember(this.selectedGroupId, member.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.removingMemberId = null;
          this.groupMembers = this.groupMembers.filter(m => m.userId !== member.userId);
          if (this.selectedGroup) this.selectedGroup.memberCount = Math.max(0, (this.selectedGroup.memberCount || 0) - 1);
          this.loadUserGroups();
        },
        error: () => { this.removingMemberId = null; }
      });
  }

  openAddMembers(): void {
    this.groupInfoTab = 'add';
    this.addMembersSelectedUserIds = [];
    this.addMembersSearch = '';
    if (this.chatUsers.length === 0 && !this.loadingChatUsers) {
      this.loadingChatUsers = true;
      this.chatService.getChatUsers()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (users) => {
            this.chatUsers = users ?? [];
            this.loadingChatUsers = false;
            for (const u of this.chatUsers) this.ensureUserProfile(u.userId);
          },
          error: () => { this.loadingChatUsers = false; }
        });
    } else {
      for (const u of this.chatUsers) this.ensureUserProfile(u.userId);
    }
  }

  /** Users not yet in the group, filtered by the add-member search input. */
  addableUsers(): ChatUserDto[] {
    const memberIds = new Set(this.groupMembers.map(m => m.userId));
    const search = (this.addMembersSearch ?? '').trim().toLowerCase();
    return this.chatUsers.filter(u => {
      if (!u.userId || memberIds.has(u.userId)) return false;
      if (!search) return true;
      const rankName = this.getRankAndName(u.userId).toLowerCase();
      const userName = (u.userName ?? '').toLowerCase();
      const email = (u.email ?? '').toLowerCase();
      return rankName.includes(search) || userName.includes(search) || email.includes(search);
    });
  }

  toggleAddMemberUser(userId: string): void {
    const i = this.addMembersSelectedUserIds.indexOf(userId);
    if (i >= 0) this.addMembersSelectedUserIds = this.addMembersSelectedUserIds.filter(id => id !== userId);
    else this.addMembersSelectedUserIds = [...this.addMembersSelectedUserIds, userId];
  }

  submitAddMembers(): void {
    if (!this.selectedGroupId || this.addMembersSelectedUserIds.length === 0 || this.addingMembers) return;
    this.addingMembers = true;
    this.chatService.addGroupMembers(this.selectedGroupId, this.addMembersSelectedUserIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.addingMembers = false;
          this.addMembersSelectedUserIds = [];
          this.groupInfoTab = 'members';
          this.loadGroupMembers();
          this.loadUserGroups();
        },
        error: () => { this.addingMembers = false; }
      });
  }

  /** True if the current user is the creator of the currently selected group. Creator-only actions (delete) gate on this. */
  isCurrentUserGroupCreator(): boolean {
    return !!this.selectedGroup && !!this.currentUserId && this.selectedGroup.createdByUserId === this.currentUserId;
  }

  beginRenameGroup(): void {
    if (!this.selectedGroup) return;
    this.renameGroupName = this.selectedGroup.groupName ?? '';
    this.renamingGroup = true;
  }

  cancelRenameGroup(): void {
    this.renamingGroup = false;
    this.renameGroupName = '';
  }

  submitRenameGroup(): void {
    if (!this.selectedGroupId || !this.selectedGroup) return;
    const newName = (this.renameGroupName ?? '').trim();
    if (!newName || this.submittingRename) return;
    if (newName === (this.selectedGroup.groupName ?? '').trim()) {
      this.cancelRenameGroup();
      return;
    }
    this.submittingRename = true;
    const renamerDisplayName = this.getRankAndName(this.currentUserId);
    this.chatService.renameGroup(this.selectedGroupId, newName, renamerDisplayName)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.submittingRename = false;
          this.renamingGroup = false;
          this.renameGroupName = '';
          if (this.selectedGroup) this.selectedGroup.groupName = newName;
          this.loadUserGroups();
        },
        error: () => { this.submittingRename = false; }
      });
  }

  confirmDeleteGroup(): void {
    if (!this.selectedGroup) return;
    const name = this.selectedGroup.groupName ?? 'this group';
    this.confirmationService.confirm({
      message: `Delete "${name}"? All members will lose access. Message history is preserved on the server.`,
      header: 'Delete group',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      accept: () => this.deleteGroup()
    });
  }

  private deleteGroup(): void {
    if (!this.selectedGroupId || this.deletingGroup) return;
    const groupId = this.selectedGroupId;
    this.deletingGroup = true;
    this.chatService.deleteGroup(groupId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletingGroup = false;
          this.showGroupInfoModal = false;
          this.handleGroupGone(groupId);
        },
        error: () => { this.deletingGroup = false; }
      });
  }

  /** Closes the group view, clears local state, and refreshes the group list. Used on both local-initiated delete and remote GroupDeleted events. */
  private handleGroupGone(groupId: number): void {
    if (this.selectedGroupId === groupId) {
      this.chatService.leaveGroupHub(groupId).catch(() => {});
      this.selectedGroupId = null;
      this.selectedGroup = null;
      this.groupMessages = [];
      this.chatService.setSelectedGroupId(null);
    }
    this.userGroups = this.userGroups.filter(g => g.groupId !== groupId);
    this.loadUserGroups();
  }

  /** True when the message is an in-channel system notification (rename, etc.). */
  isSystemMessage(content: string | null | undefined): boolean {
    return typeof content === 'string' && content.startsWith('__SYSTEM__:');
  }

  /** Strips the system-message marker prefix so the human-readable text can be rendered. */
  getSystemMessageText(content: string | null | undefined): string {
    if (!content) return '';
    return content.replace(/^__SYSTEM__:/, '');
  }

  /** Strips the system-message marker from group sidebar previews so the user sees plain text (the backend truncates so the prefix may be partly present). */
  formatGroupPreview(preview: string | null | undefined): string {
    if (!preview) return '';
    return preview.replace(/^__SYSTEM__:/, '');
  }

  /** Prefetch rank+name for every user in the direct conversation list. */
  private prefetchConversationProfiles(): void {
    for (const c of this.directConversations) this.ensureUserProfile(c.otherUserId);
  }

  /** Up to two initials from a display name (e.g. "Tanvir Ahmed" -> "TA"). */
  getInitials(name: string): string {
    if (!name || !name.trim()) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /** First character of the last word in the user's full name (e.g. "Md Shariar Kabir" -> "K"). Falls back to the chat username's first char while the employee profile is still loading. */
  getLastNameInitial(userId: string): string {
    const profile = this.userProfiles[userId];
    const fullName = (profile?.fullName ?? '').trim();
    if (fullName) {
      const parts = fullName.split(/\s+/);
      const last = parts[parts.length - 1] ?? '';
      const ch = last.charAt(0).toUpperCase();
      if (ch) return ch;
    }
    const display = this.getDisplayName(userId) ?? '';
    return display.trim().charAt(0).toUpperCase() || '?';
  }

  /** Profile image blob URL for the user, or null if it has not loaded (caller falls back to the colored swatch). */
  getUserAvatarImage(userId: string): string | null {
    if (!userId) return null;
    return this.userProfiles[userId]?.profileImageUrl ?? null;
  }

  /** Deterministic gradient color for an avatar based on the userId/seed. */
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
    const s = seed || '';
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  /** Compact time for the conversation list (e.g. "7:28 PM" today, "Yesterday", or date). */
  getConversationTime(dateLike: string | Date | null | undefined): string {
    if (!dateLike) return '';
    const d = new Date(dateLike);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isSameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (isSameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate();
    if (isYesterday) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  /** "Today" / "Yesterday" / dated label for in-conversation separators. */
  getDateLabel(dateLike: string | Date | null | undefined): string {
    if (!dateLike) return '';
    const d = new Date(dateLike);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isSameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (isSameDay) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate();
    if (isYesterday) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  /** Show a date separator if this message is the first of its day in the list. */
  shouldShowDateSeparator(list: Array<{ sentTime: Date | string }>, index: number): boolean {
    if (index < 0 || index >= list.length) return false;
    if (index === 0) return true;
    const a = new Date(list[index].sentTime);
    const b = new Date(list[index - 1].sentTime);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
    return a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate();
  }

  shouldShowGroupDateSeparator(list: Array<{ sentTime: Date | string }>, index: number): boolean {
    return this.shouldShowDateSeparator(list, index);
  }

  setViewMode(mode: 'direct' | 'groups'): void {
    this.viewMode = mode;
    this.clearPendingAttachments();
    if (mode === 'groups') this.loadUserGroups();
  }

  /** Drops any staged-but-not-sent file attachments and revokes their preview URLs. */
  private clearPendingAttachments(): void {
    for (const p of this.pendingAttachments) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    this.pendingAttachments = [];
  }

  loadUserGroups(): void {
    this.loadingGroups = true;
    this.chatService.getUserGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          this.userGroups = list ?? [];
          if (this.selectedGroupId) {
            const cur = this.userGroups.find(gr => gr.groupId === this.selectedGroupId);
            if (cur) cur.unreadCount = 0;
          }
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
    this.clearPendingAttachments();
    this.chatService.clearGroupUnreadOverlay(g.groupId);
    g.unreadCount = 0;
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
          for (const m of this.groupMessages) if (m.senderUserId) this.ensureUserProfile(m.senderUserId);
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
      attachments: m.attachments ?? m.Attachments ?? null,
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
          for (const m of older) if (m.senderUserId) this.ensureUserProfile(m.senderUserId);
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
    if (!this.selectedGroupId || this.isSendingGroup) return;
    const content: string = (this.groupMessageForm.get('messageContent')?.value ?? '').trim();
    const hasAttachments = this.pendingAttachments.length > 0;
    if (!content && !hasAttachments) return;

    this.isSendingGroup = true;
    const send = (attachmentsJson: string | null) => {
      this.chatService.sendGroupMessage(this.selectedGroupId!, content, this.currentUserId, attachmentsJson).then(() => {
        this.groupMessageForm.reset();
        for (const p of this.pendingAttachments) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        this.pendingAttachments = [];
        this.isSendingGroup = false;
        this.loadUserGroups();
      }).catch(() => { this.isSendingGroup = false; });
    };

    if (!hasAttachments) {
      send(null);
      return;
    }
    const uploads = this.pendingAttachments.map(p =>
      this.empService.uploadEmployeeFile(p.file, p.file.name).pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
    );
    forkJoin(uploads).subscribe((results) => {
      const ok: ChatAttachment[] = [];
      results.forEach((r, i) => {
        if (!r || !r.fileId) return;
        const f = this.pendingAttachments[i].file;
        ok.push({ fileId: r.fileId, fileName: r.fileName ?? f.name, contentType: f.type || undefined, size: f.size });
      });
      if (ok.length === 0 && !content) {
        this.isSendingGroup = false;
        return;
      }
      send(ok.length > 0 ? JSON.stringify(ok) : null);
    });
  }

  deleteGroupMessage(messageId: number): void {
    this.confirmationService.confirm({
      message: 'Are you sure you want to delete this message?',
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      accept: () => {
        this.chatService.deleteGroupMessage(messageId).then(() => {
          const m = this.groupMessages.find(x => x.messageId === messageId);
          if (m) m.isDeleted = true;
        }).catch(() => {});
      }
    });
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
        next: (users) => {
          this.chatUsers = users ?? [];
          this.loadingChatUsers = false;
          for (const u of this.chatUsers) this.ensureUserProfile(u.userId);
        },
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
    const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
    this.canInsert = _perms.canInsert;
    this.canUpdate = _perms.canUpdate;
    this.canDelete = _perms.canDelete;

    const auth = JSON.parse(sessionStorage.getItem('auth') ?? localStorage.getItem('auth') ?? '{}');
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

    this.chatService.onlineUserIds$
      .pipe(takeUntil(this.destroy$))
      .subscribe(ids => {
        this.onlineUserIds = ids;
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
            attachments: payload.attachments ?? null,
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

    this.chatService.unreadOverlay$
      .pipe(takeUntil(this.destroy$))
      .subscribe(map => {
        this.unreadOverlay = map;
      });

    this.chatService.groupUnreadOverlay$
      .pipe(takeUntil(this.destroy$))
      .subscribe(map => {
        this.groupUnreadOverlay = map;
      });

    this.searchText$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((q) => {
          const raw = (q ?? '').trim();
          if (!raw) {
            this.messageSearchLoading = false;
            return of<DirectMessageSearchResult[]>([]);
          }
          this.messageSearchLoading = true;
          return this.chatService.searchDirectMessages(raw, 50).pipe(
            catchError(() => of<DirectMessageSearchResult[]>([]))
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((results) => {
        this.messageSearchResults = results ?? [];
        this.messageSearchLoading = false;
        for (const r of this.messageSearchResults) this.ensureUserProfile(r.otherUserId);
      });

    this.chatService.myDirectSeenForSender$
      .pipe(takeUntil(this.destroy$))
      .subscribe((senderUserId) => {
        if (!senderUserId) return;
        const conv = this.directConversations.find(c => c.otherUserId === senderUserId);
        if (conv) conv.unreadCount = 0;
        const fconv = this.filteredDirectConversations.find(c => c.otherUserId === senderUserId);
        if (fconv) fconv.unreadCount = 0;
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
        if (!payload) return;
        const isOwn = payload.senderUserId === this.currentUserId;
        const isViewing = payload.groupId === this.selectedGroupId;

        if (isViewing && !this.groupMessages.some(m => m.messageId === payload.messageId)) {
          this.groupMessages.push({
            messageId: payload.messageId,
            groupId: payload.groupId,
            senderUserId: payload.senderUserId,
            senderUserName: payload.senderName,
            messageContent: payload.messageContent,
            attachments: payload.attachments ?? null,
            sentTime: payload.sentTime ? new Date(payload.sentTime) : new Date(),
            isDeleted: false,
            isSeen: false
          });
          if (payload.senderUserId) this.ensureUserProfile(payload.senderUserId);
          this.shouldScrollGroup = true;
          if (this.selectedGroupId && !isOwn)
            this.chatService.markGroupMessagesAsSeen(this.selectedGroupId, [payload.messageId]).catch(() => {});
        }
        if (!isViewing && !isOwn && payload.groupId) {
          this.chatService.bumpGroupUnreadOverlay(payload.groupId);
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

    this.chatService.groupRenamed$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { groupId: number; groupName: string }) => {
        if (!payload) return;
        if (this.selectedGroup && this.selectedGroupId === payload.groupId) {
          this.selectedGroup.groupName = payload.groupName;
        }
        const g = this.userGroups.find(gr => gr.groupId === payload.groupId);
        if (g) g.groupName = payload.groupName;
      });

    this.chatService.groupDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: { groupId: number }) => {
        if (!payload?.groupId) return;
        this.handleGroupGone(payload.groupId);
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
          this.prefetchConversationProfiles();
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
    this.ensureUserProfile(conv.otherUserId);
    this.chatService.clearUnreadOverlay(conv.otherUserId);
    conv.unreadCount = 0;
    this.clearPendingAttachments();
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
          this.shouldScroll = this.pendingScrollToMessageId == null;
          this.messagesLoading = false;
          this.markConversationAsSeen();
          this.resolvePendingScroll();
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
      attachments: m.attachments ?? m.Attachments ?? null,
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
          if (container && older.length > 0 && this.pendingScrollToMessageId == null) {
            setTimeout(() => {
              const newScrollHeight = container.scrollHeight;
              container.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
            }, 0);
          }
          this.resolvePendingScroll();
        },
        error: (err) => {
          console.error('Error loading older messages:', err);
          this.loadingOlder = false;
          this.pendingScrollToMessageId = null;
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
    if (!this.selectedOtherUserId || this.isSending) return;
    const content: string = (this.messageForm.get('messageContent')?.value ?? '').trim();
    const hasAttachments = this.pendingAttachments.length > 0;
    if (!content && !hasAttachments) return;

    this.isSending = true;
    const send = (attachmentsJson: string | null) => {
      this.chatService.sendDirectMessage(this.selectedOtherUserId!, content, this.currentUserId, attachmentsJson).then(() => {
        this.messageForm.reset();
        for (const p of this.pendingAttachments) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        this.pendingAttachments = [];
        this.isSending = false;
        this.loadDirectConversations();
      }).catch(() => {
        this.isSending = false;
      });
    };

    if (!hasAttachments) {
      send(null);
      return;
    }
    // Upload every file first, then send the message with the attachments JSON.
    const uploads = this.pendingAttachments.map(p =>
      this.empService.uploadEmployeeFile(p.file, p.file.name).pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
    );
    forkJoin(uploads).subscribe((results) => {
      const ok: ChatAttachment[] = [];
      results.forEach((r, i) => {
        if (!r || !r.fileId) return;
        const f = this.pendingAttachments[i].file;
        ok.push({ fileId: r.fileId, fileName: r.fileName ?? f.name, contentType: f.type || undefined, size: f.size });
      });
      if (ok.length === 0 && !content) {
        this.isSending = false;
        return;
      }
      send(ok.length > 0 ? JSON.stringify(ok) : null);
    });
  }

  deleteMessage(messageId: number): void {
    this.confirmationService.confirm({
      message: 'Delete this message? It can only be deleted before the recipient sees it.',
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      accept: () => {
        this.chatService.deleteDirectMessage(messageId).then(() => {
          const m = this.messages.find(x => x.messageId === messageId);
          if (m) m.isDeleted = true;
        }).catch(() => {});
      }
    });
  }

  onSelectUserChat(): void {
    this.showSelectUserModal = true;
    this.loadingChatUsers = true;
    this.chatUsers = [];
    this.chatUsersSearch = '';
    this.chatService.getChatUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.chatUsers = users;
          this.loadingChatUsers = false;
          for (const u of this.chatUsers) this.ensureUserProfile(u.userId);
        },
        error: (err) => {
          console.error('Error loading chat users:', err);
          this.loadingChatUsers = false;
        }
      });
  }

  closeSelectUserModal(): void {
    this.showSelectUserModal = false;
    this.chatUsersSearch = '';
  }

  /** Filtered chat users for the user-picker modal (searches rank+name and userName). */
  filteredChatUsers(): ChatUserDto[] {
    const q = (this.chatUsersSearch || '').trim().toLowerCase();
    if (!q) return this.chatUsers;
    return this.chatUsers.filter((u) => {
      const rankName = this.getRankAndName(u.userId).toLowerCase();
      const userName = (u.userName || '').toLowerCase();
      return rankName.includes(q) || userName.includes(q);
    });
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
    const raw = (this.searchText ?? '').trim();
    if (!raw) {
      this.filteredDirectConversations = this.directConversations;
      this.messageSearchResults = [];
      this.messageSearchLoading = false;
      this.searchText$.next('');
      return;
    }
    const search = raw.toLowerCase();
    this.filteredDirectConversations = this.directConversations.filter(c => {
      const rankName = this.getRankAndName(c.otherUserId).toLowerCase();
      const userName = this.getChatUserName(c.otherUserId).toLowerCase();
      const last = (c.lastMessage ?? '').toLowerCase();
      return rankName.includes(search) || userName.includes(search) || last.includes(search);
    });
    for (const u of this.searchResultUsers()) this.ensureUserProfile(u.userId);
    this.searchText$.next(raw);
  }

  /** Jump to the conversation that contains a matched message, then scroll to and highlight it. */
  openSearchResult(result: DirectMessageSearchResult): void {
    if (!result?.otherUserId) return;
    this.pendingScrollToMessageId = result.messageId;
    this.pendingScrollPagesLeft = 20; // hard cap so an unfindable id can't cause endless paging
    const existing = this.directConversations.find(c => c.otherUserId === result.otherUserId);
    if (existing) {
      this.selectConversation(existing);
    } else {
      const newConv: DirectConversation = {
        otherUserId: result.otherUserId,
        lastMessage: result.messageContent,
        lastMessageDate: new Date(result.sentTime),
        unreadCount: 0
      };
      this.directConversations = [newConv, ...this.directConversations];
      this.filterDirectConversations();
      this.selectConversation(newConv);
    }
    this.searchText = '';
    this.filterDirectConversations();
  }

  /** Scroll the messages container to the message with the given id and pulse a highlight. */
  private scrollToMessage(messageId: number): void {
    if (!this.messagesContainer) return;
    const container = this.messagesContainer.nativeElement;
    const el = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('chat-message-highlight');
    setTimeout(() => el.classList.remove('chat-message-highlight'), 2200);
  }

  /** Recursively page older messages until we find the target id (or run out / hit the cap). */
  private resolvePendingScroll(): void {
    const target = this.pendingScrollToMessageId;
    if (target == null) return;
    const found = this.messages.some(m => m.messageId === target);
    if (found) {
      this.pendingScrollToMessageId = null;
      this.pendingScrollPagesLeft = 0;
      setTimeout(() => this.scrollToMessage(target), 120);
      return;
    }
    if (!this.hasMoreOlder || this.loadingOlder || this.pendingScrollPagesLeft <= 0) {
      this.pendingScrollToMessageId = null;
      this.pendingScrollPagesLeft = 0;
      return;
    }
    this.pendingScrollPagesLeft--;
    this.loadOlderMessages();
  }

  /** Chat users matching the search query that don't already have a conversation (for "start a new chat" suggestions). */
  searchResultUsers(): ChatUserDto[] {
    const raw = (this.searchText ?? '').trim();
    if (!raw) return [];
    const search = raw.toLowerCase();
    const existing = new Set(this.directConversations.map(c => c.otherUserId));
    return this.chatUsers.filter(u => {
      if (!u.userId || u.userId === this.currentUserId) return false;
      if (existing.has(u.userId)) return false;
      const rankName = this.getRankAndName(u.userId).toLowerCase();
      const userName = (u.userName ?? '').toLowerCase();
      return rankName.includes(search) || userName.includes(search);
    });
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
    for (const userId of Object.keys(this.userProfiles)) {
      const url = this.userProfiles[userId]?.profileImageUrl;
      if (url) URL.revokeObjectURL(url);
    }
    this.userProfiles = {};
    for (const p of this.pendingAttachments) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    this.pendingAttachments = [];
    for (const id of Object.keys(this.attachmentBlobUrls)) {
      const url = this.attachmentBlobUrls[+id];
      if (url) URL.revokeObjectURL(url);
    }
    this.attachmentBlobUrls = {};
    this.attachmentFetchInflight = {};
    this.destroy$.next();
    this.destroy$.complete();
  }
}
