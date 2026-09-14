import { Injectable } from '@angular/core';
import { getAuthItem, setAuthItem } from './auth-storage';
import type { MyUserAccessRules } from '@/models/identity.model';

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
     * The current user's user-management rules (which roles' users they may see / manage), as stored
     * from the login response. Pages that depend on them re-read `IdentityService.getMyUserAccessRules()`
     * and save the fresh copy with {@link setUserAccessRules}, so rule changes apply without a new login.
     * The API enforces the same rules — this copy only decides what the UI shows.
     */
    getUserAccessRules(): MyUserAccessRules {
        const info = this.readAuth();
        return {
            hasFullUserAccess: info?.hasFullUserAccess === true,
            rules: Array.isArray(info?.userAccessRules) ? info.userAccessRules : []
        };
    }

    /** All six actions on all roles — may edit role permissions and the session policy. */
    hasFullUserAccess(): boolean {
        return this.getUserAccessRules().hasFullUserAccess;
    }

    /** Stores a fresh copy of the current user's rules into the cached auth object. */
    setUserAccessRules(value: MyUserAccessRules): void {
        const info = this.readAuth();
        if (!info) return;
        info.userAccessRules = Array.isArray(value?.rules) ? value.rules : [];
        info.hasFullUserAccess = value?.hasFullUserAccess === true;
        delete info.canResetRoleIds; // legacy field from before RoleUserAccessRules
        setAuthItem('auth', JSON.stringify(info));
    }

    private readAuth(): any | null {
        const auth = getAuthItem('auth');
        if (!auth) return null;
        try {
            return JSON.parse(auth);
        } catch {
            return null;
        }
    }

    getCurrentDateTime(){
        return new Date().toISOString();
    }
}
