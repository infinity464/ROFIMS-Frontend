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

export interface DirectMessageDto {
  messageId: number;
  senderUserId: string;
  receiverUserId: string;
  messageContent: string;
  sentTime: Date;
  isSeen: boolean;
  isDeleted: boolean;
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
  sentTime: Date | string;
  isDeleted: boolean;
  /** True if the message has been seen; when true, sender cannot delete. */
  isSeen?: boolean;
}
