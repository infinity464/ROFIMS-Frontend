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
