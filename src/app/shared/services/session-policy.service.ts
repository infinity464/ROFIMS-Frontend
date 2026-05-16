import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { IdentityService } from '@/services/identity.service';
import { rebalanceAuthStorage } from './auth-storage';

export interface SessionPolicy {
  idleTimeoutMinutes: number;
  logoutOnBrowserClose: boolean;
}

const CACHE_KEY = 'session_policy';
const DEFAULT_POLICY: SessionPolicy = {
  idleTimeoutMinutes: 10,
  logoutOnBrowserClose: false
};

/**
 * Owns the singleton session policy:
 *   - Reads it from the API on app bootstrap (and on demand).
 *   - Caches it in localStorage so AuthenticationService can pick the right storage backend
 *     even before a network round-trip on page load.
 *   - Exposes a BehaviorSubject so the IdleTimeoutService can react to live changes.
 */
@Injectable({ providedIn: 'root' })
export class SessionPolicyService {
  private identity = inject(IdentityService);
  private readonly _policy$ = new BehaviorSubject<SessionPolicy>(this.readCache() ?? DEFAULT_POLICY);

  /** Live policy. Subscribers are notified whenever load() / update() refresh the cache. */
  readonly policy$: Observable<SessionPolicy> = this._policy$.asObservable();

  /** Snapshot of the current cached policy (synchronous; fine for AuthenticationService boot path). */
  current(): SessionPolicy {
    return this._policy$.value;
  }

  /** Fetches from the API and refreshes the cache + observable. Safe to call after every login. */
  load(): Observable<SessionPolicy> {
    return this.identity.getSessionPolicy().pipe(
      tap((policy) => this.commit(policy ?? DEFAULT_POLICY))
    );
  }

  /** Admin-only: updates the policy and refreshes the cache on success. */
  update(next: SessionPolicy): Observable<{ isSuccess: boolean; message: string }> {
    return this.identity.updateSessionPolicy(next).pipe(
      tap((res) => {
        if (res?.isSuccess) this.commit(next);
      })
    );
  }

  /** Wipes the cache (used on logout so the next login re-fetches). */
  clearCache(): void {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    this._policy$.next(DEFAULT_POLICY);
  }

  private commit(policy: SessionPolicy): void {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(policy)); } catch { /* ignore */ }
    this._policy$.next(policy);
    // Migrate any existing auth values to the storage tier the new policy demands.
    // Without this, a user who logged in before the flag was enabled would stay in localStorage.
    rebalanceAuthStorage();
  }

  private readCache(): SessionPolicy | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.idleTimeoutMinutes !== 'number' || typeof parsed?.logoutOnBrowserClose !== 'boolean') return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
