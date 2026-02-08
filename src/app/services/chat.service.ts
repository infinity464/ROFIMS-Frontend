import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { ChatUserDto, DirectConversation, DirectMessageDto } from '@/models/chat.model';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private chatApi = `${environment.apis.core}/Chat`;
  private hubConnection: HubConnection | null = null;

  private directMessageReceivedSubject = new Subject<any>();
  public directMessageReceived$ = this.directMessageReceivedSubject.asObservable();

  private directMessagesSeenSubject = new Subject<{ messageIds: number[] }>();
  public directMessagesSeen$ = this.directMessagesSeenSubject.asObservable();

  private directMessageDeletedSubject = new Subject<{ messageId: number }>();
  public directMessageDeleted$ = this.directMessageDeletedSubject.asObservable();

  private connectionStatusSubject = new BehaviorSubject<boolean>(false);
  public connectionStatus$ = this.connectionStatusSubject.asObservable();

  private errorSubject = new Subject<string>();
  public error$ = this.errorSubject.asObservable();

  /** Currently selected conversation (set by chat page). Used to avoid showing bubble when user is already in that chat. */
  private selectedOtherUserIdSubject = new BehaviorSubject<string | null>(null);
  public selectedOtherUserId$ = this.selectedOtherUserIdSubject.asObservable();

  /** Request to open chat with this user (e.g. from floating bubble click). Chat page reads and clears. */
  private openConversationUserId: string | null = null;

  constructor(private http: HttpClient) {
    this.initializeHubConnection();
  }

  private getAccessToken(): string | null {
    const token = localStorage.getItem('token');
    if (token) return token;
    try {
      const auth = localStorage.getItem('auth');
      if (auth) {
        const parsed = JSON.parse(auth) as { token?: string };
        return parsed?.token ?? null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private initializeHubConnection(): void {
    const apiUrl = environment.apis.core.replace(/\/api\/?$/, '');

    this.hubConnection = new HubConnectionBuilder()
      .withUrl(`${apiUrl}/hubs/chat`, {
        accessTokenFactory: () => this.getAccessToken() || '',
        withCredentials: true
      })
      .withAutomaticReconnect([0, 0, 0, 1000, 3000, 5000])
      .build();

    this.setupHubListeners();
  }

  private setupHubListeners(): void {
    if (!this.hubConnection) return;

    this.hubConnection.on('DirectMessageReceived', (payload: any) => {
      this.directMessageReceivedSubject.next(payload);
    });
    this.hubConnection.on('DirectMessagesSeen', (payload: { messageIds: number[] }) => {
      this.directMessagesSeenSubject.next(payload);
    });
    this.hubConnection.on('DirectMessageDeleted', (payload: { messageId: number }) => {
      this.directMessageDeletedSubject.next(payload);
    });

    this.hubConnection.on('Error', (message: string) => {
      this.errorSubject.next(message);
    });

    this.hubConnection.onreconnecting(() => {
      this.connectionStatusSubject.next(false);
    });

    this.hubConnection.onreconnected(() => {
      this.connectionStatusSubject.next(true);
    });
  }

  connectToHub(): Promise<void> {
    if (!this.hubConnection) {
      return Promise.reject('Hub not initialized');
    }

    if (this.hubConnection.state === HubConnectionState.Connected) {
      this.connectionStatusSubject.next(true);
      return Promise.resolve();
    }

    if (this.hubConnection.state === HubConnectionState.Disconnected) {
      return this.hubConnection.start().then(() => {
        this.connectionStatusSubject.next(true);
      }).catch(err => {
        this.errorSubject.next(`Failed to connect: ${err.message}`);
        return Promise.reject(err);
      });
    }

    return Promise.resolve();
  }

  disconnectFromHub(): Promise<void> {
    if (!this.hubConnection) {
      return Promise.resolve();
    }

    if (this.hubConnection.state === HubConnectionState.Connected) {
      return this.hubConnection.stop().then(() => {
        this.connectionStatusSubject.next(false);
      });
    }
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.hubConnection?.state === HubConnectionState.Connected;
  }

  getChatUsers(): Observable<ChatUserDto[]> {
    return this.http.get<ChatUserDto[]>(`${this.chatApi}/GetChatUsers`);
  }

  getDirectConversations(): Observable<DirectConversation[]> {
    return this.http.get<DirectConversation[]>(`${this.chatApi}/GetDirectConversations`);
  }

  getDirectMessages(otherUserId: string, pageNumber: number = 1, pageSize: number = 50): Observable<DirectMessageDto[]> {
    return this.http.get<DirectMessageDto[]>(`${this.chatApi}/GetDirectMessages`, {
      params: { otherUserId, pageNumber: pageNumber.toString(), pageSize: pageSize.toString() }
    });
  }

  sendDirectMessage(receiverUserId: string, content: string, senderUserId?: string | null): Promise<void> {
    if (!this.hubConnection) {
      return Promise.reject('Hub not connected');
    }
    return this.hubConnection.invoke('SendDirectMessage', senderUserId ?? '', receiverUserId, content).catch(err => {
      this.errorSubject.next(`Error sending: ${err.message}`);
      return Promise.reject(err);
    });
  }

  sendDirectMessageViaApi(receiverUserId: string, content: string, senderUserId?: string | null): Observable<any> {
    return this.http.post(`${this.chatApi}/SendDirectMessage`, {
      senderUserId: senderUserId ?? undefined,
      receiverUserId,
      messageContent: content
    });
  }

  markDirectMessagesAsSeen(senderUserId: string): Promise<void> {
    if (!this.hubConnection) return Promise.reject('Hub not connected');
    return this.hubConnection.invoke('MarkDirectMessagesAsSeen', senderUserId).catch(() => {});
  }

  markDirectMessagesAsSeenViaApi(senderUserId: string): Observable<any> {
    return this.http.post(`${this.chatApi}/MarkDirectMessagesAsSeen`, { senderUserId });
  }

  deleteDirectMessage(messageId: number): Promise<void> {
    if (!this.hubConnection) return Promise.reject('Hub not connected');
    return this.hubConnection.invoke('DeleteDirectMessage', messageId).catch(err => {
      this.errorSubject.next(err?.message ?? 'Delete failed');
      return Promise.reject(err);
    });
  }

  private lastViewedUserId: string | null = null;

  setSelectedConversation(otherUserId: string | null): void {
    if (otherUserId != null) {
      this.lastViewedUserId = null;
      this.selectedOtherUserIdSubject.next(otherUserId);
    } else {
      this.lastViewedUserId = this.selectedOtherUserIdSubject.getValue();
      this.selectedOtherUserIdSubject.next(null);
    }
  }

  /** Current selected conversation (for floating widget to clear read bubbles). */
  getSelectedOtherUserId(): string | null {
    return this.selectedOtherUserIdSubject.getValue();
  }

  /** When leaving chat page, widget can clear the bubble for whoever was being viewed. */
  getAndClearLastViewedUserId(): string | null {
    const id = this.lastViewedUserId;
    this.lastViewedUserId = null;
    return id;
  }

  requestOpenConversation(userId: string): void {
    this.openConversationUserId = userId;
  }

  getAndClearOpenConversationUserId(): string | null {
    const id = this.openConversationUserId;
    this.openConversationUserId = null;
    return id;
  }
}
