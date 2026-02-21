import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface AppNotification {
  id: string;
  type: 'leaveApproval';
  title: string;
  message: string;
  link?: string;
  data?: { leaveApplicationId?: number };
  createdAt: Date;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  add(notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): void {
    const item: AppNotification = {
      ...notification,
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
      read: false
    };
    this.notificationsSubject.next([item, ...this.notificationsSubject.value]);
  }

  markAsRead(id: string): void {
    const list = this.notificationsSubject.value.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    this.notificationsSubject.next(list);
  }

  markAllAsRead(): void {
    const list = this.notificationsSubject.value.map((n) => ({ ...n, read: true }));
    this.notificationsSubject.next(list);
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
