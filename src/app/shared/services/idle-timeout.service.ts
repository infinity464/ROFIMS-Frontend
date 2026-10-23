import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication';
import { SessionPolicyService } from './session-policy.service';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'wheel'] as const;

/**
 * Tracks user activity on `document`. After `idleTimeoutMinutes` of no activity, signs the user out
 * and redirects to /login. A warning toast appears 60s before logout (or earlier if the timeout
 * is less than 2 minutes).
 *
 * Boot once via APP_INITIALIZER. Reads minutes live from SessionPolicyService.policy$ so admin
 * changes apply without a reload.
 */
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService {
  private auth = inject(AuthenticationService);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private policy = inject(SessionPolicyService);
  private zone = inject(NgZone);

  private idleTimeoutMs = 10 * 60_000;
  private warningLeadMs = 60_000;
  private logoutTimer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private listener: (() => void) | null = null;
  private started = false;
  /** True while the centered warning toast is visible. Used to dismiss on next activity. */
  private warningShown = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.policy.policy$.subscribe((p) => {
      const minutes = Math.max(1, Math.min(1440, p?.idleTimeoutMinutes ?? 10));
      this.idleTimeoutMs = minutes * 60_000;
      // Warning lead: 60s by default, but never more than half the timeout (so a 1-min policy still warns).
      this.warningLeadMs = Math.min(60_000, Math.max(5_000, Math.floor(this.idleTimeoutMs / 2)));
      this.scheduleNext();
    });

    // Run listeners outside Angular so mousemove doesn't trigger change detection on every pixel.
    this.zone.runOutsideAngular(() => {
      const onActivity = () => this.scheduleNext();
      this.listener = onActivity;
      for (const ev of ACTIVITY_EVENTS) {
        document.addEventListener(ev, onActivity, { passive: true });
      }
    });

    this.scheduleNext();
  }

  /** Re-arms both timers based on the current policy. Called on every activity event. */
  private scheduleNext(): void {
    this.clearTimers();
    // Dismiss the centered warning toast the moment the user shows any activity.
    if (this.warningShown) {
      this.zone.run(() => this.messageService.clear('idle'));
      this.warningShown = false;
    }
    if (!this.auth.isLoggedIn()) return;

    const warnAt = Math.max(0, this.idleTimeoutMs - this.warningLeadMs);
    this.warningTimer = setTimeout(() => this.zone.run(() => this.showWarning()), warnAt);
    this.logoutTimer = setTimeout(() => this.zone.run(() => this.doLogout()), this.idleTimeoutMs);
  }

  private clearTimers(): void {
    if (this.logoutTimer) { clearTimeout(this.logoutTimer); this.logoutTimer = null; }
    if (this.warningTimer) { clearTimeout(this.warningTimer); this.warningTimer = null; }
  }

  private showWarning(): void {
    if (!this.auth.isLoggedIn()) return;
    const seconds = Math.round(this.warningLeadMs / 1000);
    this.warningShown = true;
    this.messageService.add({
      key: 'idle',
      severity: 'warn',
      summary: 'Session expiring',
      detail: `You'll be signed out in ${seconds} seconds due to inactivity. Move the mouse to stay signed in.`,
      life: this.warningLeadMs,
      sticky: true,
      closable: false
    });
  }

  private doLogout(): void {
    if (!this.auth.isLoggedIn()) return;
    this.clearTimers();
    this.messageService.clear('idle');
    this.warningShown = false;
    this.auth.logout();
    this.policy.clearCache();
    this.messageService.add({
      key: 'global',
      severity: 'info',
      summary: 'Signed out',
      detail: 'You were signed out due to inactivity.',
      life: 6_000
    });
    this.router.navigate(['/login']);
  }
}
