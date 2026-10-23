import { Injectable } from '@angular/core';
import { getAuthItem } from './auth-storage';

@Injectable({
    providedIn: 'root'
})
export class SharedService {
    getCurrentUser() {
        const auth = getAuthItem('auth');
        if (auth) {
            const userInfo = JSON.parse(auth);
            return userInfo.userName;
        }
        return null;
    }

    /** Returns the identity user ID (userId) from auth. */
    getCurrentUserId(): string | null {
        const auth = getAuthItem('auth');
        if (auth) {
            const userInfo = JSON.parse(auth);
            return userInfo.userId ?? userInfo.id ?? null;
        }
        return null;
    }

    /**
     * Role IDs the current user is allowed to reset passwords for.
     * `["*"]` = any role; `[]` = none.
     * Defensive: the backend wire shape is an array, but tolerate a JSON-string payload
     * in case a stale cached token from an older deploy is still in localStorage.
     */
    getCurrentResetRoleIds(): string[] {
        const auth = getAuthItem('auth');
        if (!auth) return [];
        try {
            const info = JSON.parse(auth);
            const raw = info?.canResetRoleIds;
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string' && raw.trim()) {
                try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            }
            return [];
        } catch {
            return [];
        }
    }

    getCurrentDateTime(){
        return new Date().toISOString();
    }
}
