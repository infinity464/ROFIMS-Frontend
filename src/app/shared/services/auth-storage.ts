/**
 * Storage shim for auth-related keys (`auth`, `token`, `refreshToken`).
 *
 * The session policy (cached at `localStorage['session_policy']`) decides whether the auth lives
 * in sessionStorage (when `logoutOnBrowserClose === true`, so closing the tab logs the user out)
 * or localStorage (default — survives browser close).
 *
 * Reads check both tiers (sessionStorage first), so legacy data left in the other tier still works
 * during the migration window.
 */

export type AuthKey = 'auth' | 'token' | 'refreshToken';

const AUTH_KEYS: ReadonlyArray<AuthKey> = ['auth', 'token', 'refreshToken'];

/** Reads the cached `logoutOnBrowserClose` flag without going through Angular DI. */
export function isCloseLogoutEnabled(): boolean {
  try {
    const raw = localStorage.getItem('session_policy');
    if (!raw) return false;
    return JSON.parse(raw)?.logoutOnBrowserClose === true;
  } catch {
    return false;
  }
}

/** Returns the storage tier the policy currently dictates for new writes. */
export function authStorage(): Storage {
  return isCloseLogoutEnabled() ? sessionStorage : localStorage;
}

/** Reads from sessionStorage first, then localStorage. Returns `null` if neither has the key. */
export function getAuthItem(key: AuthKey): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

/** Writes to the policy-dictated tier and removes any stale copy in the other tier. */
export function setAuthItem(key: AuthKey, value: string): void {
  const target = authStorage();
  target.setItem(key, value);
  const other = target === sessionStorage ? localStorage : sessionStorage;
  other.removeItem(key);
}

/** Removes the key from both tiers (defensive — avoids stale data on the unused side). */
export function removeAuthItem(key: AuthKey): void {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}

/** Wipes every auth key from both tiers. Used by `logout()`. */
export function clearAllAuth(): void {
  for (const k of AUTH_KEYS) removeAuthItem(k);
}

/**
 * Moves any existing auth values into the storage tier the current policy demands.
 * Call after the cached `session_policy` changes — e.g. after `SessionPolicyService.load()` /
 * `update()` — so a user who logged in BEFORE the flag was enabled (auth ended up in
 * localStorage) gets their auth migrated to sessionStorage without having to log in again.
 */
export function rebalanceAuthStorage(): void {
  for (const k of AUTH_KEYS) {
    const value = getAuthItem(k);
    if (value !== null) {
      setAuthItem(k, value);
    }
  }
}

