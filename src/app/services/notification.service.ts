import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

// #region agent log
const _log = (m: string, d: Record<string, unknown>) => fetch('http://127.0.0.1:7682/ingest/24c52934-7935-4f35-a09e-2dbd51502872', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3a6509' }, body: JSON.stringify({ sessionId: '3a6509', location: 'notification.service', message: m, data: d, timestamp: Date.now(), hypothesisId: d['h'] as string }) }).catch(() => {});
// #endregion
import { environment } from '@/Core/Environments/environment';

export type NotificationType = 'leaveApproval' | string;

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
  createdAt: Date;
  read: boolean;
}

interface NotificationApiDto {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  data?: string;
  read: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = `${environment.apis.core}/Notification`;
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  constructor(private http: HttpClient) {}

  add(notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & { serverId?: number }): void {
    _log('add notification', { h: 'H5', serverId: notification.serverId });
    const id = notification.serverId != null ? String(notification.serverId) : `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { serverId, ...rest } = notification;
    const item: AppNotification = {
      ...rest,
      id,
      createdAt: new Date(),
      read: false
    };
    this.notificationsSubject.next([item, ...this.notificationsSubject.value]);
  }

  loadFromApi(): void {
    _log('loadFromApi started', { h: 'H2' });
    this.http
      .get<NotificationApiDto[]>(`${this.api}/Get`)
      .pipe(
        tap((dtos) => {
          _log('loadFromApi received', { h: 'H1', dtosLen: dtos?.length ?? 0, firstRead: dtos?.[0]?.read, firstKeys: dtos?.[0] ? Object.keys(dtos[0]) : [] });
          const items: AppNotification[] = dtos.map((d) => {
            let data: Record<string, unknown> | undefined;
            try {
              data = d.data && d.data.trim() ? (JSON.parse(d.data) as Record<string, unknown>) : undefined;
            } catch {
              data = undefined;
            }
            return {
              id: d.id,
              type: d.type,
              title: d.title,
              message: d.message,
              link: d.link,
              data,
              createdAt: new Date(d.createdAt),
              read: d.read
            };
          });
          const unread = items.filter((n) => !n.read).length;
          _log('loadFromApi next', { h: 'H1', itemsLen: items.length, unread });
          this.notificationsSubject.next(items);
        }),
        catchError((err) => {
          _log('loadFromApi error', { h: 'H2', err: String(err?.message ?? err) });
          return of([]);
        })
      )
      .subscribe();
  }

  private isServerId(id: string): boolean {
    return /^\d+$/.test(id);
  }

  markAsRead(id: string): void {
    const list = this.notificationsSubject.value.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    this.notificationsSubject.next(list);
    if (this.isServerId(id)) {
      this.http.patch(`${this.api}/MarkRead/${id}`, {}).pipe(catchError(() => of(null))).subscribe();
    }
  }

  markAllAsRead(): void {
    const list = this.notificationsSubject.value.map((n) => ({ ...n, read: true }));
    this.notificationsSubject.next(list);
    this.http.patch(`${this.api}/MarkAllRead`, {}).pipe(catchError(() => of(null))).subscribe();
  }

  clear(id: string): void {
    this.notificationsSubject.next(
      this.notificationsSubject.value.filter((n) => n.id !== id)
    );
  }

  getUnreadCount(): number {
    return this.notificationsSubject.value.filter((n) => !n.read).length;
  }

  get notifications(): AppNotification[] {
    return this.notificationsSubject.value;
  }
}
