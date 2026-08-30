export interface ChatUserDto {
  userId: string;
  userName: string;
  email: string;
}

export interface DirectConversation {
  otherUserId: string;
  lastMessage: string;
  lastMessageDate: Date;
  unreadCount: number;
}

export interface ChatAttachment {
  fileId: number;
  fileName: string;
  contentType?: string;
  size?: number;
}

export interface DirectMessageDto {
  messageId: number;
  senderUserId: string;
  receiverUserId: string;
  messageContent: string;
  /** JSON string from server; parse to ChatAttachment[]. */
  attachments?: string | null;
  sentTime: Date;
  isSeen: boolean;
  isDeleted: boolean;
}

export interface DirectMessageSearchResult {
  messageId: number;
  senderUserId: string;
  receiverUserId: string;
  /** Counterpart of the searching user — the conversation partner. */
  otherUserId: string;
  messageContent: string;
  sentTime: Date | string;
  isSeen: boolean;
}

// ----- Group chat -----

export interface GroupDto {
  groupId: number;
  groupName: string;
  createdByUserId: string;
  createdByUserName?: string;
  memberCount: number;
  myRole: string;
  lastMessageAt?: Date | string | null;
  lastMessagePreview?: string | null;
  /** Server-reported unread count (best-effort: messages from others still flagged !IsSeen). */
  unreadCount?: number;
  /** Optional FileID for the group's avatar image. Resolved to a blob URL by the empService.downloadFile flow. */
  groupImageFileId?: number | null;
}

export interface GroupMemberDto {
  memberId: number;
  userId: string;
  userName?: string;
  email?: string;
  role: string;
  joinedAt: Date | string;
}

export interface GroupMessageDto {
  messageId: number;
  groupId: number;
  senderUserId: string;
  senderUserName?: string;
  messageContent: string;
  /** JSON string from server; parse to ChatAttachment[]. */
  attachments?: string | null;
  sentTime: Date | string;
  isDeleted: boolean;
  /** True if the message has been seen; when true, sender cannot delete. */
  isSeen?: boolean;
}
