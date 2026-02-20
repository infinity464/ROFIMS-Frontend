import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class SharedService {
    getCurrentUser() {
        const auth = localStorage.getItem('auth');
        if (auth) {
            const userInfo = JSON.parse(auth);
            return userInfo.userName;
        }
        return null;
    }

    /** Returns the identity user ID (userId) from auth. */
    getCurrentUserId(): string | null {
        const auth = localStorage.getItem('auth');
        if (auth) {
            const userInfo = JSON.parse(auth);
            return userInfo.userId ?? userInfo.id ?? null;
        }
        return null;
    }

    getCurrentDateTime(){
        return new Date().toISOString();
    }
}
