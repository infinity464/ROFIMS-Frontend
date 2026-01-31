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

    getCurrentDateTime(){
        return new Date().toISOString();
    }
}
